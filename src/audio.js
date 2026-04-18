const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { mixBGM } = require("./bgm");
const { uploadToR2 } = require("./r2");

async function generateAudio(script, apiKey, localDir) {
  try {
    console.log("3. 音声生成(OpenAI TTS)を開始します...");
    const openai = new OpenAI({ apiKey });

    const chunks = splitTextByParagraph(script, 4000);
    const audioBuffers = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`   - 音声生成中 (${i + 1}/${chunks.length} パート)...`);
      const mp3 = await openai.audio.speech.create({
        model: "tts-1-hd",
        voice: "nova",
        speed: 1.1,
        input: chunks[i],
      });
      audioBuffers.push(Buffer.from(await mp3.arrayBuffer()));
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
    return { fileName, audioUrl, sizeBytes };
  } catch (error) {
    console.error("❌ 音声生成プロセスでエラーが発生しました:", error);
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
