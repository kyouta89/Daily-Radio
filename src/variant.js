// 日替わりバリエーション。日付をシードに「今日のムード」と声・テンションを決める。
// 同じ日付なら必ず同じ結果（再現可能・Notionに記録できる）だが、日ごとに大きく変わる。
// 純粋関数として返し、script.js(執筆トーン)と audio.js(声・演技指示)の両方から参照する想定。

// 声プール（Gemini/Chirp 共通の星名ボイス。ja-JPで自然だったものを中心に選抜）
const FEMALE_VOICES = ["Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Autonoe", "Sulafat", "Despina"];
const MALE_VOICES = ["Charon", "Orus", "Puck", "Fenrir", "Iapetus", "Algieba", "Enceladus", "Schedar"];

// ムード（今日の番組の空気）。style は TTS の演技指示に、tone は原稿の書き方に効かせる。
const MOODS = [
  {
    id: "morning-fresh",
    label: "爽快モーニング",
    style: "明るくハキハキ爽やかに、朝の目覚めにちょうどいい軽快なテンポで",
    tone: "前向きで元気。リスナーの一日を後押しするような明るさ",
  },
  {
    id: "midnight-chill",
    label: "まったり深夜便",
    style: "落ち着いた低めのトーンでしっとりと、間をたっぷり取って",
    tone: "ゆったり内省的。小声で語りかけるような親密さ",
  },
  {
    id: "friday-hype",
    label: "ハイテンション",
    style: "テンション高めに、笑いを交えてノリノリで勢いよく",
    tone: "お祭り感。ツッコミやリアクション多めで賑やか",
  },
  {
    id: "news-anchor",
    label: "知的キャスター",
    style: "落ち着いた硬派なニュースキャスター調で、信頼感を持って",
    tone: "端正で理知的。事実を丁寧に、少しフォーマルに",
  },
  {
    id: "comedy",
    label: "コミカル漫才",
    style: "ボケとツッコミの掛け合いを強めに、軽快でユーモラスに",
    tone: "笑い重視。脱線と例えツッコミを恐れず、テンポよく",
  },
  {
    id: "emotional",
    label: "エモい語り",
    style: "情感を込めてドラマチックに、大事なところで間を活かして",
    tone: "感情に寄せる。ニュースの人間ドラマや意味を掘り下げる",
  },
  {
    id: "cafe-lazy",
    label: "気だるげカフェ",
    style: "力を抜いたゆるい雰囲気で、友達と雑談するみたいに",
    tone: "肩の力が抜けた雑談調。ぼやきや素の反応を挟む",
  },
];

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
  const voiceA = pickFor(dateStr, "voiceA", FEMALE_VOICES); // ミナ(女性)
  const voiceB = pickFor(dateStr, "voiceB", MALE_VOICES); // リク(男性)
  return { dateStr, mood, voiceA, voiceB };
}

module.exports = { getDailyVariant, MOODS, FEMALE_VOICES, MALE_VOICES };
