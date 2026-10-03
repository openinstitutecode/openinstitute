// VBI010/045 — rotation semantics + encryption at rest, against real Postgres.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { dbTest, useDb, resetDb, seedFixture } from "../helpers/db.js";
import { issueCredential, revokeCredential, listCredentials, activeSigningCredential, verifyAgainstAnyActiveCredential } from "../../src/integration/credentials.js";
import { signPayload } from "../../src/integration/signing.js";

const prisma = await useDb();
const body = JSON.stringify({ eventId: "e1" });
const ts = 1_700_000_000;
const tick = () => new Promise((r) => setTimeout(r, 5)); // distinct createdAt for ordering
let admin: string;

async function setup(withKey = false) {
  delete process.env.PORTAL_WEBHOOK_SECRET;
  delete process.env.VBL_WEBHOOK_SECRET;
  if (withKey) process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  else delete process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
  await resetDb(prisma);
  admin = (await seedFixture(prisma)).admin.id;
}

dbTest("issueCredential returns the secret once; listCredentials never includes it", async () => {
  await setup();
  const c = await issueCredential("VBL_TO_PORTAL", admin, "first", prisma);
  assert.ok(c.secret.length >= 32);
  assert.match(c.keyId, /^key_/);
  const listed = await listCredentials("VBL_TO_PORTAL", prisma);
  assert.equal(listed.length, 1);
  assert.ok(!("secret" in listed[0]));
});

dbTest("a signature made with an issued credential verifies, with and without a key-id hint", async () => {
  await setup();
  const c = await issueCredential("VBL_TO_PORTAL", admin, undefined, prisma);
  const sig = signPayload(c.secret, ts, body);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, sig, c.keyId, prisma), true);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, sig, undefined, prisma), true);
});

dbTest("rotation: after issuing a NEW credential the OLD one still verifies until revoked", async () => {
  await setup();
  const oldC = await issueCredential("VBL_TO_PORTAL", admin, "old", prisma);
  await tick();
  const newC = await issueCredential("VBL_TO_PORTAL", admin, "new", prisma);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(oldC.secret, ts, body), undefined, prisma), true);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(newC.secret, ts, body), undefined, prisma), true);
  assert.equal((await activeSigningCredential("VBL_TO_PORTAL", prisma)).keyId, newC.keyId);
  await revokeCredential(oldC.id, admin, prisma);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(oldC.secret, ts, body), oldC.keyId, prisma), false);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(newC.secret, ts, body), undefined, prisma), true);
});

dbTest("credentials are direction-scoped", async () => {
  await setup();
  const c = await issueCredential("PORTAL_TO_VBL", admin, undefined, prisma);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(c.secret, ts, body), undefined, prisma), false);
});

dbTest("wrong secret, missing signature, and tampered body are all rejected", async () => {
  await setup();
  const c = await issueCredential("VBL_TO_PORTAL", admin, undefined, prisma);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload("nope", ts, body), undefined, prisma), false);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, undefined, undefined, prisma), false);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body + " ", signPayload(c.secret, ts, body), undefined, prisma), false);
});

dbTest("env-var fallback works when no credential has been issued, and is not used when a hint names a different key", async () => {
  await setup();
  process.env.VBL_WEBHOOK_SECRET = "bootstrap-secret";
  const sig = signPayload("bootstrap-secret", ts, body);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, sig, undefined, prisma), true);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, sig, "env-fallback", prisma), true);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, sig, "key_other", prisma), false);
  assert.deepEqual(await activeSigningCredential("VBL_TO_PORTAL", prisma), { keyId: "env-fallback", secret: "bootstrap-secret" });
});

dbTest("with neither a credential nor an env secret, signing fails loudly", async () => {
  await setup();
  await assert.rejects(() => activeSigningCredential("PORTAL_TO_VBL", prisma), /No PORTAL_TO_VBL credential/);
});

dbTest("ENCRYPTION: with a key set, the secret column holds ciphertext, yet signing and verification still work", async () => {
  await setup(true);
  const c = await issueCredential("PORTAL_TO_VBL", admin, undefined, prisma);
  const row = await prisma.integrationCredential.findFirstOrThrow();
  assert.match(row.secret, /^enc:v1:/);
  assert.ok(!row.secret.includes(c.secret));
  assert.deepEqual(await activeSigningCredential("PORTAL_TO_VBL", prisma), { keyId: c.keyId, secret: c.secret });
  const v = await issueCredential("VBL_TO_PORTAL", admin, undefined, prisma);
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(v.secret, ts, body), v.keyId, prisma), true);
});

dbTest("ENCRYPTION: a legacy plaintext row still verifies after a key is introduced", async () => {
  await setup(true);
  await prisma.integrationCredential.create({ data: { keyId: "key_legacy", secret: "legacy-plain", direction: "VBL_TO_PORTAL", createdById: admin } });
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload("legacy-plain", ts, body), "key_legacy", prisma), true);
});

dbTest("ENCRYPTION: a credential encrypted under a different key is skipped, never accepted, never a crash", async () => {
  await setup(true);
  const c = await issueCredential("VBL_TO_PORTAL", admin, undefined, prisma);
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex"); // "lost" the old key
  assert.equal(await verifyAgainstAnyActiveCredential("VBL_TO_PORTAL", ts, body, signPayload(c.secret, ts, body), undefined, prisma), false);
});
