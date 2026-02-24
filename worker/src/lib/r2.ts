import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

let s3Client: S3Client | null = null

function getClient(): S3Client {
  if (s3Client) return s3Client

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing Cloudflare R2 environment variables')
  }

  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return s3Client
}

function getBucket(): string {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) throw new Error('Missing CLOUDFLARE_R2_BUCKET_NAME')
  return bucket
}

export async function downloadFromR2(key: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  )

  const body = response.Body
  if (!body) throw new Error(`Empty body for R2 key: ${key}`)

  const chunks: Uint8Array[] = []
  for await (const chunk of body as Readable) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array))
  }
  return Buffer.concat(chunks)
}

export async function uploadToR2(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: data,
      ContentType: contentType,
    }),
  )
}
