// Batch 66 — one-off migration: encrypts any IntegrationCredential.secret that is still stored as
// plaintext (everything issued before Batch 66) under INTEGRATION_SECRET_ENCRYPTION_KEY.
//
//   npx tsx scripts/encrypt-integration-secrets.ts --dry-run   # report only
//   npx tsx scripts/encrypt-integration-secrets.ts             # encrypt
//
// Safe to re-run: rows already starting with "enc:v1:" are skipped. Each row is rewritten with a
// compare-and-set (WHERE secret = <the plaintext we read>), so a credential rotated while the script
// runs is never clobbered. Generate a key with:  openssl rand -hex 32
import { prisma } from "../src/lib/prisma.js";
import { encryptSecret, decryptSecret, isEncrypted, loadKey } from "../src/integration/secret-box.js";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const key = loadKey();
  if (!key) {
    console.error("INTEGRATION_SECRET_ENCRYPTION_KEY is not set — refusing to run.");
    process.exit(1);
  }
  const rows = await prisma.integrationCredential.findMany({ select: { id: true, keyId: true, secret: true } });
  let done = 0;
  let skipped = 0;
  for (const row of rows) {
    if (isEncrypted(row.secret)) { skipped++; continue; }
    if (dryRun) { console.log(`[dry-run] would encrypt ${row.keyId}`); continue; }
    const encrypted = encryptSecret(row.secret, key);
    if (decryptSecret(encrypted, key) !== row.secret) throw new Error(`Round-trip check failed for ${row.keyId} — aborting, nothing further written.`);
    const res = await prisma.integrationCredential.updateMany({ where: { id: row.id, secret: row.secret }, data: { secret: encrypted } });
    if (res.count === 1) { done++; console.log(`encrypted ${row.keyId}`); } else console.log(`skipped ${row.keyId} (changed while running)`);
  }
  console.log(`${dryRun ? "Dry run: " : ""}${done} encrypted, ${skipped} already encrypted, ${rows.length} total.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
