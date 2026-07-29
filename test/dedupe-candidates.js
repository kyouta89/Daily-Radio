// dedupeCandidates の回帰チェック（テストランナー不要・素の node で実行）。
//   node test/dedupe-candidates.js
//
// 目的: 過去14日の既出URLを全軸でコード側から確実に除外できること、
// かつ「候補が全件既出」のときだけ除外を解除して最良を選ばせる（軸が空にならない）ことを保証する。
// これは「日をまたいで同じ記事が再登場する」不具合の構造的な再発防止。
const assert = require("assert");
const { dedupeCandidates } = require("../src/script");

const items = [
  { title: "A", link: "https://ex.com/a" },
  { title: "B", link: "https://ex.com/b" },
  { title: "C", link: "https://ex.com/c" },
];

// 1) 除外なし（空Set）→ そのまま・fallbackなし
{
  const r = dedupeCandidates(items, new Set());
  assert.strictEqual(r.items, items, "空Setなら同じ配列参照を返すべき");
  assert.strictEqual(r.fallback, false);
}

// 2) excludedUrls が undefined でも落ちない → そのまま
{
  const r = dedupeCandidates(items, undefined);
  assert.strictEqual(r.items, items);
  assert.strictEqual(r.fallback, false);
}

// 3) 一部が既出 → 既出だけ落ちる・fallbackなし
{
  const r = dedupeCandidates(items, new Set(["https://ex.com/b"]));
  assert.deepStrictEqual(
    r.items.map((i) => i.link),
    ["https://ex.com/a", "https://ex.com/c"],
    "既出のBだけ除外されるべき"
  );
  assert.strictEqual(r.fallback, false);
}

// 4) 全件が既出 → 除外を解除して元の候補を返す・fallback=true（軸を空にしない）
{
  const all = new Set(items.map((i) => i.link));
  const r = dedupeCandidates(items, all);
  assert.strictEqual(r.items.length, items.length, "全件既出なら元の候補に戻すべき");
  assert.strictEqual(r.fallback, true, "全件既出は fallback=true になるべき");
}

// 5) 照合は完全一致（末尾スラッシュ違いは別物扱い＝既存の保存URLと整合）
{
  const r = dedupeCandidates(items, new Set(["https://ex.com/a/"]));
  assert.strictEqual(r.items.length, 3, "末尾スラッシュ違いは一致しない（完全一致セマンティクス）");
  assert.strictEqual(r.fallback, false);
}

console.log("✅ dedupeCandidates 全アサーション通過");
