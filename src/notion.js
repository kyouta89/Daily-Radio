const { Client } = require("@notionhq/client");

async function saveToNotion(data, apiKey, dbId) {
  try {
    console.log("4. Notionに保存中...");
    const notion = new Client({ auth: apiKey });

    // 日付文字列の作成
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // タグの整形
    const tagOptions = data.tags.split(",").map((t) => ({ name: t.trim() }));

    // リンクブロックの作成
    const linkLines = data.linksRaw
      .split("\n")
      .filter((line) => line.includes("|"));
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

    // Notionページ作成
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: `【Radio】${dateStr}` } }] },
        Date: { date: { start: new Date().toISOString() } },
        Tags: { multi_select: tagOptions },
      },
      children: [
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
          paragraph: { rich_text: [{ text: { content: data.takeaway } }] },
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
            rich_text: [{ text: { content: data.script.slice(0, 1800) } }],
          },
        },
      ],
    });
    console.log("✅ Notion保存完了！");
  } catch (error) {
    console.error("❌ Notion保存エラー:", error);
    throw error;
  }
}

module.exports = { saveToNotion };
