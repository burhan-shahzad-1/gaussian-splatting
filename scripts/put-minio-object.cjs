const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

async function main() {
  const file = process.argv[2];
  const key = process.argv[3];
  const body = fs.readFileSync(file);
  const client = new S3Client({
    region: "us-east-1",
    endpoint: "http://127.0.0.1:9000",
    forcePathStyle: true,
    credentials: {
      accessKeyId: "gsplat",
      secretAccessKey: "gsplatgsplat",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  await client.send(
    new PutObjectCommand({
      Bucket: "gsplat",
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  console.log(`uploaded s3://gsplat/${key} (${body.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
