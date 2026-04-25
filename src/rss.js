const Parser = require("rss-parser");
const parser = new Parser();

async function fetchNewsForAxis(axis, limitPerSource = 5) {
  const promises = axis.urls.map(async (url) => {
    try {
      const feed = await parser.parseURL(url);
      return feed.items.slice(0, limitPerSource).map((item) => {
        const siteName = feed.title ? feed.title.trim() : "Unknown";
        return `- 【${siteName}】${item.title} (${item.link})`;
      });
    } catch (e) {
      console.error(`⚠️ 取得エラー (${url}): ${e.message}`);
      return [];
    }
  });

  const results = await Promise.all(promises);
  return results.flat();
}

async function fetchNews(axes, limitPerSource = 5) {
  try {
    console.log(`1. ${axes.length}つの軸からニュースを取得中...`);

    const results = await Promise.all(
      axes.map(async (axis) => {
        const items = await fetchNewsForAxis(axis, limitPerSource);
        console.log(`  ✅ [${axis.name}] ${items.length}件取得`);
        return {
          name: axis.name,
          selectionHint: axis.selectionHint || "",
          items: items.join("\n"),
        };
      })
    );

    return results;
  } catch (error) {
    console.error("❌ RSS取得全体のエラー:", error);
    throw error;
  }
}

module.exports = { fetchNews };
