const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { mixBGM } = require("./bgm");
const { uploadToR2 } = require("./r2");
const { HOST_A, HOST_B } = require("./hosts");

// Gemini-TTS(AI Studio) を使う。Vertex経由でないのでAPIキーで叩ける。
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const MAX_TTS_CHARS = 1200; // 1リクエストあたりの上限（長い発話は句点で分割）
const MAX_ATTEMPTS = 3;

// 話者名 → ホスト設定の対応表
const HOST_BY_NAME = {
  [HOST_A.name]: HOST_A,
  [HOST_B.name]: HOST_B,
};

// 台本を話者ごとのセグメントに分解する。
// 「ミナ: ...」「リク: ...」で始まる行を話者の切り替えとみなし、
// ラベルの無い継続行は直前の話者に連結する。
function parseDialogue(script) {
  const labelRe = new RegExp(
    `^\\s*(${HOST_A.name}|${HOST_B.name})\\s*[:：]\\s*(.*)$`
  );
  const segments = [];
  let current = null;

  for (const rawLine of script.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(labelRe);
    if (m) {
      if (current && current.text.trim()) segments.push(current);
      current = { name: m[1], text: m[2] };
    } else if (current) {
      current.text += " " + line;
    } else {
      // 先頭にラベル無しテキストが来た場合は既定でHOST_Aに割り当てる
      current = { name: HOST_A.name, text: line };
    }
  }
  if (current && current.text.trim()) segments.push(current);
  return segments;
}

// 長すぎるセグメントはTTSの上限に収まるよう句点で分割する
function splitLong(text, max = MAX_TTS_CHARS) {
  if (text.length <= max) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > max) {
    let cut = remaining.lastIndexOf("。", max);
    if (cut < max * 0.5) cut = max; // 句点が見つからなければ強制分割
    parts.push(remaining.slice(0, cut + 1));
    remaining = remaining.slice(cut + 1);
  }
  if (remaining.trim()) parts.push(remaining);
  return parts;
}

// Gemini-TTS で1チャンクを合成。返りは 24kHz/16bit/mono の生PCM。
// TTSモデルが短い掛け声を「返答すべき会話」と誤解して 400 を返すことがあるため、
// 読み上げ機として振る舞わせるプロンプトで囲み、失敗時は指示を強めてリトライする。
async function geminiSynthChunk(apiKey, text, voiceName, styleInstruction, state) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`;
  const clean = text.replace(/[「」]/g, "").trim();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const strictness =
      attempt === 1
        ? ""
        : "【厳守】これは音声合成です。会話ではありません。返事・応答・補足を絶対に生成せず、";
    const prompt =
      `次の「」内のセリフを、${styleInstruction}という声色で、一字一句そのまま読み上げてください。` +
      `${strictness}あなたは音声読み上げ機です。返答・相槌・補足・ナレーションは一切加えず、括弧内のテキストだけを音声化すること。\n` +
      `「${clean}」`;

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        }),
      });
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (part) {
        const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType || "");
        if (rateMatch) state.sampleRate = parseInt(rateMatch[1], 10);
        return Buffer.from(part.inlineData.data, "base64");
      }
      // 音声が返らなかった（テキスト生成に流れた等）→ リトライ
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`音声データが返りません: ${JSON.stringify(data).slice(0, 300)}`);
      }
    } else {
      const bodyText = await res.text();
      const retriable = res.status === 400 || res.status === 429 || res.status >= 500;
      if (!retriable || attempt === MAX_ATTEMPTS) {
        throw new Error(`Gemini TTS 失敗 (${res.status}): ${bodyText.slice(0, 300)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
}

// 生PCM(s16le/mono) を ffmpeg で MP3 にエンコードする
function pcmToMp3(pcmPath, mp3Path, sampleRate) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-f", "s16le",
      "-ar", String(sampleRate),
      "-ac", "1",
      "-i", pcmPath,
      "-codec:a", "libmp3lame",
      "-b:a", "128k",
      mp3Path,
    ]);
    let err = "";
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("error", (e) => reject(new Error(`ffmpeg起動失敗: ${e.message}`)));
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpegがコード${code}で終了: ${err.slice(-400)}`));
    });
  });
}

// variant = { voiceA, voiceB, mood } / dateStr = "YYYY-MM-DD"(JST)
async function generateAudio(script, apiKey, localDir, variant, dateStr) {
  try {
    console.log(
      `3. 音声生成(Gemini-TTS / 2声対話)を開始します... [声: ${HOST_A.name}=${variant.voiceA} / ${HOST_B.name}=${variant.voiceB} / ムード: ${variant.mood.label}]`
    );
    if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です。");

    const segments = parseDialogue(script);
    if (segments.length === 0) {
      throw new Error("台本から発話を抽出できませんでした（話者ラベルを確認）。");
    }

    // 話者名 → { voice, style } の対応（声はvariant、演技はホスト固有＋今日のムード）
    const cfgByName = {
      [HOST_A.name]: { voice: variant.voiceA, style: `${HOST_A.ttsInstructions} ${variant.mood.style}` },
      [HOST_B.name]: { voice: variant.voiceB, style: `${HOST_B.ttsInstructions} ${variant.mood.style}` },
    };

    const state = { sampleRate: 24000 };
    const pcmParts = [];
    let turn = 0;
    for (const seg of segments) {
      const cfg = cfgByName[seg.name] || cfgByName[HOST_A.name];
      for (const chunk of splitLong(seg.text.trim())) {
        turn += 1;
        console.log(`   - 音声生成中 (${turn}発話目 / ${seg.name} / ${cfg.voice})...`);
        pcmParts.push(await geminiSynthChunk(apiKey, chunk, cfg.voice, cfg.style, state));
      }
    }

    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const fileName = `radio_${dateStr}.mp3`;
    const localPath = path.join(localDir, fileName);

    // 全PCMを連結し、一時ファイル経由で一度だけ MP3 化する
    const pcmPath = path.join(os.tmpdir(), `radio_${dateStr}_${Date.now()}.pcm`);
    fs.writeFileSync(pcmPath, Buffer.concat(pcmParts));
    try {
      await pcmToMp3(pcmPath, localPath, state.sampleRate);
    } finally {
      fs.rmSync(pcmPath, { force: true });
    }
    console.log(`✅ ローカル保存完了: ${localPath}`);

    await mixBGM(localPath, dateStr);

    const { url: audioUrl, sizeBytes } = await uploadToR2(localPath, fileName);
    return { fileName, audioUrl, sizeBytes, localPath };
  } catch (error) {
    console.error("❌ 音声生成プロセスでエラーが発生しました:", error);
    throw error;
  }
}

module.exports = { generateAudio, parseDialogue };
