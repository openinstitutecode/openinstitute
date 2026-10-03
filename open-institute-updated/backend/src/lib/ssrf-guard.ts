// KSEC-017 — refuse to fetch URLs that point inside the network (loopback, RFC1918, link-local incl.
// the cloud metadata address 169.254.169.254, IPv6 ULA/loopback). Hostnames are resolved and EVERY
// returned address is checked, so a public name that resolves to 10.x is also rejected.
// Internal integrations that legitimately live on a private network (docker "vbl" host) opt in via
// OUTBOUND_ALLOW_HOSTS=vbl,moodle (exact hostnames), never a blanket switch.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7)); // IPv4-mapped IPv6
  if (isIP(v) === 6) return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  const p = v.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparseable → refuse
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
}

export class UnsafeUrlError extends Error {}

export async function assertSafeOutboundUrl(raw: string, opts: { allowHosts?: string[]; resolver?: (h: string) => Promise<string[]> } = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only http(s) URLs are allowed.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allow = (opts.allowHosts ?? (process.env.OUTBOUND_ALLOW_HOSTS ?? "").split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.includes(host.toLowerCase())) return url;
  const addrs = isIP(host)
    ? [host]
    : await (opts.resolver ?? (async (h) => (await lookup(h, { all: true })).map((r) => r.address)))(host).catch(() => {
        throw new UnsafeUrlError("Host could not be resolved.");
      });
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new UnsafeUrlError("That address is not reachable from this service.");
  return url;
}
