const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { mixBGM } = require("./bgm");
const { uploadToR2 } = require("./r2");
const { HOST_A, HOST_B } = require("./hosts");

const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const MAX_TTS_CHARS = 4000;

// 話者名 → ボイス設定の対応表
const VOICE_BY_NAME = {
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

// 長すぎるセグメントはTTSの上限に収まるよう分割する
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

async function generateAudio(script, apiKey, localDir) {
  try {
    console.log("3. 音声生成(OpenAI TTS / 2声対話)を開始します...");
    const openai = new OpenAI({ apiKey });

    const segments = parseDialogue(script);
    if (segments.length === 0) {
      throw new Error("台本から発話を抽出できませんでした（話者ラベルを確認）。");
    }

    const audioBuffers = [];
    let turn = 0;
    for (const seg of segments) {
      const host = VOICE_BY_NAME[seg.name] || HOST_A;
      for (const chunk of splitLong(seg.text.trim())) {
        turn += 1;
        console.log(`   - 音声生成中 (${turn}発話目 / ${seg.name})...`);
        const mp3 = await openai.audio.speech.create({
          model: TTS_MODEL,
          voice: host.voice,
          input: chunk,
          instructions: host.ttsInstructions,
        });
        audioBuffers.push(Buffer.from(await mp3.arrayBuffer()));
      }
    }

    const finalBuffer = Buffer.concat(audioBuffers);
    const now = new Date();
    const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = jstDate.toISOString().split("T")[0];
    const fileName = `radio_${dateStr}.mp3`;

    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, finalBuffer);
    console.log(`✅ ローカル保存完了: ${localPath}`);

    await mixBGM(localPath);

    const { url: audioUrl, sizeBytes } = await uploadToR2(localPath, fileName);
    return { fileName, audioUrl, sizeBytes, localPath };
  } catch (error) {
    console.error("❌ 音声生成プロセスでエラーが発生しました:", error);
    throw error;
  }
}

module.exports = { generateAudio };
