// 「今日は何の日」をWikipediaの日付ページから取得する。
// 言語は src/i18n.js の wikiLang / wikiPageTitle に従う。
// ※日本語パスは従来どおり section=1（「できごと」節）をそのまま取得する挙動を維持。
//   英語版は日付ページの構造が異なる（Events に下位見出しがある）ため、
//   ページ全体を取得して Events 〜 Births の間だけを切り出す。
const { t } = require("./i18n");

function extractEventLines(wikitext) {
  return wikitext
    .split("\n")
    // 英語版は "*[[1918]] &ndash; ..." のように * の直後に空白が無い行もあるため緩めに判定
    .filter((line) => /^\*+\s*\S/.test(line))
    .map((line) =>
      line
        .replace(/^\*+\s*/, "")
        .replace(/\[\[(?:[^\]|]*\|)?([^\]|]+)\]\]/g, "$1")
        .replace(/\{\{[\s\S]*?\}\}/g, "")
        .replace(/<ref[\s\S]*?<\/ref>/g, "")
        .replace(/<ref[^/]*\/>/g, "")
        .replace(/'''([^']+)'''/g, "$1")
        .replace(/''([^']+)''/g, "$1")
        .replace(/&ndash;/g, "–")
        .replace(/&nbsp;/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 2);
}

async function fetchOnThisDay() {
  try {
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const month = nowJST.getUTCMonth() + 1;
    const day = nowJST.getUTCDate();
    const pageTitle = t.wikiPageTitle(month, day);
    const lang = t.wikiLang;

    // 日本語: 「できごと」節(section=1)だけを取る（従来どおり）
    // 英語:   ページ全体を取り、Events 〜 Births を切り出す
    const sectionParam = lang === "ja" ? "&section=1" : "";
    const url = `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json${sectionParam}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "DailyRadio/1.0 (github.com/kyouta89/Daily-Radio)" },
      signal: AbortSignal.timeout(20000), // 無応答時にパイプラインを止めない
    });
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    const json = await res.json();
    let wikitext = json?.parse?.wikitext?.["*"];
    if (!wikitext) throw new Error("wikitext empty");

    if (lang !== "ja") {
      // == Events == から == Births == の手前までを対象にする
      const start = wikitext.search(/==\s*Events\s*==/i);
      const end = wikitext.search(/==\s*Births\s*==/i);
      if (start !== -1) {
        wikitext = wikitext.slice(start, end !== -1 && end > start ? end : undefined);
      }
    }

    const cleaned = extractEventLines(wikitext).join("\n");

    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.warn(`⚠️ 「今日は何の日」取得失敗（プロンプトなしで続行）: ${err.message}`);
    return null;
  }
}

module.exports = { fetchOnThisDay };
