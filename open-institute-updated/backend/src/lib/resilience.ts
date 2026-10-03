// KPERF-015 timeouts, retries with jittered backoff, and a circuit breaker for external dependencies.
export class TimeoutError extends Error {}
export class CircuitOpenError extends Error {}

export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label = "operation"): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted) throw new TimeoutError(`${label} timed out after ${ms} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function retry<T>(fn: (attempt: number) => Promise<T>, o: { retries?: number; baseMs?: number; maxMs?: number; shouldRetry?: (e: unknown) => boolean; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const { retries = 2, baseMs = 200, maxMs = 5000, shouldRetry = () => true, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = o;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= retries || !shouldRetry(e) || e instanceof CircuitOpenError) throw e;
      await sleep(Math.random() * Math.min(maxMs, baseMs * 2 ** attempt)); // full jitter
    }
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  constructor(private o: { failureThreshold?: number; cooldownMs?: number; now?: () => number } = {}) {}
  private now() { return (this.o.now ?? Date.now)(); }
  get state(): "closed" | "open" | "half-open" {
    if (this.failures < (this.o.failureThreshold ?? 5)) return "closed";
    return this.now() - this.openedAt >= (this.o.cooldownMs ?? 30_000) ? "half-open" : "open";
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const s = this.state;
    if (s === "open" || (s === "half-open" && this.probing)) throw new CircuitOpenError("Dependency temporarily unavailable (circuit open).");
    if (s === "half-open") this.probing = true; // exactly one trial request
    try {
      const out = await fn();
      this.failures = 0;
      return out;
    } catch (e) {
      this.failures++;
      this.openedAt = this.now();
      throw e;
    } finally {
      this.probing = false;
    }
  }
}
