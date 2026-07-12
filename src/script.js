const AnthropicSDK = require("@anthropic-ai/sdk");
const Anthropic = AnthropicSDK.default || AnthropicSDK; // CJS/ESM両対応
const { fetchWeather } = require("./weather");
const { fetchOnThisDay } = require("./onThisDay");
const { HOST_A, HOST_B } = require("./hosts");

// 執筆モデルは環境変数で切替可能(既定 Opus 4.8)。補助処理は安価な Haiku 4.5。
const WRITER_MODEL = process.env.ANTHROPIC_WRITER_MODEL || "claude-opus-4-8";
const AUX_MODEL = process.env.ANTHROPIC_AUX_MODEL || "claude-haiku-4-5";

const DIALOGUE_RULES = `【対話の書式ルール(厳守)】
・登場人物は2人だけ。${HOST_A.name}（${HOST_A.persona}）と ${HOST_B.name}（${HOST_B.persona}）。
・各発言は必ず「${HOST_A.name}: 」または「${HOST_B.name}: 」で始める1行にする。話者名以外のラベルは使わない。
・ト書き・括弧書き・効果音の説明（例:「(笑い)」「(SEと共に)」）は一切書かない。
・Markdown記号（#、*、-など）は使わず、そのまま読み上げ可能なプレーンテキストのみ。
・「〇〇」「××」のような未確定のプレースホルダーは絶対に書かない。
・自己紹介や名乗り（「私は〇〇です」）はしない。
・対話文のみを出力し、前置き・後書き・解説などのメタコメントは書かない。`;

async function callClaude(client, model, system, userText, maxTokens) {
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userText }],
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function renderItemList(items) {
  return items
    .map((it) => `- 【${it.site}】${it.title} (${it.link})`)
    .join("\n");
}

