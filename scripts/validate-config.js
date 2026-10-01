// 番組設定の検証。push のたびに GitHub Actions から実行される（.github/workflows/check-config.yml）。
//
// ねらい: ブラウザだけで src/config.js を編集する人が、カンマの消し忘れや必須項目の空欄に
// 「翌朝の配信が失敗して」気づくのではなく、Commit の30秒後に気づけるようにすること。
// エラー文は非エンジニアが読む前提で、原因と直し方まで日本語で書く。
//
// npm パッケージには依存しない（config / i18n / axes はどれも外部依存なし）ので、
// npm ci を待たずに最速で落とせる。
//
// 実行: node scripts/validate-config.js   （SHOW_LANG=ja / en をそれぞれ検証したいので2回呼ぶ）

const problems = [];
const notes = [];

const lang = (process.env.SHOW_LANG || "ja").toLowerCase() === "en" ? "en" : "ja";
console.log(`\n=== 設定チェック (SHOW_LANG=${lang}) ===\n`);

// --- 1. config.js が読み込めるか（構文エラーはここで出る） ---
let config;
try {
  config = require("../src/config");
} catch (e) {
  console.error("❌ src/config.js を読み込めませんでした。");
  console.error(`   理由: ${e.message}`);
  console.error("");
  console.error("   よくある原因: カンマ(,)やカギ括弧({ })、ダブルクォート(\")の消し忘れ。");
  console.error("   直し方: GitHub で src/config.js を開き、直前の編集を見直してください。");
  console.error("   元に戻したい場合は、ファイル右上の History から以前の版に戻せます。");
  process.exit(1);
}

const { SHOW, LOCATION, HOSTS, LANG } = config;

// --- 2. 番組のメタ情報 ---
function requireText(obj, key, where, label) {
  const v = obj && obj[key];
  if (typeof v !== "string" || v.trim() === "") {
    problems.push(`${where} の ${key}（${label}）が空です。src/config.js で "" の中に文字を入れてください。`);
    return null;
  }
  return v.trim();
}

if (!SHOW) {
  problems.push("src/config.js に SHOW が見つかりません。");
} else {
  requireText(SHOW, "title", "SHOW", "番組名");
  requireText(SHOW, "description", "SHOW", "番組の説明");
  requireText(SHOW, "author", "SHOW", "配信者名");
  const cat = requireText(SHOW, "category", "SHOW", "カテゴリ");
  // Apple のカテゴリは決まった名前しか受け付けない。よく使うものだけ通し、他は警告にとどめる。
  const KNOWN = ["Technology", "Business", "News", "Education", "Arts", "Science", "Society & Culture", "Health & Fitness", "Leisure"];
  if (cat && !KNOWN.includes(cat)) {
    notes.push(`SHOW.category が "${cat}" です。Apple が認識するカテゴリ名（例: ${KNOWN.slice(0, 3).join(" / ")}）か確認してください。`);
  }
}

// --- 3. 天気の地点 ---
if (!LOCATION) {
  problems.push("src/config.js に LOCATION が見つかりません。");
} else {
  const { lat, lon } = LOCATION;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    problems.push(`LOCATION.lat（緯度）が数値として正しくありません: ${JSON.stringify(lat)} 。-90〜90 の数字を、クォートで囲まずに書いてください（例: 35.5206）。`);
  }
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    problems.push(`LOCATION.lon（経度）が数値として正しくありません: ${JSON.stringify(lon)} 。-180〜180 の数字を、クォートで囲まずに書いてください（例: 139.7172）。`);
  }
  requireText(LOCATION, "label", "LOCATION", "読み上げる地名");
}

// --- 4. パーソナリティ2人（台本と音声をつなぐ契約なので一番厳しく見る） ---
// audio.js は HOST_A.name / HOST_B.name をそのまま正規表現に埋め込んで話者行を判定する。
// 名前に正規表現の記号やコロンが入ると、台本と音声の対応が壊れて無音や取り違えになる。
const BAD_CHARS = /[.*+?^${}()|[\]\\:：\n\r\t]/;

