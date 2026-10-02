import "server-only";
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sanitizeFilename } from "@/lib/uploads/validate";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Object storage is not configured.");
    this.name = "StorageNotConfiguredError";
  }
}

export type StorageConfig = {
  bucket: string;
  region: string;
  cloudfrontUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
};

export function getStorageConfig(): StorageConfig | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/$/, "") || null;
  const cloudfrontUrl =
    process.env.CLOUDFRONT_URL?.trim().replace(/\/$/, "") ||
    (endpoint ? `${endpoint}/${bucket}` : "");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !cloudfrontUrl || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { bucket, region, cloudfrontUrl, accessKeyId, secretAccessKey, endpoint };
}

export function isStorageConfigured() {
  return getStorageConfig() !== null;
}

function clientFrom(config: StorageConfig) {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Browser PUTs only send Content-Type. AWS SDK v3 otherwise signs CRC32
    // checksum headers the XHR client never attaches.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(config.endpoint
      ? { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
  });
}

export function publicObjectUrl(key: string) {
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();
  return `${config.cloudfrontUrl}/${key}`;
}

export function objectKeyFor(projectId: string, filename: string) {
  return `captures/${projectId}/${sanitizeFilename(filename)}`;
}

export async function createPresignedPut(input: {
  projectId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}) {
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();

  const objectKey = objectKeyFor(input.projectId, input.filename);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes,
  });

  const uploadUrl = await getSignedUrl(clientFrom(config), command, { expiresIn: 60 * 60 });

  return {
    objectKey,
    uploadUrl,
    headers: { "Content-Type": input.contentType },
    publicUrl: `${config.cloudfrontUrl}/${objectKey}`,
  };
}

export async function assertObjectExists(objectKey: string) {
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();

  const head = await clientFrom(config).send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
  );

  return {
    contentLength: head.ContentLength ?? 0,
    contentType: head.ContentType ?? "",
  };
}

export function keyBelongsToProject(objectKey: string, projectId: string) {
  return objectKey.startsWith(`captures/${projectId}/`);
}

export async function getObjectStream(objectKey: string, range?: string | null) {
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();

  return clientFrom(config).send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ...(range ? { Range: range } : {}),
    }),
  );
}
