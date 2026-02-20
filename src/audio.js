const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

async function generateAudio(script, apiKey, localDir, driveDir) {
  try {
    console.log("3. 音声生成(OpenAI TTS)を開始します...");
    const openai = new OpenAI({ apiKey: apiKey });

    const chunks = splitTextByParagraph(script, 4000);
    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`   - 音声生成中 (${i + 1}/${chunks.length} パート)...`);
      const mp3 = await openai.audio.speech.create({
        model: "tts-1-hd", // 高音質モデル
        voice: "nova", // 例: "shimmer"、"deep"、"bright"など
        speed: 1.1,
        input: chunks[i],
      });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      audioBuffers.push(buffer);
    }

    const finalBuffer = Buffer.concat(audioBuffers);
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `radio_${dateStr}.mp3`;

    // 1. ローカルフォルダに保存
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, finalBuffer);
    console.log(`✅ ローカルに保存完了: ${localPath}`);

    // 2. Googleドライブへコピーを試行
    try {
      if (!fs.existsSync(driveDir)) fs.mkdirSync(driveDir, { recursive: true });
      const drivePath = path.join(driveDir, fileName);
      fs.copyFileSync(localPath, drivePath);
      console.log(`✅ Googleドライブへのコピーが完了しました: ${drivePath}`);
    } catch (driveError) {
      console.warn(
        "⚠️ Googleドライブへのコピーに失敗しました（同期エラーなど）。ファイルはローカルに残っています。",
      );
    }
  } catch (error) {
    console.error("❌ 音声生成プロセス全体でエラーが発生しました:", error);
    throw error;
  }
}

function splitTextByParagraph(text, maxLength) {
  const paragraphs = text.split("\n");
  const chunks = [];
  let currentChunk = "";
  for (const p of paragraphs) {
    if (currentChunk.length + p.length + 1 > maxLength) {
      chunks.push(currentChunk);
      currentChunk = p + "\n";
    } else {
      currentChunk += p + "\n";
    }
  }
  if (currentChunk.trim().length > 0) chunks.push(currentChunk);
  return chunks;
}

module.exports = { generateAudio };
