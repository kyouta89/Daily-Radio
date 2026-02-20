const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

async function generateAudio(script, apiKey, saveDir) {
  try {
    console.log("3. 音声生成(OpenAI TTS)を開始します...");
    const openai = new OpenAI({ apiKey: apiKey });

    // OpenAIの制限(4096文字)を回避するため、安全に分割する
    const chunks = splitTextByParagraph(script, 4000);
    const audioBuffers = [];

    // 分割した原稿を順番に音声化
    for (let i = 0; i < chunks.length; i++) {
      console.log(`   - 音声生成中 (${i + 1}/${chunks.length} パート)...`);
      const mp3 = await openai.audio.speech.create({
        model: "tts-1", // コストパフォーマンスに優れた標準モデル
        voice: "nova", // エネルギッシュで元気な女性の声
        input: chunks[i],
      });
      // 取得した音声データをバッファ（メモリ上のデータ）として配列に保存
      const buffer = Buffer.from(await mp3.arrayBuffer());
      audioBuffers.push(buffer);
    }

    console.log("   - 音声ファイルを結合・保存中...");
    // 複数の音声バッファを1つのMP3ファイルに結合
    const finalBuffer = Buffer.concat(audioBuffers);

    // 日付付きのファイル名を作成 (例: radio_2026-02-21.mp3)
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `radio_${dateStr}.mp3`;
    const filePath = path.join(saveDir, fileName);

    // 保存先のディレクトリが存在しない場合は作成
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // ファイルをGoogleドライブの指定フォルダに書き出し
    fs.writeFileSync(filePath, finalBuffer);
    console.log(`✅ 音声ファイルの保存が完了しました: ${filePath}`);
  } catch (error) {
    console.error("❌ 音声生成エラー:", error);
    throw error;
  }
}

// 改行を基準にテキストを分割する関数（Notionの時と同じロジック）
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
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

module.exports = { generateAudio };
