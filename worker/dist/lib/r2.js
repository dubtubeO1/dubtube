"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFromR2 = downloadFromR2;
exports.uploadToR2 = uploadToR2;
const client_s3_1 = require("@aws-sdk/client-s3");
let s3Client = null;
function getClient() {
    if (s3Client)
        return s3Client;
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('Missing Cloudflare R2 environment variables');
    }
    s3Client = new client_s3_1.S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    return s3Client;
}
function getBucket() {
    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
    if (!bucket)
        throw new Error('Missing CLOUDFLARE_R2_BUCKET_NAME');
    return bucket;
}
async function downloadFromR2(key) {
    const response = await getClient().send(new client_s3_1.GetObjectCommand({ Bucket: getBucket(), Key: key }));
    const body = response.Body;
    if (!body)
        throw new Error(`Empty body for R2 key: ${key}`);
    const chunks = [];
    for await (const chunk of body) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
async function uploadToR2(key, data, contentType) {
    await getClient().send(new client_s3_1.PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: data,
        ContentType: contentType,
    }));
}
