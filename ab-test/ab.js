// A/B TTS 比較ハーネス（本番パイプラインからは独立）
//
// 同一原稿を OpenAI(gpt-4o-mini-tts) と Google Cloud TTS(Chirp 3: HD) の
// 両方で合成し、output/ab_openai.mp3 と output/ab_chirp3.mp3 を吐く。
// エンジン単独の寄与を切り分けるのが目的なので、BGM も R2 もNotionも触らない。
//
// 使い方:
//   node ab-test/ab.js                  … 認証がある全エンジンを合成
//   node ab-test/ab.js gemini           … C(Gemini)だけ合成（A/Bの既存音源は温存）
//   node ab-test/ab.js openai chirp3     … 指定したものだけ合成
//   node ab-test/ab.js --list           … Google側の ja-JP Chirp3-HD ボイス一覧を出すだけ
//
// エンジン名: openai / chirp3 / gemini
//
// 必要な env(.env):
//   OPENAI_API_KEY       … OpenAI側に必要
//   GOOGLE_TTS_API_KEY   … Google側(chirp3/gemini両方)に必要（Cloud TTS 用のAPIキー。GEMINI_API_KEYとは別物）
// 任意の上書き:
//   CHIRP_VOICE_A / CHIRP_VOICE_B   … ミナ/リク に割り当てる Chirp3-HD ボイス名
//   GEMINI_VOICE_A / GEMINI_VOICE_B … ミナ/リク に割り当てる Gemini-TTS ボイス名（星名: Kore, Charon など）
//   GEMINI_TTS_MODEL                … 既定 gemini-2.5-flash-tts（Pro を試すなら gemini-2.5-pro-tts）
require("dotenv").config();
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { HOST_A, HOST_B } = require("../src/hosts");

const SCRIPT_PATH = path.join(__dirname, "sample-script.txt");
const OUT_DIR = path.join(__dirname, "..", "output");
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
// Gemini は Vertex(APIキー不可)を避け、AI Studio の generativelanguage API をAPIキーで叩く。
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_KEY = process.env.GEMINI_API_KEY; // AI Studio のキー（Cloud TTS用のGOOGLE_TTS_API_KEYとは別物）
const GKEY = process.env.GOOGLE_TTS_API_KEY;

// --- 台本を話者ごとに分解（本番 audio.js の parseDialogue と同じ規則） ---
function parseDialogue(script) {
  const labelRe = new RegExp(`^\\s*(${HOST_A.name}|${HOST_B.name})\\s*[:：]\\s*(.*)$`);
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
      current = { name: HOST_A.name, text: line };
    }
  }
  if (current && current.text.trim()) segments.push(current);
  return segments;
}

// --- OpenAI 側 ---
async function synthOpenAI(segments) {
  if (!process.env.OPENAI_API_KEY) {
    console.log("⏭  OPENAI_API_KEY が無いので OpenAI側はスキップ");
    return null;
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const voiceByName = { [HOST_A.name]: HOST_A, [HOST_B.name]: HOST_B };
  const buffers = [];
  for (const [i, seg] of segments.entries()) {
    const host = voiceByName[seg.name] || HOST_A;
    console.log(`   [OpenAI] ${i + 1}/${segments.length} ${seg.name} (${host.voice})`);
    const mp3 = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: host.voice,
      input: seg.text.trim(),
      instructions: host.ttsInstructions,
    });
    buffers.push(Buffer.from(await mp3.arrayBuffer()));
  }
  const out = path.join(OUT_DIR, "ab_openai.mp3");
  fs.writeFileSync(out, Buffer.concat(buffers));
  console.log(`✅ OpenAI → ${out}`);
  return out;
}

// --- Google Cloud TTS (Chirp 3: HD) 側。APIキー方式の REST を直叩き ---
async function googleListVoices() {
  const url = `https://texttospeech.googleapis.com/v1/voices?languageCode=ja-JP&key=${GKEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`voices一覧の取得に失敗 (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.voices || []).filter((v) => /Chirp3-HD/i.test(v.name));
}

async function googleSynthOne(text, voiceName) {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GKEY}`;
  const body = {
    input: { text },
    voice: { languageCode: "ja-JP", name: voiceName },
    audioConfig: { audioEncoding: "MP3" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`synthesize 失敗 (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return Buffer.from(data.audioContent, "base64");
}

