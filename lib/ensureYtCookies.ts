import { writeFile, chmod, access } from 'fs/promises';
import path from 'path';

const COOKIES_PATH = '/tmp/yt-cookies.txt';
const COOKIES_MODE = 0o600; // owner read/write only

/**
 * Ensures the YouTube cookies file exists at runtime by decoding YTDLP_COOKIES_B64
 * and writing to /tmp/yt-cookies.txt. Railway (and similar) do not support secret file
 * uploads, so we create the file from an env-held Base64 string once per process.
 * Never logs or exposes cookie contents.
 */
export async function ensureYtCookies(): Promise<string> {
  const absolutePath = path.resolve(COOKIES_PATH);

  // Reuse existing file so we don't rewrite on every request.
  try {
    await access(absolutePath);
    return absolutePath;
  } catch {
    // File does not exist; create it.
  }

  const encoded = process.env.YTDLP_COOKIES_B64;
  if (!encoded || typeof encoded !== 'string') {
    throw new Error(
      'YTDLP_COOKIES_B64 is not set. Set it to a Base64-encoded YouTube cookies.txt for yt-dlp.'
    );
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    throw new Error('YTDLP_COOKIES_B64 is not valid Base64.');
  }

  try {
    await writeFile(absolutePath, decoded, { mode: COOKIES_MODE, flag: 'wx' });
    await chmod(absolutePath, COOKIES_MODE);
  } catch (err: unknown) {
    // Another process may have created the file (e.g. multi-worker); reuse it.
    const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : '';
    if (code === 'EEXIST') {
      return absolutePath;
    }
    throw err;
  }

  return absolutePath;
}
