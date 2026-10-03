import assert from "node:assert/strict";
import { after, test } from "node:test";

const originalEnv = {
  MOODLE_BASE_URL: process.env.MOODLE_BASE_URL,
  MOODLE_WS_TOKEN: process.env.MOODLE_WS_TOKEN,
  MOODLE_SSO_WS_TOKEN: process.env.MOODLE_SSO_WS_TOKEN,
};

process.env.MOODLE_BASE_URL = "https://moodle.example";
process.env.MOODLE_WS_TOKEN = "general-service-token";
delete process.env.MOODLE_SSO_WS_TOKEN;

const { callMoodle } = await import("../src/moodle/client.js");
const { getMoodleLaunchUrl, isMoodleSsoConfigured } = await import("../src/moodle/sso.js");

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Moodle REST client encodes nested parameters and uses the service token", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody = new URLSearchParams();
  let contentType = "";

  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = new URLSearchParams(String(init?.body));
    contentType = new Headers(init?.headers).get("content-type") ?? "";
    return new Response(JSON.stringify([{ id: 42 }]), { status: 200 });
  };

  try {
    const result = await callMoodle<Array<{ id: number }>>("core_course_create_courses", {
      courses: [{ fullname: "Intro & Basics", categoryid: 2 }],
    });

    assert.deepEqual(result, [{ id: 42 }]);
    assert.equal(requestUrl, "https://moodle.example/webservice/rest/server.php");
    assert.equal(contentType, "application/x-www-form-urlencoded");
    assert.equal(requestBody.get("wstoken"), "general-service-token");
    assert.equal(requestBody.get("wsfunction"), "core_course_create_courses");
    assert.equal(requestBody.get("courses[0][fullname]"), "Intro & Basics");
    assert.equal(requestBody.get("courses[0][categoryid]"), "2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Moodle SSO refuses to use the general web-service token as a fallback", async () => {
  assert.equal(isMoodleSsoConfigured(), false);
  await assert.rejects(
    getMoodleLaunchUrl({ userId: "unused-without-database-access" }),
    /MOODLE_SSO_WS_TOKEN missing/
  );
});
