import test from "node:test";
import assert from "node:assert/strict";

import { versionNegotiation, CURRENT_API_VERSION } from "../src/integration/versioning.js";

function fakeReqRes(acceptVersion?: string) {
  const headers: Record<string, string> = acceptVersion ? { "accept-version": acceptVersion } : {};
  const req = { header: (name: string) => headers[name.toLowerCase()] } as any;
  const setHeaders: Record<string, string> = {};
  let statusCode: number | null = null;
  let body: unknown = null;
  const res = {
    setHeader(name: string, value: string) {
      setHeaders[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as any;
  return { req, res, setHeaders, getStatus: () => statusCode, getBody: () => body };
}

test("stamps the current API version on every response", () => {
  const mw = versionNegotiation();
  const { req, res, setHeaders } = fakeReqRes();
  let called = false;
  mw(req, res, () => (called = true));
  assert.equal(called, true);
  assert.equal(setHeaders["X-Integration-Api-Version"], CURRENT_API_VERSION);
});

test("allows a request that pins the current supported version", () => {
  const mw = versionNegotiation();
  const { req, res, getStatus } = fakeReqRes("v1");
  let called = false;
  mw(req, res, () => (called = true));
  assert.equal(called, true);
  assert.equal(getStatus(), null);
});

test("rejects a request that pins an unsupported version", () => {
  const mw = versionNegotiation();
  const { req, res, getStatus, getBody } = fakeReqRes("v99");
  let called = false;
  mw(req, res, () => (called = true));
  assert.equal(called, false);
  assert.equal(getStatus(), 400);
  assert.match((getBody() as { message: string }).message, /v99/);
});
