const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

async function generateAudio(script, apiKey, saveDir) {
  try {
    console.log("3. 音声を合成中...");

    const openai = new OpenAI({ apiKey: apiKey });

    // ファイル名を日付入りにする (例: 2026-02-17_DailyRadio.mp3)
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const fileName = `${dateStr}_DailyRadio.mp3`;
    const fullPath = path.join(saveDir, fileName);

    // OpenAI APIで音声合成
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: script,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(fullPath, buffer);

    console.log(`✅ 音声保存完了: ${fileName}`);
    return fullPath;
  } catch (error) {
    console.error("❌ 音声生成エラー:", error);
    // 音声エラーは致命的ではないので、エラーを投げずに処理を続ける場合もありますが、
    // 今回は気づけるようにエラーを出します。
    throw error;
  }
}

module.exports = { generateAudio };
