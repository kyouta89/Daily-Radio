// parseLinkLines の回帰チェック（テストランナー不要・素の node で実行）。
//   node test/parse-link-lines.js
//
// 目的: リンク一覧の「タイトル\tURL」分解で、タイトルに "|" が含まれても URL を
// 取り違えないこと。旧実装は "|" 区切りで、東洋経済「… | ライフ | 東洋経済オンライン」や
// Lenny's「… | 著者名」のようなタイトルだと URL がずれて無効化→リンクが保存されず、
// dedup の照合キー(URL)が失われて「同じ記事が毎日再選出」される不具合になっていた。
const assert = require("assert");
const { parseLinkLines } = require("../src/notion");

// 1) 通常ケース
{
  const r = parseLinkLines("Sam Altman is ready to decelerate\thttps://techcrunch.com/x\n");
  assert.deepStrictEqual(r, [
    { title: "Sam Altman is ready to decelerate", url: "https://techcrunch.com/x" },
  ]);
}

// 2) タイトルに "|" が1個（Lenny's「… | 著者名」）→ URLを取り違えない（本不具合の実例）
{
  const line =
    "Anthropic's first technical PM on token maxing | Dianne Penn\thttps://www.lennysnewsletter.com/p/anthropics-first-technical-pm-on";
  const [r] = parseLinkLines(line);
  assert.strictEqual(
    r.url,
    "https://www.lennysnewsletter.com/p/anthropics-first-technical-pm-on",
    "URLが著者名に化けてはいけない"
  );
  assert.strictEqual(r.title, "Anthropic's first technical PM on token maxing | Dianne Penn");
}

// 3) タイトルに "|" が複数（東洋経済「… | ライフ | 東洋経済オンライン」）
{
  const line =
    "実写版モアナが白雪姫並みにコケそうな理由 | ビジネス | 東洋経済オンライン\thttps://toyokeizai.net/articles/-/123";
  const [r] = parseLinkLines(line);
  assert.strictEqual(r.url, "https://toyokeizai.net/articles/-/123");
  assert.ok(r.title.includes("| ビジネス | 東洋経済オンライン"), "タイトルはパイプ込みで保持");
}

// 4) 複数行 + 空行/不正行は捨てる
{
  const raw = "A\thttps://a.example\n\nB\thttps://b.example\nタブ無し行は無視\n";
  const r = parseLinkLines(raw);
  assert.deepStrictEqual(r.map((x) => x.url), ["https://a.example", "https://b.example"]);
}

// 5) URL欠落（タブはあるが右側が空）は捨てる
{
  const r = parseLinkLines("タイトルだけ\t\n");
  assert.deepStrictEqual(r, []);
}

// 6) 空/undefined でも落ちない
{
  assert.deepStrictEqual(parseLinkLines(""), []);
  assert.deepStrictEqual(parseLinkLines(undefined), []);
}

console.log("✅ parseLinkLines 全アサーション通過");
