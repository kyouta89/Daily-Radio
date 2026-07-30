const { Client } = require("@notionhq/client");

function getTodayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getTodayPageTitle() {
  return `【Radio】${getTodayDateStr()}`;
}

async function getPrimaryDataSourceId(notion, dbId) {
  const db = await notion.databases.retrieve({ database_id: dbId });
  const sources = db.data_sources || [];
  if (sources.length === 0) {
    throw new Error(`Database ${dbId} has no data_sources`);
  }
  return sources[0].id;
}

async function findTodayPage(apiKey, dbId) {
  try {
    const notion = new Client({ auth: apiKey });
    const dsId = await getPrimaryDataSourceId(notion, dbId);
    const resp = await notion.dataSources.query({
      data_source_id: dsId,
      filter: { property: "Name", title: { equals: getTodayPageTitle() } },
      page_size: 1,
    });
    return resp.results.length > 0 ? resp.results[0] : null;
  } catch (err) {
    console.warn(`⚠️ 既存ページチェック失敗（続行）: ${err.message}`);
    return null;
  }
}

// linksRaw（"タイトル\tURL" を改行区切りで並べた文字列）を {title, url}[] に分解する純粋関数。
// 区切りは最初のタブ1個のみ。記事タイトルには "|" が入り得る（東洋経済「… | ライフ |
// 東洋経済オンライン」、Lenny's「… | 著者名」等）ため、旧来の "|" 区切りだと URL を
// 取り違えて無効化→リンクが保存されず、dedup の照合キー(URL)が失われて同じ記事が毎日
// 再選出される不具合があった。タブはタイトル/URLに現れないので安全。
function parseLinkLines(linksRaw) {
  return (linksRaw || "")
    .split("\n")
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab === -1) return null;
      const title = line.slice(0, tab).trim();
      const url = line.slice(tab + 1).trim();
      if (!title || !url) return null;
      return { title, url };
    })
    .filter(Boolean);
}

async function saveToNotion(data, apiKey, dbId) {
  try {
    console.log("4. Notionに保存中...");
    const notion = new Client({ auth: apiKey });

    const dateStr = getTodayDateStr();

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

    // リンクブロックの作成（区切りはタブ。理由は parseLinkLines のコメント参照）
    const linkBlocks = parseLinkLines(data.linksRaw)
      .map(({ title, url }) => {
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

    // 今日のバリエーション（ムード・声）の記録。あれば冒頭に1ブロック足す。
    const moodBlocks = data.moodLabel
      ? [
          {
            object: "block",
            type: "callout",
            callout: {
              rich_text: [
                {
                  text: {
                    content: `🎭 本日のムード: ${data.moodLabel}（声: ${data.voiceA} / ${data.voiceB}）`,
                  },
                },
              ],
              color: "purple_background",
              icon: { emoji: "🎭" },
            },
          },
        ]
      : [];

    // Notionページ作成
    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        Name: { title: [{ text: { content: `【Radio】${dateStr}` } }] },
        Date: { date: { start: new Date().toISOString() } },
        Tags: { multi_select: tagOptions },
      },
      children: [
        ...moodBlocks,
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

async function fetchRecentArticleURLs(apiKey, dbId, days = 14) {
  try {
    const notion = new Client({ auth: apiKey });
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString().split("T")[0];

    const dsId = await getPrimaryDataSourceId(notion, dbId);
    const queryResp = await notion.dataSources.query({
      data_source_id: dsId,
      filter: {
        property: "Date",
        date: { on_or_after: sinceISO },
      },
      page_size: 50,
    });

    const urls = new Set();
    for (const page of queryResp.results) {
      const blocks = await notion.blocks.children.list({
        block_id: page.id,
        page_size: 100,
      });
      for (const block of blocks.results) {
        if (block.type !== "bulleted_list_item") continue;
        const richTexts = block.bulleted_list_item.rich_text || [];
        for (const rt of richTexts) {
          const link = rt.text?.link?.url || rt.href;
          if (link && /^https?:\/\//.test(link)) {
            urls.add(link);
          }
        }
      }
    }
    console.log(`  ✅ 過去${days}日分の採用済みURL: ${urls.size}件`);
    return urls;
  } catch (err) {
    console.warn(`⚠️ 過去採用URL取得失敗（除外なしで続行）: ${err.message}`);
    return new Set();
  }
}

module.exports = { saveToNotion, fetchRecentArticleURLs, findTodayPage, parseLinkLines };
