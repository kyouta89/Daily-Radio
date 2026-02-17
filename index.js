require("dotenv").config();

// プロキシ対策
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

// モジュールの読み込み
const { fetchNews } = require("./src/rss");
const { generateScript } = require("./src/gemini");
const { saveToNotion } = require("./src/notion");
const { generateAudio } = require("./src/audio"); // ★追加！

// 設定
const RSS_URL = "https://zenn.dev/feed";
// ★保存先フォルダ（ファイル名は自動生成されるのでフォルダパスだけでOK）
const SAVE_DIR =
  "/Users/takahashikyota/Library/CloudStorage/GoogleDrive-kyouta898@gmail.com/マイドライブ/Daily-Radio";

async function main() {
  try {
    console.log("📻 Daily Radio (リファクタリング完了版) 起動...");

    // 1. ニュース収集
    const newsItems = await fetchNews(RSS_URL);

    // 2. 原稿生成 (Gemini)
    const generatedData = await generateScript(
      newsItems,
      process.env.GEMINI_API_KEY,
    );

    // 3. 音声生成 (OpenAI)
    // ★今はまだ課金しないのでコメントアウト中！使う時はここを外すだけ。
    /*
    await generateAudio(
      generatedData.script, 
      process.env.OPENAI_API_KEY, 
      SAVE_DIR
    );
    */
    console.log("3. 音声生成... (スキップ中)");

    // 4. Notion保存
    await saveToNotion(
      generatedData,
      process.env.NOTION_API_KEY,
      process.env.NOTION_DATABASE_ID,
    );

    console.log("🎉 全工程が完了しました！");
  } catch (error) {
    console.error("💀 メイン処理でエラーが発生しました:", error);
  }
}

main();
