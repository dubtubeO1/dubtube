import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  throw new Error('Missing Cloudflare R2 environment variables')
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
})

/**
 * Generate a presigned PUT URL for direct browser → R2 upload.
 * The client must use the exact same Content-Type when uploading.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2, command, { expiresIn })
}

/**
 * Generate a presigned GET URL for reading a private file.
 * Pass `contentDisposition` (e.g. `'attachment; filename="file.mp3"'`) to force
 * the browser to download rather than play/display the file inline.
 */
export async function getPresignedReadUrl(
  key: string,
  expiresIn = 3600,
  contentDisposition?: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {}),
  })
  return getSignedUrl(r2, command, { expiresIn })
}

/**
 * Delete a single object from R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }))
}

/**
 * Delete all objects under a given prefix (e.g., all files for a project).
 * Handles pagination automatically.
 */
export async function deleteR2Prefix(prefix: string): Promise<void> {
  let continuationToken: string | undefined

  do {
    const listResponse = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )

    const objects = listResponse.Contents ?? []

    if (objects.length > 0) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: objects.map(({ Key }) => ({ Key: Key! })),
            Quiet: true,
          },
        }),
      )
    }

    continuationToken = listResponse.NextContinuationToken
  } while (continuationToken)
}

/**
 * Build the R2 object key for a project file.
 * Pattern: {clerkUserId}/{projectId}/{fileType}/{filename}
 */
export function buildR2Key(
  clerkUserId: string,
  projectId: string,
  fileType: 'video' | 'audio' | 'segment' | 'dubbed',
  filename: string,
): string {
  return `${clerkUserId}/${projectId}/${fileType}/${filename}`
}
