// 日替わりバリエーション。日付をシードに「今日のムード」と声・テンションを決める。
// 同じ日付なら必ず同じ結果（再現可能・Notionに記録できる）だが、日ごとに大きく変わる。
// 純粋関数として返し、script.js(執筆トーン)と audio.js(声・演技指示)の両方から参照する想定。

// ムードの文言は言語別（src/i18n.js）。id と並び順は ja/en で揃えてあるので、
// 同じ日付なら言語を変えても同じムードが選ばれる（再現性を維持）。
const { t } = require("./i18n");

// 声プール（Gemini/Chirp 共通の星名ボイス。言語非依存＝テキストの言語に追従して喋る）
const FEMALE_VOICES = ["Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Autonoe", "Sulafat", "Despina"];
const MALE_VOICES = ["Charon", "Orus", "Puck", "Fenrir", "Iapetus", "Algieba", "Enceladus", "Schedar"];

// ムード（今日の番組の空気）。style は TTS の演技指示に、tone は原稿の書き方に効かせる。
const MOODS = t.moods;

// --- 日付シードの決定的乱数（同じ日付→同じ番組） ---
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// dateStr は "YYYY-MM-DD"(JST)。次元ごとに別ソルトでシードを引き、隣接日の相関をなくす。
function pickFor(dateStr, salt, arr) {
  const rng = mulberry32(hashStr(dateStr + ":" + salt));
  rng(); // ウォームアップ（初回値の偏りを捨てる）
  return pick(rng, arr);
}

function getDailyVariant(dateStr) {
  const mood = pickFor(dateStr, "mood", MOODS);
  const voiceA = pickFor(dateStr, "voiceA", FEMALE_VOICES); // HOST_A(女性)
  const voiceB = pickFor(dateStr, "voiceB", MALE_VOICES); // HOST_B(男性)
  return { dateStr, mood, voiceA, voiceB };
}

module.exports = { getDailyVariant, MOODS, FEMALE_VOICES, MALE_VOICES };
