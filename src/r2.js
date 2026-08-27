const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");

// 秘匿配信用の任意プレフィックス。設定すると全オブジェクトが `<prefix>/` 配下に置かれ、
// 公開URLも `<CF_PUBLIC_URL>/<prefix>/...` になる。旧URLを知る第三者を締め出す用途
// （厳密な認証ではなく“推測不能なパス”による秘匿）。未設定なら従来どおりルート直下。
const KEY_PREFIX = process.env.R2_SECRET_PREFIX
  ? `${process.env.R2_SECRET_PREFIX.replace(/^\/+|\/+$/g, "")}/`
  : "";

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadToR2(localPath, fileName) {
  const client = getClient();
  const body = fs.readFileSync(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.CF_BUCKET_NAME,
      Key: KEY_PREFIX + fileName,
      Body: body,
      ContentType: "audio/mpeg",
    })
  );

  const url = `${process.env.CF_PUBLIC_URL}/${KEY_PREFIX}${fileName}`;
  console.log(`✅ R2アップロード完了: ${fileName}`);
  return { url, sizeBytes: body.length };
}

async function downloadExistingRSS() {
  const client = getClient();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: process.env.CF_BUCKET_NAME,
        Key: KEY_PREFIX + "podcast.xml",
      })
    );
    const chunks = [];
    for await (const chunk of res.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (e) {
    if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) {
      console.log("既存のRSSなし、新規作成します");
      return null;
    }
    throw e;
  }
}

async function uploadRSSToR2(rssContent) {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.CF_BUCKET_NAME,
      Key: KEY_PREFIX + "podcast.xml",
      Body: rssContent,
      ContentType: "application/rss+xml",
    })
  );
  console.log(`✅ podcast.xml をR2にアップロード完了`);
}

module.exports = { uploadToR2, downloadExistingRSS, uploadRSSToR2 };
