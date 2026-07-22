// splitIntoSections の回帰チェック（テストランナー不要・素の node で実行）。
//   node test/split-sections.js
//
// 目的: マルチスピーカーTTSは「1セクション=1リクエスト」なので、台本が
// 日次クォータ(100)に収まる少数のセクションに畳めることを固定サンプルで保証する。
// fixtures/sample-script.txt は本番相当の94発話台本（発話ごとに空行あり）。
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { splitIntoSections } = require("../src/audio");

const script = fs.readFileSync(
  path.join(__dirname, "fixtures", "sample-script.txt"),
  "utf8"
);

const HOST_A = "ミナ";
const HOST_B = "リク";
const isUtterance = (l) =>
  new RegExp(`^\\s*(${HOST_A}|${HOST_B})\\s*[:：]`).test(l);
const utterCount = script.split("\n").filter(isUtterance).length;

const sections = splitIntoSections(script); // 既定 maxChars=2500

console.log(`発話数 ${utterCount} → ${sections.length} セクション`);
sections.forEach((s, i) => {
  const speakers = [...new Set(s.split("\n").map((l) => l.split(/[:：]/)[0]))];
  console.log(`  [${i + 1}] ${s.length}文字 / 話者:${speakers.join(",")}`);
});

// 1) 空行区切りでも1発話ずつに割れず、日次100に余裕で収まる少数に畳まれること
assert.ok(sections.length >= 1, "セクションが空");
assert.ok(
  sections.length <= 10,
  `セクションが多すぎる(${sections.length})。空行で割れている可能性`
);

// 2) どのセクションも 32k トークンの目安(=maxChars 2500)を超えないこと
for (const s of sections) {
  assert.ok(s.length <= 2500, `セクションが maxChars 超過: ${s.length}文字`);
}

// 3) 全発話が保存され、取りこぼしが無いこと
const rejoinedUtters = sections
  .join("\n")
  .split("\n")
  .filter(isUtterance).length;
assert.strictEqual(
  rejoinedUtters,
  utterCount,
  `発話数が一致しない: 元${utterCount} vs 分割後${rejoinedUtters}`
);

console.log("✅ 全アサーション通過");
