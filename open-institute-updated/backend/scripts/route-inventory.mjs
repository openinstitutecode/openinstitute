// Shared by audit-routes.mjs and gen-openapi.mjs: statically lists every Express route with its guard and handler text.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../src/", import.meta.url));
export function inventory() {
  const idx = readFileSync(join(root, "index.ts"), "utf8");
  const mounts = new Map([...idx.matchAll(/app\.use\(\s*"([^"]+)"\s*,\s*(?:[\w.()\s,]*?,\s*)?(\w+Router)\s*\)/g)].map((m) => [m[2], m[1]]));
  const importFile = new Map([...idx.matchAll(/import\s*\{\s*(\w+Router)\s*\}\s*from\s*"\.\/routes\/([\w-]+)\.js"/g)].map((m) => [m[2], m[1]]));
  const rows = [];
  for (const f of readdirSync(join(root, "routes")).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(root, "routes", f), "utf8");
    const base = mounts.get(importFile.get(f.replace(".ts", ""))) ?? "(unmounted)";
    const bundles = [...src.matchAll(/const\s+(\w+)\s*=\s*\[([^\]]*requireAuth[^\]]*)\]/g)].map((b) => [b[1], /requireRole|requireInsight/.test(b[2]) ? "role" : "auth"]);
    const starts = [...src.matchAll(/\b\w+Router\.(get|post|put|patch|delete)\(\s*("[^"]*"|`[^`]*`)/g)];
    starts.forEach((m, i) => {
      const end = starts[i + 1]?.index ?? src.length;
      const text = src.slice(m.index, Math.min(end, m.index + 6000));
      const tail = src.slice(m.index, m.index + 900);
      const cut = tail.search(/async\s*\(|\(\s*\w*\s*(?::\s*[\w.<>]+)?\s*,?\s*\w*\s*(?::\s*[\w.<>]+)?\)\s*=>/);
      const chain = cut > 0 ? tail.slice(0, cut) : tail.slice(0, 300);
      const bundle = bundles.find(([n]) => new RegExp(`\\b${n}\\b`).test(chain));
      const guard = bundle ? bundle[1] : /requireRole|requirePermission|requireAdmin|requireInsight/.test(chain) ? "role" : /requireAuth/.test(chain) ? "auth" : /requireApiKey|verifySignature|x-metrics-token|webhook/i.test(chain + m[2]) ? "signed/token" : "NONE";
      const path = (base + m[2].slice(1, -1)).replace(/\/$/, "");
      rows.push({ method: m[1].toUpperCase(), path, file: f, guard, text, params: [...path.matchAll(/:(\w+)/g)].map((x) => x[1]) });
    });
  }
  return rows;
}
