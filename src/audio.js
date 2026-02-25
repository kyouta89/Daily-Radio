const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// ★修正：OAuth認証を使ってGoogleドライブへアップロードする関数
async function uploadToDrive(filePath, fileName) {
  try {
    console.log("☁️ Googleドライブへアップロードを開始します (OAuth認証)...");

    // GitHub Secrets (または .env) から鍵情報を読み込む
    const clientId = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
    const folderId = process.env.GDRIVE_FOLDER_ID;

    // OAuth2クライアントの準備
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // アップロードするファイルの設定
    const fileMetadata = {
      name: fileName,
      parents: [folderId], // 保存先のフォルダIDを指定
    };
    const media = {
      mimeType: "audio/mpeg",
      body: fs.createReadStream(filePath),
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

    // 1. ローカルフォルダに保存 (GitHub Actionsの一時領域)
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, finalBuffer);
    console.log(`✅ ローカルに保存完了: ${localPath}`);

    // 2. Googleドライブ API を使ってアップロード！ (★ここを修正しました)
    if (process.env.GDRIVE_CLIENT_ID && process.env.GDRIVE_REFRESH_TOKEN) {
      await uploadToDrive(localPath, fileName);
    } else {
      console.log(
        "⚠️ Googleドライブの認証情報がないため、APIでのアップロードをスキップします。",
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
