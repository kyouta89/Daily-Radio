const Parser = require("rss-parser");
// タイムアウトを付与（応答しないフィードでパイプライン全体が固まるのを防ぐ）。
const parser = new Parser({ timeout: 15000 });

// 記事本文の要約スニペットを取り出す（執筆AIに渡して解説の正確さを上げるため）
function snippetOf(item) {
  const raw = item.contentSnippet || item.summary || item.content || "";
  return String(raw)
    .replace(/<[^>]+>/g, " ") // 念のためHTMLタグ除去
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// 記事の経過日数。日付が取れない/不正なら null。
function ageDaysOf(item) {
  const d = item.isoDate || item.pubDate || null;
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

async function fetchNewsForAxis(axis, limitPerSource = 5) {
  const promises = axis.urls.map(async (url) => {
    try {
      const feed = await parser.parseURL(url);
      const siteName = feed.title ? feed.title.trim() : "Unknown";
      const items = (feed.items || []).map((item) => ({
        site: siteName,
        title: (item.title || "").trim(),
        link: item.link || "",
        snippet: snippetOf(item),
        isoDate: item.isoDate || item.pubDate || null,
        ageDays: ageDaysOf(item),
      }));
      // フィードが時系列順とは限らないため、新しい順に並べてから上位を採用する。
      // 日付不明は末尾に回す。
      items.sort((a, b) => {
        if (a.ageDays == null && b.ageDays == null) return 0;
        if (a.ageDays == null) return 1;
        if (b.ageDays == null) return -1;
        return a.ageDays - b.ageDays;
      });
      return items.slice(0, limitPerSource);
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
