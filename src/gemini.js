const { GoogleGenerativeAI } = require("@google/generative-ai");
const { fetchWeather } = require("./weather");

async function generateScript(items, apiKey) {
  try {
    console.log("2. AIが構成・リンク抽出・執筆中...");
    const genAI = new GoogleGenerativeAI(apiKey);

    // ★追加: 2つのモデルを用途に合わせて準備
    const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // 処理が速くて安いモデル
    const modelPro = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // 表現力が豊かで賢いモデル

    const todayStr = new Date().toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
    });

    // --- フェーズ0: オープニングAI (天気と今日は何の日) ---
    // ※ここは短いのでFlashで十分です
    console.log("  => [Phase 0] オープニング原稿を生成中 (Flash)...");
    const weatherData = await fetchWeather();
    let weatherInfo = "天気情報は現在取得できません。";
    if (weatherData) {
      weatherInfo = `今日の天気は${weatherData.condition}、最高気温は${weatherData.maxTemp}度、最低気温は${weatherData.minTemp}度、降水確率は${weatherData.rainProb}%です。`;
    }

    const openingPrompt = `
あなたはテック系ラジオ番組のAIパーソナリティ「アリス」です。
明るくエネルギッシュで、活気のある親しみやすい女性のトーンで、番組のオープニング挨拶を作成してください。

以下の2つの要素を必ず含めてください：
1. 【天気と気遣い】: 以下の神奈川県川崎市の天気情報を伝え、それに合わせて「今日は洗濯物を外に干せるか」などのリスナーへのアドバイスを明るく伝えてください。
   [気象情報]: ${weatherInfo}
2. 【今日は何の日？】: 今日（${todayStr}）に関連する、ITやテクノロジー界隈の歴史的な出来事（例：〇〇の発売日、〇〇の設立日など）を1つ紹介し、小ネタとして話してください。

・文字数は300〜400文字程度にまとめてください。
・Markdown記号は使わず、自然な話し言葉のプレーンテキストで出力してください。
`;
    const openingResult = await modelFlash.generateContent(openingPrompt);
    let fullScript = `【オープニング】\n${openingResult.response.text().replace(/```/g, "").trim()}\n\n`;

    // --- フェーズ1: 編集長AI (ニュースの選別) ---
    // ※ただ選ぶだけなのでFlashで十分です
    console.log("  => [Phase 1] 編集長AIがニュースを5件厳選中 (Flash)...");
    const editorPrompt = `
あなたはプロのテックメディアの編集長です。
以下のニュースリストから、エンジニアのキャリアや技術向上に役立つ、または単純に面白いニュースを「5つ」厳選してください。
必ず以下のJSONフォーマットのみを出力してください。Markdown記号（\`\`\`jsonなど）は絶対に使わないでください。

[
  {
    "title": "記事のタイトル",
    "url": "記事のURL",
    "reason": "この記事を選んだ理由（100文字程度）"
  }
]
※配列の中に5つのオブジェクトを入れてください。

【ニュースリスト】
${items}
`;
    const editorResult = await modelFlash.generateContent(editorPrompt);
    let editorText = editorResult.response.text();
    editorText = editorText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let selectedNews = [];
    try {
      selectedNews = JSON.parse(editorText);
    } catch (e) {
      console.error("JSONパースエラー。AIの出力:", editorText);
      throw new Error("編集長AIの出力が不正なフォーマットでした。");
    }

    // --- フェーズ2: ライターAI (個別原稿の執筆) ---
    // ★ここが腕の見せ所なので、Proモデルを使います！
    console.log(
      `  => [Phase 2] ライターAIが ${selectedNews.length} 本の原稿を執筆中 (Pro)...`,
    );
    let linksRaw = "";

    for (let i = 0; i < selectedNews.length; i++) {
      const news = selectedNews[i];
      console.log(
        `     - 執筆中 (${i + 1}/${selectedNews.length}): ${news.title}`,
      );

      linksRaw += `${news.title}|${news.url}\n`;

      const writerPrompt = `
あなたはテック系ラジオ番組のAIパーソナリティ「アリス」です。
明るくエネルギッシュで、活気のある親しみやすい女性のトーン（元気な語り口や女性らしい表現）で解説してください。

【重要ルール】
・これは番組の途中のニュース解説コーナーです。
・「こんにちは」「番組へようこそ」「アリスです」といったオープニングの挨拶や自己紹介は**絶対にしないでください**。
・「続いてのニュースは〜」や「さて、この記事ですが〜」といった自然な導入から、すぐに記事の解説を始めてください。
・時間は5〜6分程度（文字数にして1000〜1500文字程度）で、深掘りして面白く伝えてください。
・Markdown記号（**や#など）は絶対に使わず、プレーンテキストの話し言葉で出力してください。

【取り上げる記事】
タイトル: ${news.title}
URL: ${news.url}
編集長からの選定理由: ${news.reason}
`;
      // ★ここで modelPro を呼び出します
      const writerResult = await modelPro.generateContent(writerPrompt);
      let scriptPart = writerResult.response.text();
      scriptPart = scriptPart
        .replace(/```/g, "")
        .replace(/\*\*/g, "")
        .replace(/#/g, "");

      fullScript += `【ニュース${i + 1}】\n${scriptPart}\n\n`;
    }

    fullScript +=
      "【エンディング】\n今日のお相手はAIパーソナリティのアリスでした！詳細なリンクはNotionにまとめておきますので、気になった記事はぜひチェックしてみてくださいね。それでは、今日も一日元気に頑張りましょう！\n";

    // --- フェーズ3: ディレクターAI (タグと要約の作成) ---
    // ※要約だけなのでFlashで十分です
    console.log("  => [Phase 3] ディレクターAIがタグと要約を生成中 (Flash)...");
    const directorPrompt = `
以下のラジオ原稿の一部を読み、エンジニア向けのタグと要約を生成してください。
以下のフォーマットのみを出力し、Markdown記号は使わないでください。

---TAGS_START---
(タグをカンマ区切りで3つ。例: React, Career, AI)
---TAGS_END---

---TAKEAWAY_START---
(今日のニュース全体から得られるエンジニア向けの学びを3行で要約)
---TAKEAWAY_END---

【ラジオ原稿（冒頭部分）】
${fullScript.substring(0, 2000)}
`;
    const directorResult = await modelFlash.generateContent(directorPrompt);
    let directorText = directorResult.response.text();
    directorText = directorText.replace(/```/g, "");

    const tagsMatch = directorText.match(
      /---TAGS_START---([\s\S]*?)---TAGS_END---/,
    );
    const takeawayMatch = directorText.match(
      /---TAKEAWAY_START---([\s\S]*?)---TAKEAWAY_END---/,
    );

    return {
      script: fullScript,
      tags: tagsMatch ? tagsMatch[1].trim() : "Tech, News",
      takeaway: takeawayMatch
        ? takeawayMatch[1].trim()
        : "本日は5つのニュースを深掘りしました。",
      linksRaw: linksRaw.trim(),
    };
  } catch (error) {
    console.error("❌ AI生成エラー:", error);
    throw error;
  }
}

module.exports = { generateScript };
