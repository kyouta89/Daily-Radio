require("dotenv").config();

// プロキシ対策
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const { fetchNews } = require("./src/rss");
const { generateScript } = require("./src/gemini");
const { saveToNotion } = require("./src/notion");
const { generateAudio } = require("./src/audio");
const path = require("path");

const RSS_AXES = [
  {
    name: "テック系",
    urls: [
      "https://news.ycombinator.com/rss",
      "https://techcrunch.com/feed/",
      "https://www.technologyreview.com/feed/",
      "https://www.theverge.com/rss/index.xml",
    ],
  },
  {
    name: "ServiceNow / AI専門",
    urls: [
      "https://venturebeat.com/feed/",
      "https://diginomica.com/feed",
      "https://ainow.ai/feed/",
      "https://www.servicenow.com/community/s/cgfwn76974/rss/Category?category.id=blogs&interaction.style=blog",
      "https://nowben.com/servicenow-news/feed/",
    ],
  },
  {
    name: "エンタープライズIT・業界",
    urls: [
      "https://www.publickey1.jp/atom.xml",
      "https://rss.itmedia.co.jp/rss/2.0/enterprise.xml",
      "https://cloud.watch.impress.co.jp/data/rss/1.0/clw/feed.rdf",
    ],
  },
  {
    name: "ビジネス・経営",
    urls: [
      "https://toyokeizai.net/list/feed/rss",
      "https://diamond.jp/list/feed/rss/dol",
      "https://www.businessinsider.jp/feed/index.xml",
    ],
  },
  {
    name: "新規事業・スタートアップ",
    urls: [
      "https://coralcap.co/feed/",
      "https://prtimes.jp/index.rdf",
      "https://thebridge.jp/feed",
    ],
  },
];

const LOCAL_SAVE_DIR = path.join(__dirname, "output");
const GOOGLE_DRIVE_DIR =
  "/Users/takahashikyota/Library/CloudStorage/GoogleDrive-kyouta898@gmail.com/マイドライブ/Daily-Radio";

async function main() {
  try {
    console.log("📻 Daily Radio 起動...");

    const axesWithItems = await fetchNews(RSS_AXES);
    const generatedData = await generateScript(
      axesWithItems,
      process.env.GEMINI_API_KEY,
    );

    await generateAudio(
      generatedData.script,
      process.env.OPENAI_API_KEY,
      LOCAL_SAVE_DIR,
      GOOGLE_DRIVE_DIR,
    );

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
