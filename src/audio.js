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

// Tier 1 の Gemini TTS は 10 RPM。1発話=1リクエストで投げるため、間隔を空けないと
// 開始1分以内に上限へ当たり、短いバックオフでは同じ1分窓の中で全滅する。
// 7秒 ≒ 8.5 RPM でマージンを取る（枠が変わったら環境変数で上書き）。
const MIN_REQUEST_INTERVAL_MS = Number(process.env.GEMINI_TTS_MIN_INTERVAL_MS || 7000);
// 日次クォータ(RPD)超過は復帰が時間単位なので、待たずに落として原因を明示する。
// 分あたり(RPM)超過は数十秒で戻るため、これを境に扱いを分ける。
const HARD_QUOTA_RETRY_SEC = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 話者名 → ホスト設定の対応表
const HOST_BY_NAME = {
  [HOST_A.name]: HOST_A,
  [HOST_B.name]: HOST_B,
};

// リクエスト開始間隔を MIN_REQUEST_INTERVAL_MS 以上に保つ（単発実行スクリプトなのでモジュール内で持つ）
const rateLimiter = { lastStartedAt: 0 };
async function waitForSlot() {
  const waitMs = rateLimiter.lastStartedAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  rateLimiter.lastStartedAt = Date.now();
}

// 429の本文から「どのクォータを超えたか」と「復帰までの秒数」を取り出す。
// Gemini は RetryInfo.retryDelay に "62968s" 形式で復帰時刻を返してくれる。
function parseQuotaError(bodyText) {
  try {
    const err = JSON.parse(bodyText)?.error;
    if (!err) return null;
    const details = err.details || [];
    const violation = details.find((d) =>
      String(d["@type"] || "").endsWith("QuotaFailure")
    )?.violations?.[0];
    const retryDelay = details.find((d) =>
      String(d["@type"] || "").endsWith("RetryInfo")
    )?.retryDelay;
    const retrySec = retryDelay ? parseFloat(String(retryDelay).replace(/s$/, "")) : null;
    return {
      metric: violation?.quotaMetric || null,
      limit: violation?.quotaValue || null,
      retrySec: Number.isFinite(retrySec) ? retrySec : null,
    };
  } catch {
    return null;
  }
}

function fmtDuration(sec) {
  if (sec == null) return "不明";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

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

// Gemini-TTS にリクエストを1回投げてPCMを得る共通処理。返りは 24kHz/16bit/mono の生PCM。
// レート制御・リトライ・429の日次/分切り分け・PCM抽出をここに集約する。
// bodyGen(attempt) は試行ごとの {contents, generationConfig} を返す（リトライ時に指示を強められるよう関数）。
async function sendTTSRequest(apiKey, bodyGen, state) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 10 RPM を超えないよう、前回のリクエスト開始から一定間隔を空ける
    await waitForSlot();

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyGen(attempt)),
        // 詰まったら中断→リトライ。全滅なら throw して run 全体を失敗させる（無限待ち防止）
        signal: AbortSignal.timeout(120000),
      });
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      await sleep(1500 * attempt);
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
        throw new Error(`音声データが返りません: ${JSON.stringify(data).slice(0, 2000)}`);
      }
    } else {
      const bodyText = await res.text();

      if (res.status === 429) {
        const q = parseQuotaError(bodyText);
        // 日次(RPD)超過は待っても数時間戻らない。リトライで潰さず、原因が一目で分かる形で落とす。
        if (q?.retrySec != null && q.retrySec > HARD_QUOTA_RETRY_SEC) {
          throw new Error(
            `Gemini TTS 日次クォータ枯渇 (429): ${q.metric} の上限 ${q.limit} に到達。` +
              `復帰まで約${fmtDuration(q.retrySec)}。日次上限に達したため、同じ日の作り直しはできません。\n応答全文: ${bodyText}`
          );
        }
        if (attempt === MAX_ATTEMPTS) {
          throw new Error(
            `Gemini TTS レート制限が解消しません (429): ${q?.metric || "metric不明"}\n応答全文: ${bodyText}`
          );
        }
        // 分あたり(RPM)超過。APIが返す復帰秒数に従って待つ（無ければ60秒＝1分窓を跨ぐ）
        const waitSec = (q?.retrySec ?? 60) + 2;
        console.log(
          `   ⏳ レート制限(429)。${Math.round(waitSec)}秒待って再試行します (${attempt}/${MAX_ATTEMPTS})`
        );
        await sleep(waitSec * 1000);
        continue;
      }

      const retriable = res.status === 400 || res.status >= 500;
      if (!retriable || attempt === MAX_ATTEMPTS) {
        throw new Error(`Gemini TTS 失敗 (${res.status}): ${bodyText.slice(0, 2000)}`);
      }
    }
    await sleep(1200 * attempt);
  }
}

