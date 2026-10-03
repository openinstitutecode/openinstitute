// KPERF-012 — connection-pool URL parameters (pure, unit-tested).
export function withPoolParams(url: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!url) return url;
  const add: string[] = [];
  if (env.DB_POOL_SIZE && !/[?&]connection_limit=/.test(url)) add.push(`connection_limit=${Number(env.DB_POOL_SIZE)}`);
  if (env.DB_POOL_TIMEOUT_S && !/[?&]pool_timeout=/.test(url)) add.push(`pool_timeout=${Number(env.DB_POOL_TIMEOUT_S)}`);
  return add.length ? url + (url.includes("?") ? "&" : "?") + add.join("&") : url;
}

