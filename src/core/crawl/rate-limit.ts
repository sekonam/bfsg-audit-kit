/**
 * Per-host rate limiting.
 *
 * The limiter is serial per host: `acquire(host)` resolves only when at least
 * `minIntervalMs` has passed since the previous acquisition for that host, and
 * concurrent callers queue rather than race. A site's own `Crawl-delay` raises
 * the interval; it never lowers it.
 *
 * Clock and sleep are injected so the tests run in microseconds instead of
 * actually waiting two seconds per request.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class HostRateLimiter {
  readonly #minIntervalMs: number;
  readonly #clock: Clock;
  readonly #nextFreeAt = new Map<string, number>();
  readonly #hostInterval = new Map<string, number>();

  constructor(minIntervalMs: number, clock: Clock = systemClock) {
    if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) {
      throw new RangeError(`minIntervalMs must be a non-negative number, got ${minIntervalMs}`);
    }
    this.#minIntervalMs = minIntervalMs;
    this.#clock = clock;
  }

  /**
   * Apply a site-declared Crawl-delay for a host. Ignored if it is shorter than
   * our own interval — a site asking us to go faster does not make it polite.
   */
  setHostInterval(host: string, intervalMs: number): void {
    if (Number.isFinite(intervalMs) && intervalMs > this.#minIntervalMs) {
      this.#hostInterval.set(host, intervalMs);
    }
  }

  intervalFor(host: string): number {
    return this.#hostInterval.get(host) ?? this.#minIntervalMs;
  }

  /** Wait until it is polite to send the next request to `host`. */
  async acquire(host: string): Promise<void> {
    const interval = this.intervalFor(host);
    const now = this.#clock.now();
    const readyAt = this.#nextFreeAt.get(host) ?? 0;
    const startAt = Math.max(now, readyAt);
    // Reserve the slot before awaiting so concurrent callers queue rather than
    // all computing the same start time.
    this.#nextFreeAt.set(host, startAt + interval);
    const waitMs = startAt - now;
    if (waitMs > 0) await this.#clock.sleep(waitMs);
  }
}