async function generateScript(axesWithItems, apiKey, excludedUrls = new Set()) {
  try {
    console.log("2. Claudeが構成・リンク抽出・執筆中...");
    const client = new Anthropic({ apiKey, maxRetries: 3 });

    const todayStr = new Date().toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
    });

    // --- フェーズ0: オープニング (天気と今日は何の日) ---
    console.log("  => [Phase 0] オープニング対話を生成中 (Haiku)...");
    const [weatherData, onThisDayRaw] = await Promise.all([
      fetchWeather(),
      fetchOnThisDay(),
    ]);
    let weatherInfo = "天気情報は現在取得できません。";
    if (weatherData) {
      weatherInfo = `今日の天気は${weatherData.condition}、最高気温は${weatherData.maxTemp}度、最低気温は${weatherData.minTemp}度、降水確率は${weatherData.rainProb}%です。`;
    }

    const onThisDayBlock = onThisDayRaw
      ? `\n【今日（${todayStr}）の歴史的出来事 — Wikipedia「${todayStr}」ページ抜粋】\n${onThisDayRaw.slice(0, 6000)}\n\n上記からITやコンピュータ・通信・テクノロジーに関連する出来事を1つだけ選び、年号と共に小ネタとして紹介する。該当が無ければ無理に選ばず、季節や気象の親しみやすい話題に置き換える。資料に無い出来事を作らない。`
      : `\n資料が取得できなかったため「今日は何の日」は省略し、季節や気象の親しみやすい話題に置き換える。`;

    const openingPrompt = `${HOST_A.name}と${HOST_B.name}が進行するテック系ラジオ番組のオープニングを、2人の掛け合いで作成してください。
${DIALOGUE_RULES}

【含める2要素】
1. 天気と気遣い: 神奈川県川崎市の天気を伝え、「洗濯物を干せるか」など生活に密着したアドバイスを添える。
   [気象情報]: ${weatherInfo}
2. 今日は何の日:${onThisDayBlock}

【分量】合計で概ね300〜450文字程度の自然な会話。番組の始まりらしく元気に。`;

    let fullScript = (await callClaude(client, AUX_MODEL, "あなたはテック系ラジオ番組の放送作家です。", openingPrompt, 1500)) + "\n\n";

    // --- フェーズ1: 各軸から1件ずつ厳選 (並列) ---
    console.log("  => [Phase 1] 各軸から最良の1件を厳選中 (Haiku)...");
    const exclusionBlock =
      excludedUrls.size > 0
        ? `\n【除外対象URL（過去14日に既出のため避ける）】\n${[...excludedUrls].join("\n")}\n上記URLの記事は選ばない。ただし候補の全件が除外対象の場合に限り、その中から最良の1つを選ぶ。\n`
        : "";

    const selectionPromises = axesWithItems.map(async (axis) => {
      const hintBlock = axis.selectionHint
        ? `\n【この軸の選定方針】\n${axis.selectionHint}\n`
        : "";
      const editorPrompt = `あなたはプロのテックメディアの編集長です。
以下のニュースリストから、エンジニアや経営者にとって最も価値のあるニュースを「1つ」だけ厳選してください。
出力は次のJSONのみ。Markdownのコードフェンス(\`\`\`)は使わないでください。

{"title": "記事のタイトル", "url": "記事のURL", "reason": "選んだ理由(100文字程度)"}

【軸】${axis.name}${hintBlock}${exclusionBlock}
【ニュースリスト】
${renderItemList(axis.items)}`;

      const text = (
        await callClaude(client, AUX_MODEL, "あなたはプロのテックメディアの編集長です。JSONのみを返します。", editorPrompt, 500)
      )
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      try {
        const selected = JSON.parse(text);
        // 選ばれた記事の本文スニペットを引き当てる(執筆の正確さ向上のため)
        const match = axis.items.find((it) => it.link === selected.url);
        selected.snippet = match ? match.snippet : "";
        console.log(`     ✅ [${axis.name}] 選定: ${selected.title}`);
        return { axis: axis.name, ...selected };
      } catch (e) {
        console.error(`JSONパースエラー [${axis.name}]:`, text);
        throw new Error(`[${axis.name}] の選定AIの出力が不正なフォーマットでした。`);
      }
    });

    const selectedNews = await Promise.all(selectionPromises);

    // --- フェーズ2: コーナーごとに対話原稿を執筆 (Opus) ---
    console.log(`  => [Phase 2] ${selectedNews.length}コーナーの対話を執筆中 (${WRITER_MODEL})...`);
    let linksRaw = "";

    for (let i = 0; i < selectedNews.length; i++) {
      const news = selectedNews[i];
      console.log(`     - 執筆中 (${i + 1}/${selectedNews.length}): [${news.axis}] ${news.title}`);
      linksRaw += `${news.title}|${news.url}\n`;

      const bodyBlock = news.snippet
        ? `\n記事の要約(参考): ${news.snippet}`
        : "";
      const writerPrompt = `「${news.axis}」コーナーのニュース解説を、${HOST_A.name}と${HOST_B.name}の対話で書いてください。
${DIALOGUE_RULES}

【重要】
・「続いては${news.axis}のコーナーです」のような自然な導入から ${HOST_A.name} が始める。
・${HOST_B.name} が素朴な質問や相槌を挟み、${HOST_A.name} が専門用語をかみ砕いて答える掛け合いにする。
・記事の要約が与えられている場合はその内容に忠実に。与えられていない事実を断定で創作しない。
・分量は概ね700〜1100文字程度で、面白く深掘りする。

【取り上げる記事】
タイトル: ${news.title}
URL: ${news.url}
編集長の選定理由: ${news.reason}${bodyBlock}`;

      const scriptPart = await callClaude(
        client,
        WRITER_MODEL,
        "あなたはテック系ラジオ番組の放送作家兼パーソナリティです。",
        writerPrompt,
        4000
      );
      fullScript += `${scriptPart}\n\n`;
    }

    // --- エンディング (定型の掛け合い) ---
    fullScript += `${HOST_A.name}: 以上、今日も5つのコーナーをお届けしました！気になった記事はNotionにリンクをまとめているので、ぜひチェックしてみてくださいね。\n${HOST_B.name}: 今日も一日、元気にいきましょう！それでは、また明日。\n`;

    // --- フェーズ3: タグと要約 (Haiku) ---
    console.log("  => [Phase 3] タグと要約を生成中 (Haiku)...");
    const directorPrompt = `以下のラジオ原稿を読み、エンジニア向けのタグと要約を生成してください。
次のフォーマットのみを出力し、Markdown記号は使わないでください。

---TAGS_START---
(タグをカンマ区切りで3つ。例: React, Career, AI)
---TAGS_END---

---TAKEAWAY_START---
(今日のニュース全体から得られるエンジニア向けの学びを3行で要約)
---TAKEAWAY_END---

【ラジオ原稿(冒頭部分)】
${fullScript.substring(0, 2500)}`;

    const directorText = await callClaude(
      client,
      AUX_MODEL,
      "あなたはテック番組のディレクターです。",
      directorPrompt,
      1000
    );

    const tagsMatch = directorText.match(/---TAGS_START---([\s\S]*?)---TAGS_END---/);
    const takeawayMatch = directorText.match(/---TAKEAWAY_START---([\s\S]*?)---TAKEAWAY_END---/);

    return {
      script: fullScript,
      tags: tagsMatch ? tagsMatch[1].trim() : "Tech, News",
      takeaway: takeawayMatch ? takeawayMatch[1].trim() : "本日は5つのコーナーをお届けしました。",
      linksRaw: linksRaw.trim(),
    };
  } catch (error) {
    console.error("❌ AI生成エラー:", error);
    throw error;
  }
}

module.exports = { generateScript };
