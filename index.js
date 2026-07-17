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
const { getDailyVariant } = require("./src/variant");
const holiday_jp = require("@holiday-jp/holiday_jp");


const LOCAL_SAVE_DIR = path.join(__dirname, "output");

async function main() {
  try {
    console.log("📻 Daily Radio 起動...");

    // 配信日（JST）。土日祝の判定・ムード決定・ファイル名の基準に使う。
    const now = new Date();
    const jstDateStr = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    if (process.env.FORCE_RUN !== "true") {
      // 平日のみ稼働：土日と日本の祝日はスキップ（FORCE_RUN=true で上書き可）。
      const [y, m, d] = jstDateStr.split("-").map(Number);
      const jstDate = new Date(y, m - 1, d);
      const dow = jstDate.getDay();
      const holiday = holiday_jp.isHoliday(jstDate);
      if (dow === 0 || dow === 6 || holiday) {
        const label = holiday
          ? holiday_jp.between(jstDate, jstDate)[0]?.name || "祝日"
          : dow === 0
            ? "日曜"
            : "土曜";
        console.log(
          `⏭  平日のみ稼働のためスキップします（${jstDateStr} は ${label}）。実行するには FORCE_RUN=true`,
        );
        return;
      }

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

    // 今日のバリエーション（日付シードでムード・声を決定。同じ日なら固定）
    const variant = getDailyVariant(jstDateStr);
    console.log(
      `🎨 本日のムード: ${variant.mood.label}（声: ミナ=${variant.voiceA} / リク=${variant.voiceB}）`,
    );

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
      variant,
    );
    generatedData.moodLabel = variant.mood.label;
    generatedData.voiceA = variant.voiceA;
    generatedData.voiceB = variant.voiceB;

    const { fileName, audioUrl, sizeBytes } = await generateAudio(
      generatedData.script,
      process.env.GEMINI_API_KEY,
      LOCAL_SAVE_DIR,
      variant,
      jstDateStr,
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
    // 非ゼロ終了でジョブを失敗(赤)にする。これをしないと失敗しても成功扱いになり
    // 通知が飛ばず“静かな失敗”になる。
    process.exitCode = 1;
  }
}

main();
