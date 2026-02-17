const { GoogleGenerativeAI } = require("@google/generative-ai");

// プロンプトやモデル設定はここで管理
async function generateScript(items, apiKey) {
  try {
    console.log("2. AI(2.5 Flash)が構成・リンク抽出中...");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
        あなたはプロのテックラジオDJです。
        以下のニュースリストから、エンジニアのキャリアや技術向上に役立つものを2つ厳選し、
        以下のフォーマットで出力してください。

        【重要：Markdown記号（\`\`\`jsonなど）は絶対に使わないでください。プレーンテキストで出力してください】
        
        ---SCRIPT_START---
        (ラジオ原稿。3分程度で、紹介する2つの記事について面白く解説する)
        ---SCRIPT_END---

        ---TAGS_START---
        (タグをカンマ区切りで3つ。例: React, Career, AI)
        ---TAGS_END---

        ---TAKEAWAY_START---
        (エンジニアが持ち帰るべき学びを3行で要約)
        ---TAKEAWAY_END---

        ---LINKS_START---
        (紹介した2記事を「タイトル|URL」の形式で記述)
        記事A|http://url-a.com
        記事B|http://url-b.com
        ---LINKS_END---

        【ニュースリスト】
        ${items}
        `;

    const result = await model.generateContent(prompt);
    let fullText = result.response.text();

    // クリーニング処理
    fullText = fullText
      .replace(/```/g, "")
      .replace(/\*\*/g, "")
      .replace(/json/g, "");

    // パース処理（テキストから要素を取り出す）
    const scriptMatch = fullText.match(
      /---SCRIPT_START---([\s\S]*?)---SCRIPT_END---/,
    );
    const tagsMatch = fullText.match(
      /---TAGS_START---([\s\S]*?)---TAGS_END---/,
    );
    const takeawayMatch = fullText.match(
      /---TAKEAWAY_START---([\s\S]*?)---TAKEAWAY_END---/,
    );
    const linksMatch = fullText.match(
      /---LINKS_START---([\s\S]*?)---LINKS_END---/,
    );

    // データをオブジェクトにまとめて返す
    return {
      script: scriptMatch ? scriptMatch[1].trim() : "原稿生成エラー",
      tags: tagsMatch ? tagsMatch[1].trim() : "Tech",
      takeaway: takeawayMatch ? takeawayMatch[1].trim() : "要約なし",
      linksRaw: linksMatch ? linksMatch[1].trim() : "",
    };
  } catch (error) {
    console.error("❌ AI生成エラー:", error);
    throw error;
  }
}

module.exports = { generateScript };