async function synthGoogle(segments) {
  if (!GKEY) {
    console.log("⏭  GOOGLE_TTS_API_KEY が無いので Chirp3側はスキップ");
    console.log("    → GCPでCloud Text-to-Speech APIを有効化しAPIキーを作成、.env に GOOGLE_TTS_API_KEY= を追加してください");
    return null;
  }
  const chirp = await googleListVoices();
  if (chirp.length === 0) throw new Error("ja-JP の Chirp3-HD ボイスが見つかりません");
  const females = chirp.filter((v) => v.ssmlGender === "FEMALE");
  const males = chirp.filter((v) => v.ssmlGender === "MALE");
  const voiceA = process.env.CHIRP_VOICE_A || (females[0] || chirp[0]).name; // ミナ=女性
  const voiceB = process.env.CHIRP_VOICE_B || (males[0] || chirp[1] || chirp[0]).name; // リク=男性
  console.log(`   [Chirp3] ${HOST_A.name}=${voiceA} / ${HOST_B.name}=${voiceB}`);

  const voiceByName = { [HOST_A.name]: voiceA, [HOST_B.name]: voiceB };
  const buffers = [];
  for (const [i, seg] of segments.entries()) {
    const vn = voiceByName[seg.name] || voiceA;
    console.log(`   [Chirp3] ${i + 1}/${segments.length} ${seg.name} (${vn})`);
    buffers.push(await googleSynthOne(seg.text.trim(), vn));
  }
  const out = path.join(OUT_DIR, "ab_chirp3.mp3");
  fs.writeFileSync(out, Buffer.concat(buffers));
  console.log(`✅ Chirp3 → ${out}`);
  return out;
}

// --- Gemini-TTS 側。AI Studio の generativelanguage API をAPIキーで叩く（Vertex経由でないのでキー認証OK）。
//     A/Bと同条件にするためセグメント単位・1話者ずつで合成し、ttsInstructions をスタイル指示として前置する。
//     返りは 24kHz/16bit/mono の生PCM(base64)。連結後に一度だけWAVヘッダを被せる。 ---
let geminiSampleRate = 24000; // レスポンスの mimeType から実測で上書きする

async function geminiSynthOne(text, voiceName, styleInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${GEMINI_KEY}`;
  // TTSモデルが短い掛け声を「返答すべき会話」と誤解しないよう、読み上げ機として振る舞わせ本文を鉤括弧で分離する
  const prompt =
    `次の「」内のセリフを、${styleInstruction}という声色で、一字一句そのまま読み上げてください。` +
    `あなたは音声読み上げ機です。返答・相槌・補足・ナレーションは一切加えず、括弧内のテキストだけを音声化すること。\n` +
    `「${text.replace(/[「」]/g, "")}」`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini generateContent 失敗 (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`音声データが返りません: ${JSON.stringify(data).slice(0, 300)}`);
  const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType || "");
  if (rateMatch) geminiSampleRate = parseInt(rateMatch[1], 10);
  return Buffer.from(part.inlineData.data, "base64"); // 生PCM(L16)
}

// 16bit mono PCM に WAV ヘッダを付ける
function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthGemini(segments) {
  if (!GEMINI_KEY) {
    console.log("⏭  GEMINI_API_KEY が無いので Gemini側はスキップ");
    return null;
  }
  const voiceA = process.env.GEMINI_VOICE_A || "Kore"; // ミナ=女性
  const voiceB = process.env.GEMINI_VOICE_B || "Charon"; // リク=男性
  console.log(`   [Gemini] model=${GEMINI_TTS_MODEL} ${HOST_A.name}=${voiceA} / ${HOST_B.name}=${voiceB}`);
  const cfgByName = {
    [HOST_A.name]: { voice: voiceA, prompt: HOST_A.ttsInstructions },
    [HOST_B.name]: { voice: voiceB, prompt: HOST_B.ttsInstructions },
  };
  const pcmParts = [];
  for (const [i, seg] of segments.entries()) {
    const cfg = cfgByName[seg.name] || cfgByName[HOST_A.name];
    console.log(`   [Gemini] ${i + 1}/${segments.length} ${seg.name} (${cfg.voice})`);
    pcmParts.push(await geminiSynthOne(seg.text.trim(), cfg.voice, cfg.prompt));
  }
  const out = path.join(OUT_DIR, "ab_gemini.wav");
  fs.writeFileSync(out, pcmToWav(Buffer.concat(pcmParts), geminiSampleRate));
  console.log(`✅ Gemini → ${out} (${geminiSampleRate}Hz)`);
  return out;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  if (process.argv.includes("--list")) {
    if (!GKEY) return console.log("GOOGLE_TTS_API_KEY が未設定です");
    const vs = await googleListVoices();
    console.log(`ja-JP Chirp3-HD ボイス (${vs.length}件):`);
    for (const v of vs) console.log(`  ${v.name}  [${v.ssmlGender}]`);
    return;
  }

  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const run = (name) => wanted.length === 0 || wanted.includes(name);

  const script = fs.readFileSync(SCRIPT_PATH, "utf8");
  const segments = parseDialogue(script);
  console.log(`原稿: ${segments.length}発話（対象: ${wanted.length ? wanted.join(",") : "全て"}）\n`);

  const a = run("openai") ? await synthOpenAI(segments) : null;
  const b = run("chirp3") ? await synthGoogle(segments) : null;
  const c = run("gemini") ? await synthGemini(segments) : null;

  console.log("\n=== 完了 ===");
  if (run("openai")) console.log(a ? `OpenAI : ${a}` : "OpenAI : (スキップ)");
  if (run("chirp3")) console.log(b ? `Chirp3 : ${b}` : "Chirp3 : (スキップ)");
  if (run("gemini")) console.log(c ? `Gemini : ${c}` : "Gemini : (スキップ)");
}

main().catch((e) => {
  console.error("💀 失敗:", e.message);
  process.exit(1);
});
