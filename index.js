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

// 死活監視（dead-man's switch）。Healthchecks.io の ping URL に best-effort で叩く。
// 平日朝に成功pingが来ないと Healthchecks 側がアラート → ワークフロー自動停止・cron抜け・
// クラッシュ（＝ジョブが動かずジョブから通知できないケース）を GitHub の外から検知できる。
// HEALTHCHECK_URL 未設定なら何もしない（監視は任意・未設定でもパイプラインは壊れない）。
// suffix="/fail" で失敗を即通知、"" で成功（正常完了・平日祝日等の意図したスキップ含む）。
async function pingHealthcheck(suffix = "") {
  const base = process.env.HEALTHCHECK_URL;
  if (!base) return;
  try {
    await fetch(`${base}${suffix}`, {
      method: "POST",
      body: suffix === "/fail" ? "pipeline failed" : "ok",
      signal: AbortSignal.timeout(10000),
    });
    console.log(`🫀 死活監視ping送信: ${suffix === "/fail" ? "fail" : "success"}`);
  } catch (e) {
    // 監視の失敗でパイプラインを壊さない（通知が飛ばないだけ）。
    console.warn(`⚠️ 死活監視pingに失敗（無視して続行）: ${e.message}`);
  }
}

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

    const { fileName, audioUrl, sizeBytes, durationSec } = await generateAudio(
      generatedData.script,
      process.env.GEMINI_API_KEY,
      LOCAL_SAVE_DIR,
      variant,
      jstDateStr,
      generatedData.sections,
    );

    const existingXML = await downloadExistingRSS();
    const rssContent = generateRSS(fileName, audioUrl, sizeBytes, durationSec || 0, existingXML);
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

main()
  // main は自身のエラーを catch して process.exitCode=1 を立てる（throwしない）ので、
  // ここでは常に resolve する。exitCode を見て成功/失敗の ping を1回だけ送る。
  // スキップ（平日祝日・本日分済み）は exitCode を立てないので success 扱い＝正しい。
  .then(() => pingHealthcheck(process.exitCode ? "/fail" : ""))
  .finally(() => {
    // TTS/AWS SDK 等の keep-alive ソケットでイベントループが空かず、処理完了後も
    // プロセスが数十分ぶら下がる問題への対処。パイプラインは逐次 await なので、
    // ここに到達した時点で全工程は完了/中断済み。終了コードを保って明示的に落とす。
    process.exit(process.exitCode || 0);
  });
