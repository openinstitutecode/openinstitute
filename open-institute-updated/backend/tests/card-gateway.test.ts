import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { verifyStripeSignature } from "../src/lib/card-gateway.js";

function sign(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test("verifyStripeSignature accepts a correctly-signed payload", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const header = sign(body, secret);
  assert.equal(verifyStripeSignature(Buffer.from(body), header, secret), true);
});

test("verifyStripeSignature rejects a payload signed with the wrong secret", () => {
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const header = sign(body, "whsec_wrong");
  assert.equal(verifyStripeSignature(Buffer.from(body), header, "whsec_test_secret"), false);
});

test("verifyStripeSignature rejects a tampered body", () => {
  const secret = "whsec_test_secret";
  const original = JSON.stringify({ amount: 100 });
  const header = sign(original, secret);
  const tampered = JSON.stringify({ amount: 100000 });
  assert.equal(verifyStripeSignature(Buffer.from(tampered), header, secret), false);
});

test("verifyStripeSignature rejects a missing signature header", () => {
  assert.equal(verifyStripeSignature(Buffer.from("{}"), undefined, "whsec_test_secret"), false);
});

test("verifyStripeSignature rejects a malformed signature header", () => {
  assert.equal(verifyStripeSignature(Buffer.from("{}"), "not-a-real-header", "whsec_test_secret"), false);
});
