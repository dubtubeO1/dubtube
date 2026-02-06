/**
 * Helper for building Decodo datacenter HTTP proxy URLs for yt-dlp.
 * Each call selects one random port between PROXY_PORT_START and PROXY_PORT_END.
 *
 * Example: http://user:pass@dc.decodo.com:10001
 */
export function getRandomProxyUrl(): string | null {
  const host = process.env.PROXY_HOST;
  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;
  const startStr = process.env.PROXY_PORT_START;
  const endStr = process.env.PROXY_PORT_END;

  if (!host || !username || !password || !startStr || !endStr) {
    return null;
  }

  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }

  const port = start + Math.floor(Math.random() * (end - start + 1));
  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

