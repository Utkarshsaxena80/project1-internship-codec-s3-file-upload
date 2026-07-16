import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const useS3 = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.AWS_REGION &&
  process.env.AWS_S3_BUCKET_NAME
);

let s3Client: S3Client | null = null;
if (useS3) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}
console.log('AWS S3 storage provider initialized.');

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'data', 'storage');

function ensureLocalStorageDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

/**
 * Uploads a file buffer to S3 or local fallback.
 * Returns the key (or file path relative to local storage/S3) where it's stored.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  if (useS3 && s3Client) {
    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return key;
  } else {
    ensureLocalStorageDir();
    // Use the key as filename. Replace S3-like path dividers with safe characters or nested folders
    const safeKey = key.replace(/\//g, '_');
    const localPath = path.join(LOCAL_STORAGE_DIR, safeKey);
    fs.writeFileSync(localPath, buffer);
    return safeKey;
  }
}

/**
 * Downloads a file buffer from S3 or local fallback.
 */
export async function getFileBuffer(key: string): Promise<Buffer> {
  if (useS3 && s3Client) {
    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) {
      throw new Error('S3 returned empty body');
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } else {
    ensureLocalStorageDir();
    // In local storage, the key stored was the safeKey
    const localPath = path.join(LOCAL_STORAGE_DIR, key);
    if (!fs.existsSync(localPath)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.readFileSync(localPath);
  }
}

/**
 * Deletes a file from S3 or local fallback.
 */
export async function deleteFile(key: string): Promise<void> {
  if (useS3 && s3Client) {
    const bucket = process.env.AWS_S3_BUCKET_NAME!;
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } else {
    ensureLocalStorageDir();
    const localPath = path.join(LOCAL_STORAGE_DIR, key);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  }
}
