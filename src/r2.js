const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");

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
      Key: fileName,
      Body: body,
      ContentType: "audio/mpeg",
    })
  );

  const url = `${process.env.CF_PUBLIC_URL}/${fileName}`;
  console.log(`✅ R2アップロード完了: ${fileName}`);
  return { url, sizeBytes: body.length };
}

async function downloadExistingRSS() {
  const client = getClient();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: process.env.CF_BUCKET_NAME,
        Key: "podcast.xml",
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
      Key: "podcast.xml",
      Body: rssContent,
      ContentType: "application/rss+xml",
    })
  );
  console.log(`✅ podcast.xml をR2にアップロード完了`);
}

module.exports = { uploadToR2, downloadExistingRSS, uploadRSSToR2 };
