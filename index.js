require("dotenv").config();

// プロキシ対策
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const { fetchNews } = require("./src/rss");
const { generateScript } = require("./src/gemini");
const { saveToNotion } = require("./src/notion");
const { generateAudio } = require("./src/audio"); // ★コメントアウト解除

const RSS_URLS = [
  "https://zenn.dev/feed",
  "https://qiita.com/popular-items/feed",
  "https://b.hatena.ne.jp/hotentry/it.rss",
  "https://news.ycombinator.com/rss",
  "https://www.echojs.com/rss",
  "https://www.publickey1.jp/atom.xml",
  "https://gigazine.net/news/rss_2.0/",
];

// ★Googleドライブの保存先フォルダを指定
const SAVE_DIR =
  "/Users/takahashikyota/Library/CloudStorage/GoogleDrive-kyouta898@gmail.com/マイドライブ/Daily-Radio";

async function main() {
  try {
    console.log("📻 Daily Radio (完全版) 起動...");

    const newsItems = await fetchNews(RSS_URLS);
    const generatedData = await generateScript(
      newsItems,
      process.env.GEMINI_API_KEY,
    );

    // ★音声生成のコメントアウトを解除し、実行する
    await generateAudio(
      generatedData.script,
      process.env.OPENAI_API_KEY,
      SAVE_DIR,
    );

    await saveToNotion(
      generatedData,
      process.env.NOTION_API_KEY,
      process.env.NOTION_DATABASE_ID,
    );

    console.log(
      "🎉 全工程が完了しました！GoogleドライブとNotionを確認してください。",
    );
  } catch (error) {
    console.error("💀 メイン処理でエラーが発生しました:", error);
  }
}

main();
