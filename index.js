require("dotenv").config();
// ★プロキシエラー回避のおまじない
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const Parser = require("rss-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");
// const OpenAI = require("openai"); // 音声生成は無効化中
const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

// --- 設定 ---
const RSS_URL = "https://zenn.dev/feed";

// --- APIクライアント ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const parser = new Parser();

function getTodayStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  try {
    const dateStr = getTodayStr();
    console.log(`📻 Daily Radio (2.5 Flash / Robust) 生成開始 [${dateStr}]`);

    // 1. ニュース収集
    console.log("1. ニュースを取得中...");
    const feed = await parser.parseURL(RSS_URL);
    const items = feed.items
      .slice(0, 15)
      .map((item) => `- ${item.title} (${item.link})`)
      .join("\n");

    // 2. コンテンツ生成
    console.log("2. AI(2.5 Flash)が構成・リンク抽出中...");

    // ★実績のある 2.5 Flash を採用
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
        記事A|[http://url-a.com](http://url-a.com)
        記事B|[http://url-b.com](http://url-b.com)
        ---LINKS_END---

        【ニュースリスト】
        ${items}
        `;

    const result = await model.generateContent(prompt);
    let fullText = result.response.text();

    // ★強力クリーニング機能: 余計な記号を削除
    fullText = fullText
      .replace(/```/g, "")
      .replace(/\*\*/g, "")
      .replace(/json/g, "");

    // デバッグ表示
    console.log("\n====== Gemini Output (Cleaned) ======");
    console.log(fullText.slice(0, 300) + "...");
    console.log("=====================================\n");

    // --- パース処理 ---
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

    const script = scriptMatch
      ? scriptMatch[1].trim()
      : "⚠️ 原稿生成エラー（ログを確認してください）";
    const tagsRaw = tagsMatch ? tagsMatch[1].trim() : "Tech";
    const takeaway = takeawayMatch ? takeawayMatch[1].trim() : "要約なし";
    const linksRaw = linksMatch ? linksMatch[1].trim() : "";

    const tagOptions = tagsRaw.split(",").map((t) => ({ name: t.trim() }));

    // リンク情報の整形
    const linkLines = linksRaw.split("\n").filter((line) => line.includes("|"));
    const linkBlocks = linkLines
      .map((line) => {
        const [title, url] = line.split("|").map((s) => s.trim());
        if (!title || !url) return null;
        return {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ text: { content: title, link: { url: url } } }],
          },
        };
      })
      .filter((b) => b !== null);

    // 4. Notionに保存
    console.log("4. Notionに保存中...");

    const childrenBlocks = [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [{ text: { content: "💡 Key Takeaway" } }],
          color: "gray_background",
          icon: { emoji: "💡" },
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ text: { content: takeaway } }] },
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: "🔗 紹介した記事リスト" } }],
        },
      },
      ...linkBlocks,
      {
        object: "block",
        type: "divider",
        divider: {},
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "📻 ラジオ原稿" } }] },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: script.slice(0, 1800) } }],
        },
      },
    ];

    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: `【Radio】${dateStr}` } }] },
        Date: { date: { start: new Date().toISOString() } },
        Tags: { multi_select: tagOptions },
      },
      children: childrenBlocks,
    });
    console.log("✅ Notion保存完了！");
  } catch (error) {
    console.error("❌ エラー:", error);
  }
}

main();
