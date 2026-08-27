// 一回きりの移行スクリプト（GitHub Actions から実行する想定）。
// R2の配信物を「秘密プレフィックス配下」へ引っ越す。過去エピソードは残す方針(B):
//   旧ルートの radio_*.mp3 を <prefix>/ 配下へコピー → podcast.xml のmp3 URLを
//   新パスへ書き換えて <prefix>/podcast.xml として保存 → 旧ルートの mp3/podcast.xml を削除。
//   thumbnail.png はカバー画像で秘匿不要のためルート据え置き。
//
// 環境変数（CIのsecretsから供給）:
//   CF_ACCOUNT_ID / CF_R2_ACCESS_KEY_ID / CF_R2_SECRET_ACCESS_KEY /
//   CF_BUCKET_NAME / CF_PUBLIC_URL / R2_SECRET_PREFIX
//   CONFIRM=yes のときだけ旧ルートを削除（未設定ならコピー＆新フィード生成のみのプレビュー）。
const {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const need = [
  "CF_ACCOUNT_ID",
  "CF_R2_ACCESS_KEY_ID",
  "CF_R2_SECRET_ACCESS_KEY",
  "CF_BUCKET_NAME",
  "CF_PUBLIC_URL",
  "R2_SECRET_PREFIX",
];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("必要な環境変数が未設定:", missing.join(", "));
  process.exit(1);
}

const BUCKET = process.env.CF_BUCKET_NAME;
const PUBLIC = process.env.CF_PUBLIC_URL.replace(/\/+$/, "");
const PREFIX = process.env.R2_SECRET_PREFIX.replace(/^\/+|\/+$/g, "");
const CONFIRM = process.env.CONFIRM === "yes";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
  },
});

async function listAll() {
  const keys = [];
  let token;
  do {
    const r = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token })
    );
    (r.Contents || []).forEach((o) => keys.push(o.Key));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

(async () => {
  console.log(`bucket=${BUCKET} public=${PUBLIC} prefix=${PREFIX}/`);
  console.log(
    CONFIRM
      ? "MODE: 本番（コピー＋新フィード生成＋旧ルート削除）"
      : "MODE: プレビュー（コピー＋新フィード生成のみ・削除しない）"
  );

  const all = await listAll();
  if (all.some((k) => k.startsWith(PREFIX + "/"))) {
    console.log("注意: 既に一部が新プレフィックス配下に存在します（再実行の可能性）。");
  }

  const rootMp3s = all.filter((k) => /^radio_.*\.mp3$/.test(k));
  const hasRootFeed = all.includes("podcast.xml");
  console.log(`ルートmp3=${rootMp3s.length}件 / ルートpodcast.xml=${hasRootFeed ? "あり" : "なし"}`);

  // 1) 過去mp3を新パスへコピー（追加のみ・安全）
  for (const key of rootMp3s) {
    const dest = `${PREFIX}/${key}`;
    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${encodeURIComponent(key)}`,
        Key: dest,
        ContentType: "audio/mpeg",
      })
    );
    console.log(`copy ${key} -> ${dest}`);
  }

  // 2) フィードのmp3 URLを新パスへ書き換えて <prefix>/podcast.xml として保存
  if (hasRootFeed) {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: "podcast.xml" })
    );
    const chunks = [];
    for await (const c of res.Body) chunks.push(c);
    const before = Buffer.concat(chunks).toString("utf-8");
    const rewrites = (before.match(/\/radio_/g) || []).length;
    const xml = before.split(`${PUBLIC}/radio_`).join(`${PUBLIC}/${PREFIX}/radio_`);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${PREFIX}/podcast.xml`,
        Body: xml,
        ContentType: "application/rss+xml",
      })
    );
    console.log(`feed saved -> ${PREFIX}/podcast.xml (URL書換 ${rewrites}箇所)`);
  }

  // 3) 旧ルート削除（CONFIRM=yes のときだけ）。thumbnail.png は残す。
  const toDelete = [...rootMp3s, ...(hasRootFeed ? ["podcast.xml"] : [])];
  if (!CONFIRM) {
    console.log(`\n[プレビュー] CONFIRM=yes で削除される対象 ${toDelete.length}件:`);
    toDelete.forEach((k) => console.log(`  will-delete ${k}`));
    console.log("\nプレビュー完了。問題なければ confirm=yes で本番実行してください。");
    return;
  }
  for (const key of toDelete) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`deleted ${key}`);
  }
  console.log(`\n移行完了。新フィード: ${PUBLIC}/${PREFIX}/podcast.xml`);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