// 単一話者で1チャンクを合成（フォールバック経路: GEMINI_TTS_SINGLE=true のとき使用）。
// TTSモデルが短い掛け声を「返答すべき会話」と誤解して 400 を返すことがあるため、
// 読み上げ機として振る舞わせるプロンプトで囲み、失敗時は指示を強めてリトライする。
async function geminiSynthChunk(apiKey, text, voiceName, styleInstruction, state) {
  const clean = text.replace(/[「」]/g, "").trim();
  return sendTTSRequest(
    apiKey,
    (attempt) => {
      const strictness =
        attempt === 1
          ? ""
          : "【厳守】これは音声合成です。会話ではありません。返事・応答・補足を絶対に生成せず、";
      const prompt =
        `次の「」内のセリフを、${styleInstruction}という声色で、一字一句そのまま読み上げてください。` +
        `${strictness}あなたは音声読み上げ機です。返答・相槌・補足・ナレーションは一切加えず、括弧内のテキストだけを音声化すること。\n` +
        `「${clean}」`;
      return {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      };
    },
    state
  );
}

// マルチスピーカーで1セクション（話者ラベル付きの会話）をまとめて合成する（既定経路）。
// 1リクエストで2話者分を喋り分けるため、リクエスト数は発話数ではなくセクション数になる
// （1エピソード ~130発話 → ~7セクション。日次100リクエスト制限に収めるための要）。
async function geminiSynthSection(apiKey, sectionText, speakerVoiceConfigs, styleInstruction, state) {
  // 話者ラベルの区切りを半角コロンに正規化（APIが speaker 設定とラベルを確実に対応づけられるように）
  const labelRe = new RegExp(`^\\s*(${HOST_A.name}|${HOST_B.name})\\s*[:：]\\s*`, "gm");
  const normalized = sectionText.replace(labelRe, "$1: ").replace(/[「」]/g, "").trim();

  return sendTTSRequest(
    apiKey,
    () => {
      const prompt =
        `次の${HOST_A.name}と${HOST_B.name}による会話を、${styleInstruction}という雰囲気で、` +
        `台本のとおり自然な掛け合いで読み上げてください。返答・相槌・補足・ナレーションは加えず、` +
        `各話者のセリフだけを音声化すること。\n\n${normalized}`;
      return {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } },
        },
      };
    },
    state
  );
}

// 台本を、話者ラベル付きの会話ブロックにまとめる。マルチスピーカーは1ブロック=1リクエスト。
// 台本は発話ごとに空行が入るため「空行=コーナー境界」では割れない（1発話ずつに割れてしまう）。
// 代わりに発話を順に束ね、1ブロックの文字数が maxChars を超える手前で区切る（発話の途中では切らない）。
// maxChars=2500 は音声にして約8分・出力〜9千トークン相当で、TTSの32kトークン上限に十分収まる。
function splitIntoSections(script, maxChars = 2500) {
  const segments = parseDialogue(script); // [{name, text}] ラベル無し継続行は直前へ連結済み
  const sections = [];
  let buf = [];
  let len = 0;

  for (const seg of segments) {
    const line = `${seg.name}: ${seg.text.trim()}`;
    if (len + line.length > maxChars && buf.length > 0) {
      sections.push(buf.join("\n"));
      buf = [];
      len = 0;
    }
    buf.push(line);
    len += line.length + 1; // +1 は連結する改行分
  }
  if (buf.length > 0) sections.push(buf.join("\n"));
  return sections;
}

// マルチスピーカーの合成単位（＝1リクエスト）を決める。
// scriptSections（script.js が返すコーナー配列 [オープニング, コーナー…, エンディング]）があれば
// それを基準にし、声のドリフトが各ブロックの継ぎ目（＝コーナーの転換点）だけに出るようにする。
// 上限(maxChars)を超えるブロックだけ splitIntoSections で再分割して安全側に倒す。
// scriptSections が無ければ従来の文字数ベース分割にフォールバック（後方互換）。
function buildSections(script, scriptSections) {
  if (Array.isArray(scriptSections) && scriptSections.length > 0) {
    return scriptSections.flatMap((block) => splitIntoSections(block));
  }
  return splitIntoSections(script);
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

// 最終MP3の再生秒数を ffprobe で実測する。取得できなければ null（RSS側で0扱い）。
// ffprobe不在(ローカル等)や失敗は握りつぶして従来どおり0にフォールバックする。
function probeDurationSec(filePath) {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    ff.stdout.on("data", (d) => (out += d.toString()));
    ff.on("error", () => resolve(null));
    ff.on("close", (code) => {
      const sec = parseFloat(out.trim());
      resolve(code === 0 && Number.isFinite(sec) ? Math.round(sec) : null);
    });
  });
}

