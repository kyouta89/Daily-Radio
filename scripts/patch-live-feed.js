// 一回きり：今ライブに出ている podcast.xml に Apple 必須の <itunes:category> 等を注入する。
// Apple Podcast の「URLから追加」はカテゴリ必須で、無いと「配信が見つからない」で弾かれる。
// 恒久対応は rss_generator.js 側（次回配信から自動で入る）。本スクリプトは既存の1本を後追いで
// 直すだけの使い捨て。プレフィックス対応は src/r2.js に集約済みなのでそれを使う。
const { downloadExistingRSS, uploadRSSToR2 } = require("../src/r2");

(async () => {
  const xml = await downloadExistingRSS();
  if (!xml) {
    console.error("既存フィードが取得できませんでした（R2_SECRET_PREFIX / creds を確認）");
    process.exit(1);
  }
  if (xml.includes("itunes:category")) {
    console.log("既に itunes:category あり。何もしません（冪等）。");
    return;
  }
  const tags =
    '<itunes:type>episodic</itunes:type>\n    <itunes:category text="Technology"/>\n    ';
  // channel 内・最初の <item> の直前に挿入（前の4スペース字下げはそのまま活きる）。
  const patched = xml.replace("<item>", tags + "<item>");
  if (patched === xml) {
    console.error("<item> が見つからず注入できませんでした。フィード構造を確認してください。");
    process.exit(1);
  }
  await uploadRSSToR2(patched);
  console.log("✅ ライブフィードに itunes:type / itunes:category を注入しました。");
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
