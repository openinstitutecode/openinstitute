// EX013 -- Exam session security: advisory-only browser/environment checks.
// Pure logic, no DB access, so it can be unit-tested. See
// tests/exam-security-checks.test.ts.

export type SecurityAnomaly = { flagType: string; severity: string };

/**
 * BUGFIX (two bugs): the previous version lowercased the incoming
 * User-Agent and then searched it for the mixed-case literal
 * "headlessChrome" -- a substring with an uppercase letter can never be
 * found inside a string that was just lowercased, so headless/automation
 * browsers (the single most useful signal here) were never flagged.
 *
 * The previous "tor" check used `ua.includes("tor")`, which matches any
 * string containing "tor" as a plain substring -- including "Motorola" and
 * "TORonto" in ordinary device/locale strings -- so real students on
 * Android phones were flagged as possibly using Tor. We now require "tor"
 * to appear as its own word.
 */
export function detectBrowserAnomalies(userAgent: string): SecurityAnomaly[] {
  const flags: SecurityAnomaly[] = [];

  if (!userAgent) return flags;

  const ua = userAgent.toLowerCase();

  if (/\btor\b/.test(ua) || ua.includes("torbrowser")) {
    flags.push({ flagType: "tor_or_vpn", severity: "info" });
  }

  if (ua.includes("virtualbox") || ua.includes("vmware")) {
    flags.push({ flagType: "vm_detected", severity: "warning" });
  }

  if (
    ua.includes("headlesschrome") ||
    ua.includes("phantomjs") ||
    ua.includes("selenium") ||
    ua.includes("puppeteer") ||
    ua.includes("playwright")
  ) {
    flags.push({ flagType: "automation_detected", severity: "warning" });
  }

  if (ua.includes("android") || ua.includes("iphone") || ua.includes("ipad")) {
    flags.push({ flagType: "mobile_device", severity: "info" });
  }

  return flags;
}

/** True screen dimensions worth flagging as unusually small for sitting an exam. */
export function isUnusuallySmallScreen(width?: number, height?: number): boolean {
  if (!width || !height) return false;
  return width < 800 || height < 600;
}
