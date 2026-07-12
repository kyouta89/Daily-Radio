require("dotenv").config();

// プロキシ対策
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const { fetchNews } = require("./src/rss");
const { generateScript } = require("./src/script");
const {
  saveToNotion,
  fetchRecentArticleURLs,
  findTodayPage,
} = require("./src/notion");
const { generateAudio } = require("./src/audio");
const { downloadExistingRSS, uploadRSSToR2 } = require("./src/r2");
const { generateRSS } = require("./src/rss_generator");
const path = require("path");
const { RSS_AXES } = require("./src/axes");


const LOCAL_SAVE_DIR = path.join(__dirname, "output");

async function main() {
  try {
    console.log("📻 Daily Radio 起動...");

    if (process.env.FORCE_RUN !== "true") {
      const existing = await findTodayPage(
        process.env.NOTION_API_KEY,
        process.env.NOTION_DATABASE_ID,
      );
      if (existing) {
        console.log(
          "⏭  本日分のページは既に存在するため処理をスキップします（再実行する場合は FORCE_RUN=true）",
        );
        return;
      }
    }

    const [axesWithItems, excludedUrls] = await Promise.all([
      fetchNews(RSS_AXES),
      fetchRecentArticleURLs(
        process.env.NOTION_API_KEY,
        process.env.NOTION_DATABASE_ID,
        14,
      ),
    ]);
    const generatedData = await generateScript(
      axesWithItems,
      process.env.ANTHROPIC_API_KEY,
      excludedUrls,
    );

    const { fileName, audioUrl, sizeBytes } = await generateAudio(
      generatedData.script,
      process.env.OPENAI_API_KEY,
      LOCAL_SAVE_DIR,
    );

    const existingXML = await downloadExistingRSS();
    const rssContent = generateRSS(fileName, audioUrl, sizeBytes, 0, existingXML);
    await uploadRSSToR2(rssContent);

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
