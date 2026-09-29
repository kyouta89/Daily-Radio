// ============================================================
//  言語別の定型文（ja / en）— 通常は編集不要
// ============================================================
// 番組固有の値（番組名・地名・ホスト名）は src/config.js にあります。
// ここにあるのは「どの言語で喋る/書くか」の定型文だけです。
// SHOW_LANG=en にすると全プロンプト・ムード・TTS指示が英語に切り替わります。
const { LANG } = require("./config");

const JA = {
  wikiLang: "ja",
  wikiPageTitle: (m, d) => `${m}月${d}日`,
  todayLabel: (m, d) => `${m}月${d}日`,

  // 天気コードの表示名
  weatherConditions: {
    clear: "晴れ", cloudy: "曇り", rain: "雨",
    snow: "雪", shower: "にわか雨", thunder: "雷雨",
  },
  weatherUnavailable: "天気情報は現在取得できません。",
  weatherInfo: ({ condition, maxTemp, minTemp, rainProb }) =>
    `今日の天気は${condition}、最高気温は${maxTemp}度、最低気温は${minTemp}度、降水確率は${rainProb}%です。`,

  // 7つのムード（style=TTSの演技指示 / tone=原稿の書き方）
  moods: [
    { id: "morning-fresh", label: "爽快モーニング", style: "明るくハキハキ爽やかに、朝の目覚めにちょうどいい軽快なテンポで", tone: "前向きで元気。リスナーの一日を後押しするような明るさ" },
    { id: "midnight-chill", label: "まったり深夜便", style: "落ち着いた低めのトーンでしっとりと、間をたっぷり取って", tone: "ゆったり内省的。小声で語りかけるような親密さ" },
    { id: "friday-hype", label: "ハイテンション", style: "テンション高めに、笑いを交えてノリノリで勢いよく", tone: "お祭り感。ツッコミやリアクション多めで賑やか" },
    { id: "news-anchor", label: "知的キャスター", style: "落ち着いた硬派なニュースキャスター調で、信頼感を持って", tone: "端正で理知的。事実を丁寧に、少しフォーマルに" },
    { id: "comedy", label: "コミカル漫才", style: "ボケとツッコミの掛け合いを強めに、軽快でユーモラスに", tone: "笑い重視。脱線と例えツッコミを恐れず、テンポよく" },
    { id: "emotional", label: "エモい語り", style: "情感を込めてドラマチックに、大事なところで間を活かして", tone: "感情に寄せる。ニュースの人間ドラマや意味を掘り下げる" },
    { id: "cafe-lazy", label: "気だるげカフェ", style: "力を抜いたゆるい雰囲気で、友達と雑談するみたいに", tone: "肩の力が抜けた雑談調。ぼやきや素の反応を挟む" },
  ],

  systemPlanner: "あなたはテック系ラジオ番組の放送作家です。",
  systemWriter: "あなたはテック系ラジオ番組の放送作家兼パーソナリティです。",
  systemEditor: "あなたはプロのテックメディアの編集長です。JSONのみを返します。",
  systemDirector: "あなたはテック番組のディレクターです。",

  dialogueRules: ({ a, b, personaA, personaB }) => `【対話の書式ルール(厳守)】
・登場人物は2人だけ。${a}（${personaA}）と ${b}（${personaB}）。
・各発言は必ず「${a}: 」または「${b}: 」で始める1行にする。話者名以外のラベルは使わない。
・ト書き・括弧書き・効果音の説明（例:「(笑い)」「(SEと共に)」）は一切書かない。
・Markdown記号（#、*、-など）は使わず、そのまま読み上げ可能なプレーンテキストのみ。
・「〇〇」「××」のような未確定のプレースホルダーは絶対に書かない。
・自己紹介や名乗り（「私は〇〇です」）はしない。
・対話文のみを出力し、前置き・後書き・解説などのメタコメントは書かない。`,

  moodBlock: (tone) =>
    `\n【今日の番組トーン】\n${tone}\nこのトーンで会話全体の空気・言葉選び・テンションを統一する（ただし書式ルールは厳守）。`,

  dateBlock: ({ y, m, d }) =>
    `\n【今日の日付（厳守）】今日は${y}年${m}月${d}日。番組内で年や「今年」「昨年」等に言及する際は必ずこの日付を基準にし、資料と異なる年を口にしない。`,

  onThisDayBlock: (todayStr, raw) =>
    `\n【今日（${todayStr}）の歴史的出来事 — Wikipedia「${todayStr}」ページ抜粋】\n${raw}\n\n上記からITやコンピュータ・通信・テクノロジーに関連する出来事を1つだけ選び、年号と共に小ネタとして紹介する。該当が無ければ無理に選ばず、季節や気象の親しみやすい話題に置き換える。資料に無い出来事を作らない。`,
  onThisDayMissing:
    `\n資料が取得できなかったため「今日は何の日」は省略し、季節や気象の親しみやすい話題に置き換える。`,

  openingPrompt: ({ a, b, rules, mood, date, weatherInfo, onThisDay, location }) =>
    `${a}と${b}が進行するテック系ラジオ番組のオープニングを、2人の掛け合いで作成してください。
${rules}${mood}${date}

【含める2要素】
1. 天気と気遣い: ${location}の天気を伝え、「洗濯物を干せるか」など生活に密着したアドバイスを添える。
   [気象情報]: ${weatherInfo}
2. 今日は何の日:${onThisDay}

【分量】合計で概ね300〜450文字程度の自然な会話。番組の始まりらしく元気に。`,

  editorPrompt: ({ axisName, hint, priority, exclusion, list }) =>
    `あなたはプロのテックメディアの編集長です。
以下のニュースリストから、エンジニアや経営者にとって最も価値のあるニュースを「1つ」だけ厳選してください。
なるべく新しい記事（【】内に「◯日前」を表示）を優先してください。
出力は次のJSONのみ。Markdownのコードフェンス(\`\`\`)は使わないでください。

{"title": "記事のタイトル", "url": "記事のURL", "reason": "選んだ理由(100文字程度)"}

【軸】${axisName}${hint}${priority}${exclusion}
【ニュースリスト】
${list}`,

  hintBlock: (hint) => `\n【この軸の選定方針】\n${hint}\n`,
  priorityNote: ({ keyword, maxAgeDays }) =>
    `\n【最優先ルール】${keyword}の新鮮な記事（${maxAgeDays}日以内）があるため、候補は${keyword}関連に限定しています。この中から最良の1件を選んでください。\n`,
  exclusionBlock: (urls) =>
    `\n【除外対象URL（過去14日に既出のため避ける）】\n${urls}\n上記URLの記事は選ばない。ただし候補の全件が除外対象の場合に限り、その中から最良の1つを選ぶ。\n`,
  itemLine: ({ site, age, title, link }) => `- 【${site}｜${age}】${title} (${link})`,
  ageDays: (n) => (n == null ? "日付不明" : `${n}日前`),

  writerPrompt: ({ a, b, axisName, rules, mood, date, title, url, reason, body }) =>
    `「${axisName}」コーナーのニュース解説を、${a}と${b}の対話で書いてください。
${rules}${mood}${date}

【重要】
・「続いては${axisName}のコーナーです」のような自然な導入から ${a} が始める。
・${b} が素朴な質問や相槌を挟み、${a} が専門用語をかみ砕いて答える掛け合いにする。
・記事の要約が与えられている場合はその内容に忠実に。与えられていない事実を断定で創作しない。
・分量は概ね1200〜1600文字程度で、面白く深掘りする。

【取り上げる記事】
タイトル: ${title}
URL: ${url}
編集長の選定理由: ${reason}${body}`,
  bodyBlock: (snippet) => `\n記事の要約(参考): ${snippet}`,

  // コーナー数は軸の数から自動で決まる（軸を増減しても文言がズレない）
  endingText: ({ a, b, cornerCount }) =>
    `${a}: 以上、今日も${cornerCount}つのコーナーをお届けしました！気になった記事はNotionにリンクをまとめているので、ぜひチェックしてみてくださいね。\n${b}: 今日も一日、元気にいきましょう！それでは、また明日。\n`,

  directorPrompt: (scriptHead) =>
    `以下のラジオ原稿を読み、エンジニア向けのタグと、番組を聴かなくても要点がつかめるサマリーを生成してください。
次のフォーマットのみを出力し、Markdown記号は使わないでください。

---TAGS_START---
(タグをカンマ区切りで3つ。例: React, Career, AI)
---TAGS_END---

---TAKEAWAY_START---
(今日のニュース全体の要点を4〜6行で。各行は「・」で始め、具体的な固有名詞や数字を残して簡潔に)
---TAKEAWAY_END---

【ラジオ原稿(冒頭部分)】
${scriptHead}`,
  fallbackTags: "Tech, News",
  fallbackTakeaway: (n) => `本日は${n}つのコーナーをお届けしました。`,

  ttsMultiPrompt: ({ a, b, style, text }) =>
    `次の${a}と${b}による会話を、${style}という雰囲気で、台本のとおり自然な掛け合いで読み上げてください。返答・相槌・補足・ナレーションは加えず、各話者のセリフだけを音声化すること。\n\n${text}`,
  ttsSinglePrompt: ({ style, text, strict }) =>
    `次の「」内のセリフを、${style}という声色で、一字一句そのまま読み上げてください。${strict}あなたは音声読み上げ機です。返答・相槌・補足・ナレーションは一切加えず、括弧内のテキストだけを音声化すること。\n「${text}」`,
  ttsStrict: "【厳守】これは音声合成です。会話ではありません。返事・応答・補足を絶対に生成せず、",

  moodCallout: ({ label, voiceA, voiceB }) => `🎭 本日のムード: ${label}（声: ${voiceA} / ${voiceB}）`,
  notionHeadingLinks: "🔗 紹介した記事リスト",
  notionHeadingScript: "📻 ラジオ原稿",
  notionKeyTakeaway: "💡 Key Takeaway",
  episodeTitle: (dateStr) => `${dateStr} ニュース`,
  summaryLinksHeading: "紹介した記事",
};

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EN = {
  wikiLang: "en",
  wikiPageTitle: (m, d) => `${MONTHS_EN[m - 1]} ${d}`,
  todayLabel: (m, d) => `${MONTHS_EN[m - 1]} ${d}`,

  weatherConditions: {
    clear: "clear", cloudy: "cloudy", rain: "rainy",
    snow: "snowy", shower: "showers", thunder: "thunderstorms",
  },
  weatherUnavailable: "Weather information is unavailable right now.",
  weatherInfo: ({ condition, maxTemp, minTemp, rainProb }) =>
    `Today's weather is ${condition}, with a high of ${maxTemp}°C, a low of ${minTemp}°C, and a ${rainProb}% chance of rain.`,

  moods: [
    { id: "morning-fresh", label: "Fresh Morning", style: "bright, crisp and upbeat, at a light tempo that suits waking up", tone: "positive and energetic — the kind of brightness that pushes the listener into their day" },
    { id: "midnight-chill", label: "Late Night Chill", style: "calm and low-pitched, unhurried, leaving generous pauses", tone: "relaxed and reflective, an intimate almost-whispered delivery" },
    { id: "friday-hype", label: "High Energy", style: "high energy and playful, riding the momentum with plenty of laughs", tone: "festive, with lots of reactions and banter" },
    { id: "news-anchor", label: "Newsroom Anchor", style: "composed, serious newsroom-anchor delivery that conveys authority", tone: "precise and analytical, handling facts carefully and a little formally" },
    { id: "comedy", label: "Comedy Duo", style: "a strong comic double-act, light and humorous", tone: "comedy-first, unafraid of tangents and playful jabs, brisk pacing" },
    { id: "emotional", label: "Heartfelt", style: "warm and dramatic, using pauses at the key moments", tone: "leaning into emotion, digging into the human story and the meaning behind the news" },
    { id: "cafe-lazy", label: "Lazy Cafe", style: "loose and unhurried, like chatting with a friend", tone: "a casual small-talk register, with honest grumbles and unfiltered reactions" },
  ],

  systemPlanner: "You are a radio scriptwriter for a technology news show.",
  systemWriter: "You are a scriptwriter and on-air personality for a technology news radio show.",
  systemEditor: "You are the editor-in-chief of a professional tech media outlet. You return JSON only.",
  systemDirector: "You are the director of a technology news radio show.",

  dialogueRules: ({ a, b, personaA, personaB }) => `[DIALOGUE FORMAT RULES — STRICT]
- There are exactly two speakers: ${a} (${personaA}) and ${b} (${personaB}).
- Every line of dialogue MUST begin with "${a}: " or "${b}: " on its own line. Use no other labels.
- Never write stage directions, parentheticals, or sound-effect notes (e.g. "(laughs)", "(with SFX)").
- Use no Markdown symbols (#, *, -). Output plain text that can be read aloud as-is.
- Never write unresolved placeholders such as "XXX" or "TBD".
- The hosts do not introduce themselves by name (no "I'm ___").
- Output the dialogue only — no preamble, no closing notes, no meta commentary.`,

  moodBlock: (tone) =>
    `\n[TODAY'S SHOW TONE]\n${tone}\nKeep the atmosphere, word choice and energy of the whole conversation consistent with this tone (while strictly obeying the format rules).`,

  dateBlock: ({ y, m, d }) =>
    `\n[TODAY'S DATE — STRICT] Today is ${MONTHS_EN[m - 1]} ${d}, ${y}. Whenever you mention a year, "this year", "last year" and so on, base it on this date, and never state a year that contradicts the source material.`,

  onThisDayBlock: (todayStr, raw) =>
    `\n[HISTORICAL EVENTS FOR TODAY (${todayStr}) — excerpt from the Wikipedia "${todayStr}" page]\n${raw}\n\nPick exactly ONE event related to IT, computing, telecoms or technology and introduce it with its year as a short piece of trivia. If nothing fits, do not force it — replace it with a friendly seasonal or weather-related topic instead. Never invent an event that is not in the source.`,
  onThisDayMissing:
    `\nThe source could not be fetched, so skip the "on this day" segment and replace it with a friendly seasonal or weather-related topic.`,

  openingPrompt: ({ a, b, rules, mood, date, weatherInfo, onThisDay, location }) =>
    `Write the opening of a technology news radio show hosted by ${a} and ${b}, as a back-and-forth between the two.
${rules}${mood}${date}

[INCLUDE THESE TWO ELEMENTS]
1. Weather and a thoughtful touch: report the weather for ${location} and add a practical, daily-life tip (for example, whether it is a good day to dry laundry outside).
   [WEATHER DATA]: ${weatherInfo}
2. On this day:${onThisDay}

[LENGTH] Roughly 250-350 words of natural conversation in total. Open with energy, like the start of a show.`,

  editorPrompt: ({ axisName, hint, priority, exclusion, list }) =>
    `You are the editor-in-chief of a professional tech media outlet.
From the news list below, select exactly ONE story that is most valuable to engineers and business leaders.
Prefer more recent articles (the age is shown in brackets as "N days ago").
Output ONLY the following JSON. Do not use Markdown code fences (\`\`\`).

{"title": "article title", "url": "article URL", "reason": "why you picked it (about 100 characters)"}

[TOPIC] ${axisName}${hint}${priority}${exclusion}
[NEWS LIST]
${list}`,

  hintBlock: (hint) => `\n[SELECTION POLICY FOR THIS TOPIC]\n${hint}\n`,
  priorityNote: ({ keyword, maxAgeDays }) =>
    `\n[TOP PRIORITY RULE] A fresh ${keyword} article (within ${maxAgeDays} days) exists, so the candidate list is restricted to ${keyword}-related stories. Pick the best one from these.\n`,
  exclusionBlock: (urls) =>
    `\n[EXCLUDED URLS — already covered in the last 14 days, avoid these]\n${urls}\nDo not pick articles with the URLs above. Only if EVERY candidate is excluded, pick the single best one among them.\n`,
  itemLine: ({ site, age, title, link }) => `- [${site} | ${age}] ${title} (${link})`,
  ageDays: (n) => (n == null ? "date unknown" : `${n} days ago`),

  writerPrompt: ({ a, b, axisName, rules, mood, date, title, url, reason, body }) =>
    `Write the "${axisName}" segment — a news explainer — as a dialogue between ${a} and ${b}.
${rules}${mood}${date}

[IMPORTANT]
- ${a} opens with a natural transition such as "Next up is our ${axisName} segment."
- ${b} interjects with simple questions and reactions, and ${a} answers by breaking the jargon down in plain language.
- If an article summary is provided, stay faithful to it. Never assert invented facts that are not in the source.
- Aim for roughly 700-1000 words, exploring the story in an entertaining way.

[ARTICLE TO COVER]
Title: ${title}
URL: ${url}
Editor's reason for picking it: ${reason}${body}`,
  bodyBlock: (snippet) => `\nArticle summary (for reference): ${snippet}`,

  endingText: ({ a, b, cornerCount }) =>
    `${a}: And that's all ${cornerCount} segments for today! Links to every story are collected in Notion, so do go and check them out.\n${b}: Have a great day, everyone. See you tomorrow!\n`,

  directorPrompt: (scriptHead) =>
    `Read the radio script below and produce tags for an engineering audience, plus a summary that conveys the key points without listening to the episode.
Output ONLY the following format. Do not use Markdown symbols.

---TAGS_START---
(three comma-separated tags, e.g. React, Career, AI)
---TAGS_END---

---TAKEAWAY_START---
(the key points of today's news in 4-6 lines; start each line with "- " and keep concrete names and numbers)
---TAKEAWAY_END---

[RADIO SCRIPT (opening portion)]
${scriptHead}`,
  fallbackTags: "Tech, News",
  fallbackTakeaway: (n) => `Today we brought you ${n} segments.`,

  ttsMultiPrompt: ({ a, b, style, text }) =>
    `Read the following conversation between ${a} and ${b} aloud exactly as scripted, as a natural back-and-forth, in this mood: ${style}. Do not add replies, filler, commentary or narration — voice only the lines of each speaker.\n\n${text}`,
  ttsSinglePrompt: ({ style, text, strict }) =>
    `Read the line inside the quotation marks below aloud, word for word, in this voice: ${style}. ${strict}You are a text-to-speech machine. Do not add any reply, filler, commentary or narration — voice only the quoted text.\n"${text}"`,
  ttsStrict: "[STRICT] This is speech synthesis, not a conversation. Never generate a reply, response or addition. ",

  moodCallout: ({ label, voiceA, voiceB }) => `🎭 Today's mood: ${label} (voices: ${voiceA} / ${voiceB})`,
  notionHeadingLinks: "🔗 Stories covered",
  notionHeadingScript: "📻 Radio script",
  notionKeyTakeaway: "💡 Key Takeaway",
  episodeTitle: (dateStr) => `${dateStr} News`,
  summaryLinksHeading: "Stories covered",
};

const t = LANG === "en" ? EN : JA;

module.exports = { t, LANG };
