# 補足手順：ServiceNow偏重を外す（所要5分）

STEP 3 の補足です。**ServiceNow に関心がない人は、この手順をやってください。**

## なぜ必要か

配布元の番組は「ServiceNow」という製品のニュースを**最優先で拾う設定**になっています。配布元の人の仕事に関係する製品だからで、**あなたには関係ありません**。

このまま使うと、2番目のコーナー（エンタープライズAI / SaaS）が、**週に何度も ServiceNow の記事に占領されます**。しかもこれは「AIがなんとなく選んでいる」のではなく**コードで強制している**ので、放っておいても直りません。

## 手順

1. リポジトリの **Code** タブ → `src` フォルダ → **`axes.js`** をクリック
2. 右上の**鉛筆アイコン**（Edit this file）をクリック
3. 下の **消す行** を削除する
4. 右上の **Commit changes** → そのまま **Commit changes**
5. **Actions** タブで「**設定チェック**」が**緑✅**になるのを確認

## 消す行

`name: "エンタープライズAI / SaaSプラットフォーム"` と書かれているブロックの中にあります。

### ① 必須：優先ルールの行（これが本体）

この4行を消します（コメント3行＋設定1行）。

```js
    // ServiceNow優先は selectionHint(LLM任せ)ではなくコードで判定する（script.js）。
    // priority.keyword を含む記事が maxAgeDays 日以内かつ未使用なら、その軸は
    // 該当記事に限定して最優先採用。無ければ ServiceNow を候補から外し一般記事から選ぶ。
    priority: { keyword: "ServiceNow", maxAgeDays: 7 },
```

### ② 推奨：ServiceNow専門サイトの行

`urls:` の中にある、この2行を消します。

```js
      // ServiceNowニュース源（コミュニティ告知フィードはニュース性が低いため除外）
      "https://nowben.com/servicenow-news/feed/",
```

**①さえ消せば実害はほぼ無くなります。** ②を残しても、7つある情報源の1つとして普通に競争するだけで、AWS や Microsoft の記事を押しのけて選ばれることはまずありません。時間がなければ①だけでOKです。

## 消したあとの形

```js
  {
    name: "エンタープライズAI / SaaSプラットフォーム",
    selectionHint:
      "エンタープライズAI/SaaSプラットフォームの動向（AWS、Microsoft、Salesforce、Oracle、Google Cloud、生成AIプロダクトなど）から、エンジニアや経営者にとって価値が高く、なるべく新しい記事を選ぶ。",
    urls: [
      "https://ainow.ai/feed/",
      "https://diginomica.com/feed",
      "https://venturebeat.com/feed/",
      "https://aws.amazon.com/blogs/aws/feed/",
      "https://www.microsoft.com/en-us/ai/blog/feed/",
      "https://www.salesforce.com/news/feed/",
    ],
  },
```

`priority` は無くても動く任意の設定なので、消しても設定チェックは通ります。

## 応用：自分が気になる製品に置き換える

消す代わりに、**製品名だけ書き換える**こともできます。

```js
    priority: { keyword: "Salesforce", maxAgeDays: 7 },
```

こうすると「**その製品の新着ニュースがあれば優先的に取り上げる**」番組になります。自社で使っている製品や、担当している製品があるなら便利です。

- `keyword` … 記事のタイトルや要約に含まれていたら優先する言葉
- `maxAgeDays` … 何日以内の記事なら優先するか（古いニュースを引っ張らないための期限）

ただし、**その製品のニュースを扱っているサイトが `urls` に入っていないと意味がありません。** 置き換える場合は情報源もセットで考えてください。思いつかなければ、素直に削除するのが確実です。

## よくある失敗

| 症状 | 原因 | 直し方 |
| --- | --- | --- |
| 設定チェックが赤❌ | カンマや括弧を余分に消した | ログに日本語で出ます。ファイル右上の History から戻せます |
| 消したのにまだ ServiceNow が出る | ②だけ消して①が残っている | ①の `priority:` の行を消してください |
| 2番目のコーナーが毎回同じサイトになる | 情報源が少ない | `urls` に興味のある分野のRSSを足してください（後日でOK） |
