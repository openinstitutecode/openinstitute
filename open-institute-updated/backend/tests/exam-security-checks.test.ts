// Unit tests for EX013 exam-security pure logic.
// Run: npm test   (uses Node's built-in test runner via tsx; no database needed)
import test from "node:test";
import assert from "node:assert/strict";

import { detectBrowserAnomalies, isUnusuallySmallScreen } from "../src/lib/exam-security-checks.js";

test("detectBrowserAnomalies: BUGFIX headless Chrome is now actually detected", () => {
  // The real Chrome-headless UA string uses this exact mixed case. The old
  // code lowercased the UA then searched for "headlessChrome" (mixed case),
  // which can never match -- so this always came back empty before the fix.
  const flags = detectBrowserAnomalies(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/119.0.0.0 Safari/537.36"
  );
  assert.ok(flags.some((f) => f.flagType === "automation_detected"));
});

test("detectBrowserAnomalies: BUGFIX an ordinary Motorola Android phone is no longer flagged as Tor", () => {
  // The old code used ua.includes("tor"), which matches the "tor" inside
  // "Motorola" -- flagging perfectly ordinary students on Android phones.
  const flags = detectBrowserAnomalies(
    "Mozilla/5.0 (Linux; Android 13; moto g84 5G) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36"
  );
  assert.ok(!flags.some((f) => f.flagType === "tor_or_vpn"), "should not flag Motorola as Tor");
  // It's still fine (and correct) to flag it as a mobile device.
  assert.ok(flags.some((f) => f.flagType === "mobile_device"));
});

test("detectBrowserAnomalies: a genuine Tor Browser UA is still flagged", () => {
  const flags = detectBrowserAnomalies(
    "Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0 TorBrowser/12.0"
  );
  assert.ok(flags.some((f) => f.flagType === "tor_or_vpn"));
});

test("detectBrowserAnomalies: empty user-agent never throws, returns no flags", () => {
  assert.deepEqual(detectBrowserAnomalies(""), []);
});

test("detectBrowserAnomalies: selenium/webdriver strings are flagged as automation", () => {
  const flags = detectBrowserAnomalies("Mozilla/5.0 selenium/4.1.0 (KHTML, like Gecko) Chrome/119.0");
  assert.ok(flags.some((f) => f.flagType === "automation_detected"));
});

test("isUnusuallySmallScreen: flags small screens, not typical laptop/desktop sizes", () => {
  assert.equal(isUnusuallySmallScreen(320, 480), true);
  assert.equal(isUnusuallySmallScreen(1920, 1080), false);
  assert.equal(isUnusuallySmallScreen(undefined, undefined), false);
});
