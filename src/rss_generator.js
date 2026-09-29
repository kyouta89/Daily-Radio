// ポッドキャストのRSS(podcast.xml)を毎回組み立て直す。既存エピソードは最大29件引き継ぐ。
// 番組のメタ情報は src/config.js、言語別の見出し語は src/i18n.js から取る。
const { SHOW, LANG } = require("./config");
const { t } = require("./i18n");

// XMLに安全に埋め込むためのエスケープ（要約や記事タイトルに & < > " が入り得る）
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// エピソードの説明欄に出すサマリーを組み立てる。
// ポッドキャストアプリ側で「聴かなくても要点がわかる」ようにするのが狙い。
// summary = { takeaway: string, links: [{title, url}] }
function buildEpisodeSummary(dateStr, summary) {
  const takeaway = (summary && summary.takeaway ? String(summary.takeaway) : "").trim();
  const links = (summary && Array.isArray(summary.links) ? summary.links : []).filter(
    (l) => l && l.title
  );

  const parts = [];
  if (takeaway) parts.push(takeaway);
  if (links.length > 0) {
    const list = links
      .map((l) => (l.url ? `- ${l.title}\n  ${l.url}` : `- ${l.title}`))
      .join("\n");
    parts.push(`${t.summaryLinksHeading}:\n${list}`);
  }
  // サマリーが無い場合は従来どおりの素っ気ない文言にフォールバック
  if (parts.length === 0) return t.episodeTitle(dateStr);
  return parts.join("\n\n");
}

function generateRSS(filename, audioUrl, audioSizeBytes, durationSec, existingXML, summary) {
  const publicUrl = process.env.CF_PUBLIC_URL || "";

  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = jstDate.toISOString().split("T")[0].replace(/-/g, "/");
  const pubDate = now.toUTCString();

  const totalSecs = durationSec || 0;
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const durationStr =
    hrs > 0
      ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
      : `${pad(mins)}:${pad(secs)}`;

  // 既存エピソードを最大29件取り出して新エピソードの後ろに付ける
  let existingItems = "";
  if (existingXML) {
    const matches = existingXML.match(/<item>[\s\S]*?<\/item>/g) || [];
    existingItems = matches
      .slice(0, 29)
      .map((item) => `    ${item}`)
      .join("\n");
  }

  const episodeSummary = esc(buildEpisodeSummary(dateStr, summary));

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(SHOW.title)}</title>
    <link>${publicUrl}</link>
    <description>${esc(SHOW.description)}</description>
    <language>${esc(LANG)}</language>
    <itunes:author>${esc(SHOW.author)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:category text="${esc(SHOW.category)}"/>
    <itunes:image href="${publicUrl}/thumbnail.png"/>
    <item>
      <title>${esc(t.episodeTitle(dateStr))}</title>
      <description>${episodeSummary}</description>
      <itunes:summary>${episodeSummary}</itunes:summary>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${esc(filename)}</guid>
      <enclosure url="${esc(audioUrl)}" length="${audioSizeBytes}" type="audio/mpeg"/>
      <itunes:duration>${durationStr}</itunes:duration>
    </item>
${existingItems}
  </channel>
</rss>`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

module.exports = { generateRSS, buildEpisodeSummary };
