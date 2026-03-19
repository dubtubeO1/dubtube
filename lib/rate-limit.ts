/**
 * Simple in-memory sliding-window rate limiter.
 * Works correctly for a single Railway instance.
 * If you ever scale to multiple instances, swap the store for Upstash Redis.
 */

interface Window {
  timestamps: number[]
}

const store = new Map<string, Window>()

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key      Unique key per user+route (e.g. `presign:user_abc123`)
 * @param limit    Max requests allowed within the window
 * @param windowMs Window size in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key) ?? { timestamps: [] }

  // Drop timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs)

  if (entry.timestamps.length >= limit) {
    store.set(key, entry)
    return false
  }

  entry.timestamps.push(now)
  store.set(key, entry)
  return true
}
