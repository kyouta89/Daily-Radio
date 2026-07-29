const RSS_AXES = [
  {
    name: "テック系",
    urls: [
      "https://news.ycombinator.com/rss",
      "https://techcrunch.com/feed/",
      "https://www.technologyreview.com/feed/",
      "https://www.theverge.com/rss/index.xml",
    ],
  },
  {
    name: "エンタープライズAI / SaaSプラットフォーム",
    // ServiceNow優先は selectionHint(LLM任せ)ではなくコードで判定する（script.js）。
    // priority.keyword を含む記事が maxAgeDays 日以内かつ未使用なら、その軸は
    // 該当記事に限定して最優先採用。無ければ ServiceNow を候補から外し一般記事から選ぶ。
    priority: { keyword: "ServiceNow", maxAgeDays: 7 },
    selectionHint:
      "エンタープライズAI/SaaSプラットフォームの動向（AWS、Microsoft、Salesforce、Oracle、Google Cloud、生成AIプロダクトなど）から、エンジニアや経営者にとって価値が高く、なるべく新しい記事を選ぶ。",
    urls: [
      // ServiceNowニュース源（コミュニティ告知フィードはニュース性が低いため除外）
      "https://nowben.com/servicenow-news/feed/",
      "https://ainow.ai/feed/",
      "https://diginomica.com/feed",
      "https://venturebeat.com/feed/",
      "https://aws.amazon.com/blogs/aws/feed/",
      "https://www.microsoft.com/en-us/ai/blog/feed/",
      "https://www.salesforce.com/news/feed/",
    ],
  },
  {
    name: "国内エンタープライズIT・業界",
    selectionHint:
      "日本市場の業界動向・規制・国内導入事例・国内ベンダー視点を優先する。海外発の単純な製品リリース記事は他軸が拾うので避ける。ただし日本のビジネスに大きく影響する大トレンドはこちらで取り上げて構わない。",
    urls: [
      "https://www.publickey1.jp/atom.xml",
      "https://rss.itmedia.co.jp/rss/2.0/enterprise.xml",
      "https://cloud.watch.impress.co.jp/data/rss/1.0/clw/feed.rdf",
    ],
  },
  {
    name: "ビジネス・経営",
    selectionHint:
      "海外戦略フレームワーク（HBR、Stratechery系）と国内ビジネスメディアをバランス良く扱う。テック企業の単発の製品ニュースは軸1や軸2に譲り、こちらは経営戦略・業界構造・市場分析・組織論など『ビジネスの考え方』に踏み込む記事を優先する。",
    urls: [
      "https://toyokeizai.net/list/feed/rss",
      "https://www.businessinsider.jp/feed/index.xml",
      "http://feeds.harvardbusiness.org/harvardbusiness/",
      "https://stratechery.com/feed/",
    ],
  },
  {
    name: "プロダクト開発・サービスデザイン",
    selectionHint:
      "プロダクト開発・サービスデザインの実践知を扱う。海外のPM論・グロース論（Lenny's系）、UX・サービスデザインの知見（NN/g、UX Collective系）、プロダクト戦略（SVPG/Marty Cagan系）、国内スタートアップ・SaaSの事例（Coral Capital系）をバランス良く取り上げる。単なる資金調達ニュースは避け、実際にプロダクトを作る人にとっての学びがある記事を優先する。",
    urls: [
      "https://www.lennysnewsletter.com/feed",
      "https://www.intercom.com/blog/feed/",
      "https://coralcap.co/feed/",
      "https://thebridge.jp/feed",
      // 供給が Lenny's 一択に痩せていたため補強（UX/サービスデザイン/プロダクト戦略の生きたフィード）。
      "https://www.nngroup.com/feed/rss/", // Nielsen Norman Group（UX・サービスデザイン）
      "https://uxdesign.cc/feed", // UX Collective（デザイン、更新頻度高）
      "https://www.svpg.com/articles/feed/", // Silicon Valley Product Group / Marty Cagan（プロダクト戦略・低頻度だが高品質）
    ],
  },
];

module.exports = { RSS_AXES };
