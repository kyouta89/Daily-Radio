const Parser = require("rss-parser");
const parser = new Parser();

async function fetchNews(rssUrl, limit = 15) {
  try {
    console.log("1. ニュースを取得中...");
    const feed = await parser.parseURL(rssUrl);

    // 記事リストを整形して返す
    const items = feed.items
      .slice(0, limit)
      .map((item) => `- ${item.title} (${item.link})`)
      .join("\n");

    return items;
  } catch (error) {
    console.error("❌ RSS取得エラー:", error);
    throw error;
  }
}

module.exports = { fetchNews };
