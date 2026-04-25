async function fetchOnThisDay() {
  try {
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const month = nowJST.getUTCMonth() + 1;
    const day = nowJST.getUTCDate();
    const pageTitle = `${month}月${day}日`;
    const url = `https://ja.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json&section=1`;

    const res = await fetch(url, {
      headers: { "User-Agent": "DailyRadio/1.0 (github.com/kyouta89/Daily-Radio)" },
    });
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    const json = await res.json();
    const wikitext = json?.parse?.wikitext?.["*"];
    if (!wikitext) throw new Error("wikitext empty");

    const eventLines = wikitext
      .split("\n")
      .filter((line) => /^\*\s/.test(line))
      .map((line) =>
        line
          .replace(/\[\[(?:[^\]|]*\|)?([^\]|]+)\]\]/g, "$1")
          .replace(/\{\{[\s\S]*?\}\}/g, "")
          .replace(/<ref[\s\S]*?<\/ref>/g, "")
          .replace(/<ref[^/]*\/>/g, "")
          .replace(/'''([^']+)'''/g, "$1")
          .replace(/''([^']+)''/g, "$1")
          .trim(),
      )
      .filter((line) => line.length > 2);

    const cleaned = eventLines.join("\n");

    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.warn(`⚠️ 「今日は何の日」取得失敗（プロンプトなしで続行）: ${err.message}`);
    return null;
  }
}

module.exports = { fetchOnThisDay };
