function generateRSS(filename, audioUrl, audioSizeBytes, durationSec, existingXML) {
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>My Daily News</title>
    <link>${publicUrl}</link>
    <description>AIが毎朝まとめるニュース</description>
    <language>ja</language>
    <itunes:author>Daily Radio</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:category text="Technology"/>
    <itunes:image href="${publicUrl}/thumbnail.png"/>
    <item>
      <title>${dateStr} ニュース</title>
      <description>${dateStr}のニュースまとめ</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${filename}</guid>
      <enclosure url="${audioUrl}" length="${audioSizeBytes}" type="audio/mpeg"/>
      <itunes:duration>${durationStr}</itunes:duration>
    </item>
${existingItems}
  </channel>
</rss>`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

module.exports = { generateRSS };
