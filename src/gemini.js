const { GoogleGenerativeAI } = require("@google/generative-ai");
const { fetchWeather } = require("./weather");
const { fetchOnThisDay } = require("./onThisDay");

async function generateScript(axesWithItems, apiKey, excludedUrls = new Set()) {
  try {
    console.log("2. AIが構成・リンク抽出・執筆中...");
    const genAI = new GoogleGenerativeAI(apiKey);

    const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const modelPro = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    const todayStr = new Date().toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
    });

    // --- フェーズ0: オープニング (天気と今日は何の日) ---
    console.log("  => [Phase 0] オープニング原稿を生成中 (Flash)...");
    const [weatherData, onThisDayRaw] = await Promise.all([
      fetchWeather(),
      fetchOnThisDay(),
    ]);
    let weatherInfo = "天気情報は現在取得できません。";
    if (weatherData) {
      weatherInfo = `今日の天気は${weatherData.condition}、最高気温は${weatherData.maxTemp}度、最低気温は${weatherData.minTemp}度、降水確率は${weatherData.rainProb}%です。`;
    }

    const onThisDayBlock = onThisDayRaw
      ? `
【今日（${todayStr}）の歴史的出来事 — Wikipedia「${todayStr}」ページの「できごと」セクション抜粋】
${onThisDayRaw.slice(0, 6000)}

上記の資料からITやコンピュータ・通信・テクノロジーに関連する出来事を1つだけ選んで、年号と共に小ネタとして紹介してください。資料に該当する出来事が見当たらない場合は、無理に選ばず、季節や気象に関連した親しみやすい話題に置き換えてください。資料に書かれていない出来事を勝手に作らないでください。`
      : `
資料が取得できなかったため、「今日は何の日」のセクションは省略し、季節や気象に関連した親しみやすい話題に置き換えてください。`;

    const openingPrompt = `
あなたはテック系ラジオ番組のパーソナリティです。
明るくエネルギッシュで、活気のある親しみやすいトーンで、番組のオープニング挨拶を作成してください。

【厳守ルール】
・名前の名乗りや自己紹介は一切しないでください。「私〇〇です」「パーソナリティの〇〇です」のような形式は禁止。
・「（オープニングSEと共に）」のような演出のト書き・括弧書きは絶対に出力しないでください。
・「〇〇」「××」のような未確定のプレースホルダー文字は絶対に含めないでください。
・Markdown記号（#、**、-など）は使わず、そのまま読み上げ可能な自然な話し言葉のプレーンテキストのみ出力してください。
・文字数は300〜400文字程度。

【含めるべき2要素】
1. 天気と気遣い: 神奈川県川崎市の天気情報を伝え、「洗濯物を外に干せるか」など生活に密着したアドバイスを明るく添える。
   [気象情報]: ${weatherInfo}
2. 今日は何の日:
${onThisDayBlock}
`;
    const openingResult = await modelFlash.generateContent(openingPrompt);
    let fullScript = `【オープニング】\n${openingResult.response.text().replace(/```/g, "").trim()}\n\n`;

    // --- フェーズ1: 各軸から1件ずつ厳選 (並列実行) ---
    console.log("  => [Phase 1] 各軸から最良の1件を厳選中 (Flash)...");

    const exclusionBlock =
      excludedUrls.size > 0
        ? `\n【除外対象URL（過去14日に既出のため避ける）】\n${[...excludedUrls].join("\n")}\n上記URLの記事は選ばないでください。ただし候補リストの全件が除外対象の場合に限り、その中から最良の1つを選んでください。\n`
        : "";

    const selectionPromises = axesWithItems.map(async (axis) => {
      const hintBlock = axis.selectionHint
        ? `\n【この軸の選定方針】\n${axis.selectionHint}\n`
        : "";
      const editorPrompt = `
あなたはプロのテックメディアの編集長です。
以下のニュースリストから、エンジニアや経営者にとって最も価値があり、読む価値のあるニュースを「1つ」だけ厳選してください。
必ず以下のJSONフォーマットのみを出力してください。Markdown記号（\`\`\`jsonなど）は絶対に使わないでください。

{
  "title": "記事のタイトル",
  "url": "記事のURL",
  "reason": "この記事を選んだ理由（100文字程度）"
}

【軸】${axis.name}${hintBlock}${exclusionBlock}
【ニュースリスト】
${axis.items}
`;
      const result = await modelFlash.generateContent(editorPrompt);
      let text = result.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
      try {
        const selected = JSON.parse(text);
        console.log(`     ✅ [${axis.name}] 選定: ${selected.title}`);
        return { axis: axis.name, ...selected };
      } catch (e) {
        console.error(`JSONパースエラー [${axis.name}]:`, text);
        throw new Error(`[${axis.name}] の選定AIの出力が不正なフォーマットでした。`);
      }
    });

    const selectedNews = await Promise.all(selectionPromises);

    // --- フェーズ2: コーナーごとに原稿執筆 ---
    console.log(`  => [Phase 2] ${selectedNews.length}コーナーの原稿を執筆中 (Pro)...`);
    let linksRaw = "";

    for (let i = 0; i < selectedNews.length; i++) {
      const news = selectedNews[i];
      console.log(`     - 執筆中 (${i + 1}/${selectedNews.length}): [${news.axis}] ${news.title}`);

      linksRaw += `${news.title}|${news.url}\n`;

      const writerPrompt = `
あなたはテック系ラジオ番組のパーソナリティです。
明るくエネルギッシュで、活気のある親しみやすいトーンで解説してください。
名前の名乗りは不要です。

【重要ルール】
・これは「${news.axis}」コーナーのニュース解説です。
・「こんにちは」「番組へようこそ」といったオープニングの挨拶や自己紹介は絶対にしないでください。
・「続いては${news.axis}コーナーです。」のような自然なコーナー導入から始めてください。
・時間は5〜6分程度（文字数にして1000〜1500文字程度）で、深掘りして面白く伝えてください。
・Markdown記号（**や#など）は絶対に使わず、プレーンテキストの話し言葉で出力してください。

【取り上げる記事】
タイトル: ${news.title}
URL: ${news.url}
編集長からの選定理由: ${news.reason}
`;
      const writerResult = await modelPro.generateContent(writerPrompt);
      let scriptPart = writerResult.response.text()
        .replace(/```/g, "")
        .replace(/\*\*/g, "")
        .replace(/#/g, "");

      fullScript += `【${news.axis}】\n${scriptPart}\n\n`;
    }

    fullScript +=
      "【エンディング】\n以上、今日も5つのコーナーをお届けしました！気になった記事はNotionにリンクをまとめていますので、ぜひチェックしてみてください。それでは、今日も一日元気に頑張りましょう！\n";

    // --- フェーズ3: タグと要約の作成 ---
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
    let directorText = directorResult.response.text().replace(/```/g, "");

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
