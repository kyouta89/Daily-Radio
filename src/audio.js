const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis"); // ★追加: Google APIツール

// ★追加: Googleドライブへアップロードする専用関数
async function uploadToDrive(filePath, fileName) {
  try {
    console.log("☁️ Googleドライブへアップロードを開始します...");

    // GitHub Secrets (または .env) から鍵情報を読み込む
    const credentials = JSON.parse(process.env.GDRIVE_CREDENTIALS);
    const folderId = process.env.GDRIVE_FOLDER_ID;

    // Google APIの認証設定
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });
    const drive = google.drive({ version: "v3", auth });

    // アップロードするファイルの設定
    const fileMetadata = {
      name: fileName,
      parents: [folderId], // 保存先のフォルダIDを指定
    };
    const media = {
      mimeType: "audio/mpeg",
      body: fs.createReadStream(filePath), // 一時保存したファイルを読み込む
    };

    // アップロード実行
    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });
    console.log(
      `✅ Googleドライブへのアップロードが完了しました！ (File ID: ${res.data.id})`,
    );
  } catch (error) {
    console.error("❌ Googleドライブのアップロードに失敗しました:", error);
    throw error;
  }
}

// メインの音声生成関数
async function generateAudio(script, apiKey, localDir, _ignoredDriveDir) {
  try {
    console.log("3. 音声生成(OpenAI TTS)を開始します...");
    const openai = new OpenAI({ apiKey: apiKey });
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
      const buffer = Buffer.from(await mp3.arrayBuffer());
      audioBuffers.push(buffer);
    }

    const finalBuffer = Buffer.concat(audioBuffers);
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `radio_${dateStr}.mp3`;

    // 1. GitHub Actionsの一時サーバー（またはMacローカル）に保存
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, finalBuffer);
    console.log(`✅ ローカル(一時領域)に保存完了: ${localPath}`);

    // 2. Googleドライブ API を使ってアップロード！
    if (process.env.GDRIVE_CREDENTIALS && process.env.GDRIVE_FOLDER_ID) {
      await uploadToDrive(localPath, fileName);
    } else {
      console.log(
        "⚠️ Googleドライブの認証情報がないため、アップロードをスキップします。",
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
