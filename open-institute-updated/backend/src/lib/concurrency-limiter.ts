// KPERF-014 / KPERF-018 / KAI-005 — bounded concurrency with a bounded queue (backpressure).
// When the queue is full callers fail fast with OverloadedError instead of piling up memory.
export class OverloadedError extends Error {}

export class ConcurrencyLimiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private maxConcurrent: number, private maxQueue: number) {}
  get stats() { return { active: this.active, queued: this.waiting.length, maxConcurrent: this.maxConcurrent, maxQueue: this.maxQueue }; }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueue) throw new OverloadedError("Too many requests in progress — try again shortly.");
      await new Promise<void>((resolve) => this.waiting.push(resolve)); // slot is handed over with active already counted
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // transfer the slot
      else this.active--;
    }
  }
}
