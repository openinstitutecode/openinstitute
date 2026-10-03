// VBI010/045 — AES-256-GCM secret box (Batch 66). Pure, no database.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret, isEncrypted, loadKey } from "../src/integration/secret-box.js";

const key = crypto.randomBytes(32);

test("round-trips, is randomised, and is marked as encrypted", () => {
  const a = encryptSecret("s3cret", key);
  const b = encryptSecret("s3cret", key);
  assert.ok(isEncrypted(a));
  assert.notEqual(a, b); // fresh IV each time
  assert.ok(!a.includes("s3cret"));
  assert.equal(decryptSecret(a, key), "s3cret");
});

test("tampering with any part of the ciphertext is detected", () => {
  const enc = encryptSecret("s3cret", key);
  const [pre, ver, iv, tag, ct] = enc.split(":");
  const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
  for (const bad of [`${pre}:${ver}:${flip(iv)}:${tag}:${ct}`, `${pre}:${ver}:${iv}:${flip(tag)}:${ct}`, `${pre}:${ver}:${iv}:${tag}:${flip(ct)}`]) {
    assert.throws(() => decryptSecret(bad, key));
  }
});

test("the wrong key cannot decrypt", () => {
  assert.throws(() => decryptSecret(encryptSecret("s3cret", key), crypto.randomBytes(32)));
});

test("legacy plaintext passes through decrypt unchanged", () => {
  assert.equal(decryptSecret("plain-old-secret", key), "plain-old-secret");
  assert.equal(decryptSecret("plain-old-secret", null), "plain-old-secret");
});

test("an encrypted value without a configured key fails loudly", () => {
  assert.throws(() => decryptSecret(encryptSecret("x", key), null), /not set/);
});

test("without a key: dev stores plaintext, production refuses", () => {
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    assert.equal(encryptSecret("x", null), "x");
    process.env.NODE_ENV = "production";
    assert.throws(() => encryptSecret("x", null), /required in production/);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("loadKey accepts 64 hex chars or base64 of 32 bytes and rejects anything else", () => {
  assert.equal(loadKey(key.toString("hex"))?.length, 32);
  assert.equal(loadKey(key.toString("base64"))?.length, 32);
  assert.equal(loadKey(undefined), null);
  assert.throws(() => loadKey("too-short"));
});
