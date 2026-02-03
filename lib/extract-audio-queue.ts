/**
 * In-memory concurrency queue for yt-dlp audio extraction.
 * Limits simultaneous yt-dlp processes to avoid YouTube 403 / bot detection.
 * No 429: requests wait in queue until a slot is free.
 */

const MAX_YTDLP_CONCURRENCY = Math.max(1, parseInt(process.env.MAX_YTDLP_CONCURRENCY || '2', 10));

type Resolver = () => void;

class YtDlpSemaphore {
  private active = 0;
  private waitQueue: Resolver[] = [];

  /** Wait for a slot, then run. Call release() when done (success or failure). */
  async acquire(): Promise<void> {
    if (this.active < MAX_YTDLP_CONCURRENCY) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    this.active++;
  }

  /** Release a slot so the next queued request can proceed. */
  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  /** Current number of active extractions (for observability). */
  get activeCount(): number {
    return this.active;
  }

  /** Current queue length (waiting). */
  get queueLength(): number {
    return this.waitQueue.length;
  }
}

export const ytDlpQueue = new YtDlpSemaphore();

export { MAX_YTDLP_CONCURRENCY };
