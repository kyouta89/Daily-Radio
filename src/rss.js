const Parser = require("rss-parser");
const parser = new Parser();

// 記事本文の要約スニペットを取り出す（執筆AIに渡して解説の正確さを上げるため）
function snippetOf(item) {
  const raw = item.contentSnippet || item.summary || item.content || "";
  return String(raw)
    .replace(/<[^>]+>/g, " ") // 念のためHTMLタグ除去
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function fetchNewsForAxis(axis, limitPerSource = 5) {
  const promises = axis.urls.map(async (url) => {
    try {
      const feed = await parser.parseURL(url);
      const siteName = feed.title ? feed.title.trim() : "Unknown";
      return feed.items.slice(0, limitPerSource).map((item) => ({
        site: siteName,
        title: (item.title || "").trim(),
        link: item.link || "",
        snippet: snippetOf(item),
      }));
    } catch (e) {
      console.error(`⚠️ 取得エラー (${url}): ${e.message}`);
      return [];
    }
  });

  const results = await Promise.all(promises);
  return results.flat().filter((it) => it.title && it.link);
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
          items, // ← 構造化した配列 [{site, title, link, snippet}]
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
