require("dotenv").config();

delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const fs = require("fs");
const path = require("path");
const { fetchNews } = require("./src/rss");
const { generateScript } = require("./src/script");
const { fetchRecentArticleURLs } = require("./src/notion");
const { getDailyVariant } = require("./src/variant");

const { RSS_AXES } = require("./src/axes");

async function main() {
  console.log("🧪 Dry Run: 原稿生成のみ（音声/Notion/R2はスキップ）");

  // 本番と同じく日付シードのバリエーション（ムード・声・年月日）を通す
  const jstDateStr = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const variant = getDailyVariant(jstDateStr);

  const [axesWithItems, excludedUrls] = await Promise.all([
    fetchNews(RSS_AXES),
    fetchRecentArticleURLs(
      process.env.NOTION_API_KEY,
      process.env.NOTION_DATABASE_ID,
      14,
    ),
  ]);

  const generated = await generateScript(
    axesWithItems,
    process.env.ANTHROPIC_API_KEY,
    excludedUrls,
    variant,
  );

  const outDir = path.join(__dirname, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `dry-run-${ts}.txt`);
  const body =
    `=== TAGS ===\n${generated.tags}\n\n` +
    `=== TAKEAWAY ===\n${generated.takeaway}\n\n` +
    `=== LINKS ===\n${generated.linksRaw}\n\n` +
    `=== SCRIPT ===\n${generated.script}\n`;
  fs.writeFileSync(outPath, body);

  console.log(`\n✅ 完了: ${outPath}`);
  console.log(`📝 文字数: ${generated.script.length}`);
  console.log(`🏷  タグ: ${generated.tags}`);
}

main().catch((e) => {
  console.error("💀 エラー:", e);
  process.exit(1);
});
