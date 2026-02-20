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

    // ★追加: URLが有効か判定する関数
    function isValidUrl(string) {
      try {
        new URL(string);
        return string.startsWith("http://") || string.startsWith("https://");
      } catch (_) {
        return false;
      }
    }

    // リンクブロックの作成
    const linkLines = data.linksRaw
      .split("\n")
      .filter((line) => line.includes("|"));
    const linkBlocks = linkLines
      .map((line) => {
        const [title, url] = line.split("|").map((s) => s.trim());
        if (!title || !url) return null;

        // ★修正: URLが無効な場合はリンクを外してテキストのみにする
        if (!isValidUrl(url)) {
          return {
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [{ text: { content: title } }],
            },
          };
        }

        return {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ text: { content: title, link: { url: url } } }],
          },
        };
      })
      .filter((b) => b !== null);

    // 改行（段落）ごとに分割し、Notionの制限（2000文字）に収まるようにまとめる関数
    function splitTextByParagraph(text, maxLength = 1800) {
      const paragraphs = text.split("\n");
      const chunks = [];
      let currentChunk = "";

      for (const p of paragraphs) {
        if (p.length > maxLength) {
          if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = "";
          }
          let remaining = p;
          while (remaining.length > 0) {
            chunks.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
          }
        } else if (currentChunk.length + p.length + 1 > maxLength) {
          chunks.push(currentChunk);
          currentChunk = p + "\n";
        } else {
          currentChunk += p + "\n";
        }
      }
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
    }

    const scriptChunks = splitTextByParagraph(data.script);
    const scriptBlocks = scriptChunks.map((chunk) => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ text: { content: chunk } }],
      },
    }));

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
        ...scriptBlocks,
      ],
    });
    console.log("✅ Notion保存完了！");
  } catch (error) {
    console.error("❌ Notion保存エラー:", error);
    throw error;
  }
}

module.exports = { saveToNotion };