// variant = { voiceA, voiceB, mood } / dateStr = "YYYY-MM-DD"(JST)
// scriptSections = コーナー単位の分割基準（script.js の返り値。無ければ文字数ベースにフォールバック）
async function generateAudio(script, apiKey, localDir, variant, dateStr, scriptSections = null) {
  try {
    console.log(
      `3. 音声生成(Gemini-TTS / 2声対話)を開始します... [声: ${HOST_A.name}=${variant.voiceA} / ${HOST_B.name}=${variant.voiceB} / ムード: ${variant.mood.label}]`
    );
    if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です。");

    const state = { sampleRate: 24000 };
    const pcmParts = [];

    if (process.env.GEMINI_TTS_SINGLE === "true") {
      // === フォールバック経路: 単一話者（1発話=1リクエスト） ===
      // 発話数がそのままリクエスト数になるため、長い台本では日次100を超える。
      const segments = parseDialogue(script);
      if (segments.length === 0) {
        throw new Error("台本から発話を抽出できませんでした（話者ラベルを確認）。");
      }
      const cfgByName = {
        [HOST_A.name]: { voice: variant.voiceA, style: `${HOST_A.ttsInstructions} ${variant.mood.style}` },
        [HOST_B.name]: { voice: variant.voiceB, style: `${HOST_B.ttsInstructions} ${variant.mood.style}` },
      };
      const jobs = [];
      for (const seg of segments) {
        const cfg = cfgByName[seg.name] || cfgByName[HOST_A.name];
        for (const chunk of splitLong(seg.text.trim())) {
          jobs.push({ name: seg.name, cfg, chunk });
        }
      }
      const etaMin = Math.ceil((jobs.length * MIN_REQUEST_INTERVAL_MS) / 60000);
      console.log(
        `   [単一話者] ${jobs.length}リクエスト / 間隔${MIN_REQUEST_INTERVAL_MS / 1000}秒 → 推定 約${etaMin}分`
      );
      if (jobs.length > 100) {
        console.warn(
          `   ⚠️ リクエスト数(${jobs.length})が日次上限100を超えています。途中で429により失敗する可能性が高いです。`
        );
      }
      let turn = 0;
      for (const job of jobs) {
        turn += 1;
        console.log(`   - 音声生成中 (${turn}/${jobs.length} / ${job.name} / ${job.cfg.voice})...`);
        pcmParts.push(await geminiSynthChunk(apiKey, job.chunk, job.cfg.voice, job.cfg.style, state));
      }
    } else {
      // === 既定経路: マルチスピーカー（1セクション=1リクエスト） ===
      // オープニング・各コーナー・エンディング単位でまとめて2声合成し、リクエスト数を発話数から
      // セクション数(~7)へ激減させる。日次100リクエスト制限に収めるための本線。
      // scriptSections があればコーナー境界で切る（声のドリフトを継ぎ目=転換点に寄せる）。
      const sections = buildSections(script, scriptSections);
      if (sections.length === 0) {
        throw new Error("台本からセクションを抽出できませんでした（話者ラベルを確認）。");
      }
      const style = variant.mood.style;
      const speakerVoiceConfigs = [
        { speaker: HOST_A.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: variant.voiceA } } },
        { speaker: HOST_B.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: variant.voiceB } } },
      ];
      const etaMin = Math.ceil((sections.length * MIN_REQUEST_INTERVAL_MS) / 60000);
      console.log(
        `   [マルチスピーカー] ${sections.length}セクション=${sections.length}リクエスト / 間隔${MIN_REQUEST_INTERVAL_MS / 1000}秒 → 推定 約${etaMin}分`
      );
      for (let i = 0; i < sections.length; i++) {
        console.log(`   - 音声生成中 (${i + 1}/${sections.length}セクション / ${sections[i].length}文字)...`);
        pcmParts.push(await geminiSynthSection(apiKey, sections[i], speakerVoiceConfigs, style, state));
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

    // BGM合成後の最終ファイルで尺を実測（RSSの itunes:duration 用。従来は0固定だった）
    const durationSec = await probeDurationSec(localPath);

    const { url: audioUrl, sizeBytes } = await uploadToR2(localPath, fileName);
    return { fileName, audioUrl, sizeBytes, localPath, durationSec };
  } catch (error) {
    console.error("❌ 音声生成プロセスでエラーが発生しました:", error);
    throw error;
  }
}

module.exports = { generateAudio, parseDialogue, splitIntoSections, buildSections };