if (!HOSTS || !HOSTS.A || !HOSTS.B) {
  problems.push("src/config.js に HOSTS.A と HOSTS.B の2人分が揃っていません。");
} else {
  const names = {};
  for (const slot of ["A", "B"]) {
    const h = HOSTS[slot];
    const who = slot === "A" ? "HOSTS.A（女性の声）" : "HOSTS.B（男性の声）";
    const name = requireText(h, "name", who, "名前");
    requireText(h, "persona", who, "性格の説明");
    requireText(h, "ttsInstructions", who, "話し方の指示");
    if (name) {
      names[slot] = name;
      if (BAD_CHARS.test(name)) {
        problems.push(`${who} の名前 "${name}" に使えない記号が入っています。コロン(:)や記号( . * + ? ( ) [ ] | \\ )は台本と音声の対応を壊すので、ひらがな・カタカナ・漢字・英字だけにしてください。`);
      }
      if (name.length > 12) {
        notes.push(`${who} の名前 "${name}" はやや長めです。毎回読み上げられるので、短いほうが聴きやすくなります。`);
      }
    }
  }
  if (names.A && names.B && names.A === names.B) {
    problems.push(`HOSTS.A と HOSTS.B の名前が同じ（"${names.A}"）です。2人を区別できないと音声の割り当てが壊れるので、別の名前にしてください。`);
  }
}

// --- 5. 言語ファイルと、言語の取り違え ---
let t;
try {
  t = require("../src/i18n").t;
} catch (e) {
  problems.push(`src/i18n.js を読み込めませんでした: ${e.message}`);
}
if (t && (!Array.isArray(t.moods) || t.moods.length === 0)) {
  problems.push("src/i18n.js のムード一覧が空です。");
}
if (LANG !== lang) {
  problems.push(`SHOW_LANG=${lang} を指定したのに、config 側は ${LANG} として読み込まれました。設定の読み取りがおかしい可能性があります。`);
}

// --- 6. ニュースの取得元 ---
try {
  const { RSS_AXES } = require("../src/axes");
  if (!Array.isArray(RSS_AXES) || RSS_AXES.length === 0) {
    problems.push("src/axes.js のニュース取得元（RSS_AXES）が空です。最低1つは必要です。");
  } else {
    RSS_AXES.forEach((axis, i) => {
      if (!axis || typeof axis.name !== "string" || axis.name.trim() === "") {
        problems.push(`src/axes.js の ${i + 1} 番目のコーナーに name（コーナー名）がありません。`);
      }
      if (!Array.isArray(axis.urls) || axis.urls.length === 0) {
        problems.push(`src/axes.js の「${axis && axis.name}」に urls（RSSのURL）が1つもありません。`);
      } else {
        axis.urls.forEach((u) => {
          if (typeof u !== "string" || !/^https?:\/\//.test(u)) {
            problems.push(`src/axes.js の「${axis.name}」に、URLとして正しくない値があります: ${JSON.stringify(u)}`);
          }
        });
      }
    });
    notes.push(`コーナー数は ${RSS_AXES.length} です（エンディングの「${RSS_AXES.length}つのコーナー」は自動で合わせられます）。`);
  }
} catch (e) {
  problems.push(`src/axes.js を読み込めませんでした: ${e.message}`);
}

// --- 結果 ---
if (SHOW && SHOW.title) {
  console.log(`番組名　　: ${SHOW.title}`);
}
if (HOSTS && HOSTS.A && HOSTS.B) {
  console.log(`パーソナリティ: ${HOSTS.A.name} / ${HOSTS.B.name}`);
}
if (LOCATION) {
  console.log(`天気の地点: ${LOCATION.label}（${LOCATION.lat}, ${LOCATION.lon}）`);
}
console.log("");

for (const n of notes) console.log(`ℹ️  ${n}`);
if (notes.length) console.log("");

if (problems.length === 0) {
  console.log("✅ 設定に問題は見つかりませんでした。");
  process.exit(0);
}

console.error(`❌ 設定に ${problems.length} 件の問題が見つかりました。\n`);
problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
console.error("\n直したらもう一度 Commit すれば、このチェックが再実行されます。");
process.exit(1);
