// KPERF-005 small in-process TTL cache with single-flight loading (concurrent misses share one load).
// For NON-sensitive, re-derivable data only. Per-instance: cross-instance sharing is the Redis follow-up (KPERF-006).
export class TtlCache<V> {
  private store = new Map<string, { v: V; exp: number }>();
  private inflight = new Map<string, Promise<V>>();
  constructor(private ttlMs: number, private maxEntries = 500, private now: () => number = Date.now) {}

  get size() { return this.store.size; }
  invalidate(key?: string) { key === undefined ? this.store.clear() : this.store.delete(key); }

  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.exp > this.now()) return hit.v;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = loader()
      .then((v) => {
        if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string); // evict oldest
        this.store.set(key, { v, exp: this.now() + this.ttlMs });
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}
