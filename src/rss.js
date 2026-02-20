const Parser = require("rss-parser");
const parser = new Parser();

// 複数のRSS URLを受け取って、まとめて記事を取得する関数
async function fetchNews(rssUrls, limitPerSource = 5) {
  try {
    console.log(`1. ${rssUrls.length}箇所のソースからニュースを取得中...`);

    // Promise.allを使って、全サイトに同時にアクセス（高速化）
    const promises = rssUrls.map(async (url) => {
      try {
        const feed = await parser.parseURL(url);

        // 各サイトから最新の数件だけを取得
        // タイトルに【サイト名】をつけることで、どこ情報かわかるようにする
        return feed.items.slice(0, limitPerSource).map((item) => {
          const siteName = feed.title ? feed.title.trim() : "Unknown";
          return `- 【${siteName}】${item.title} (${item.link})`;
        });
      } catch (e) {
        console.error(`⚠️ 取得エラー (${url}): ${e.message}`);
        return []; // 1つ失敗しても他は止まらないように空配列を返す
      }
    });

    // 全ての結果が返ってくるのを待つ
    const results = await Promise.all(promises);

    // 取得した「配列の配列」を、1つの「平らな配列」にする (flat)
    const allItems = results.flat();

    console.log(`✅ 合計 ${allItems.length} 件の記事を確保しました！`);

    // Geminiに渡すためのテキスト形式に結合
    return allItems.join("\n");
  } catch (error) {
    console.error("❌ RSS取得全体のエラー:", error);
    throw error;
  }
}

module.exports = { fetchNews };
