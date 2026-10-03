// Unit tests for the HMAC signing/verification and SSO assertion helpers
// behind the Virtual Business Lab integration (VBI008/009/013). No database
// needed — same pattern as card-gateway.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

import { signPayload, verifySignedPayload, hashPayload, issueSsoAssertion, verifySsoAssertion } from "../src/integration/signing.js";

test("verifySignedPayload accepts a correctly-signed payload", () => {
  const secret = "test_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ eventType: "assessment.decided" });
  const signature = signPayload(secret, timestamp, body);
  assert.equal(verifySignedPayload(secret, timestamp, body, signature), true);
});

test("verifySignedPayload rejects the wrong secret", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ a: 1 });
  const signature = signPayload("secret_a", timestamp, body);
  assert.equal(verifySignedPayload("secret_b", timestamp, body, signature), false);
});

test("verifySignedPayload rejects a tampered body", () => {
  const secret = "test_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(secret, timestamp, JSON.stringify({ amount: 100 }));
  assert.equal(verifySignedPayload(secret, timestamp, JSON.stringify({ amount: 100000 }), signature), false);
});

test("verifySignedPayload rejects a missing signature", () => {
  assert.equal(verifySignedPayload("secret", 1, "{}", undefined), false);
});

test("hashPayload is stable for the same object and changes when the payload changes", () => {
  assert.equal(hashPayload({ a: 1, b: 2 }), hashPayload({ a: 1, b: 2 }));
  assert.notEqual(hashPayload({ a: 1, b: 2 }), hashPayload({ a: 1, b: 3 }));
});

test("issueSsoAssertion / verifySsoAssertion round-trips valid claims", () => {
  const secret = "sso_secret";
  const { assertion } = issueSsoAssertion(secret, {
    sub: "user-1", portalUserId: "user-1", portalStudentId: "student-1",
    registrationNumber: "2026/BM5/000001", roles: ["student"],
  });
  const claims = verifySsoAssertion(secret, assertion);
  assert.equal(claims.portalStudentId, "student-1");
  assert.equal(claims.iss, "kvbdtc-portal");
  assert.equal(claims.aud, "virtual-business-lab");
});

test("verifySsoAssertion rejects an assertion signed with the wrong secret", () => {
  const { assertion } = issueSsoAssertion("secret_a", { sub: "u", portalUserId: "u", roles: ["student"] });
  assert.throws(() => verifySsoAssertion("secret_b", assertion));
});

test("verifySsoAssertion rejects an expired assertion", () => {
  const secret = "sso_secret";
  const { assertion } = issueSsoAssertion(secret, { sub: "u", portalUserId: "u", roles: ["student"] }, -10);
  assert.throws(() => verifySsoAssertion(secret, assertion));
});

test("verifySsoAssertion rejects a malformed assertion", () => {
  assert.throws(() => verifySsoAssertion("secret", "not-a-real-assertion"));
});
