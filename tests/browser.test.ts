import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPublicAddress,
  parseTarget,
  validateTarget,
} from "../lib/server/browser/target";
import {
  unavailableResult,
  summarizeResult,
  failedRequests,
  cancelledRequests,
} from "../lib/results";
import { executeTest } from "../lib/live-test";

for (const address of [
  "127.0.0.1",
  "10.0.0.1",
  "172.16.0.1",
  "192.168.0.1",
  "169.254.169.254",
  "0.0.0.0",
  "100.64.0.1",
  "224.0.0.1",
  "::1",
  "fc00::1",
  "fe80::1",
  "::ffff:127.0.0.1",
  "2001:db8::1",
]) {
  test(`blocks non-public address ${address}`, () =>
    assert.equal(isPublicAddress(address), false));
}
test("allows public v4 and v6", () => {
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
test("rejects local URLs, nonstandard ports, embedded credentials and alternative IP forms", () => {
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::ffff:127.0.0.1]",
    "https://example.com:8080/",
    "https://user:password@example.com/",
    "http://metadata.google.internal",
    "http://test.local",
    "http://localhost.",
  ])
    assert.throws(() => parseTarget(url));
});
test("preserves exact path and query", () =>
  assert.equal(
    parseTarget("https://example.com/pricing?a=1&b=2#plan").href,
    "https://example.com/pricing?a=1&b=2#plan",
  ));
test("blocks a hostname if any DNS answer is private", async () => {
  const resolver = async () => [
    { address: "1.1.1.1", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ];
  await assert.rejects(() =>
    validateTarget(
      "https://example.com",
      resolver as unknown as Parameters<typeof validateTarget>[1],
    ),
  );
});
test("client runs at most two countries, reports real completions, and continues after a failed country", async () => {
  const original = globalThis.fetch;
  let active = 0,
    peak = 0;
  const completed: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const { url, country } = JSON.parse(init!.body as string);
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    if (country === "de")
      return Response.json({ error: "Proxy unavailable." }, { status: 503 });
    const result = unavailableResult(country, url, "", "");
    result.error = null;
    result.status = "pass";
    result.httpStatus = 200;
    result.totalLoadMs = 100;
    return Response.json(result);
  };
  try {
    const result = await executeTest(
      "https://example.com/exact?q=1",
      ["us", "de", "jp"],
      new AbortController().signal,
      (item) => {
        if (item.state === "complete") completed.push(item.id);
      },
    );
    assert.equal(peak, 2);
    assert.equal(completed.length, 3);
    assert.deepEqual(
      result.results.map((item) => item.locationId),
      ["us", "de", "jp"],
    );
    assert.equal(result.results[1].error?.message, "Proxy unavailable.");
    assert.equal(result.mode, "live");
  } finally {
    globalThis.fetch = original;
  }
});
test("cancelled runs do not launch queued countries", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() =>
    executeTest("https://example.com", ["jp"], controller.signal, () =>
      assert.fail("Should not start"),
    ),
  );
});

test("full load and paint readiness are distinct; capture waiting is not added", async () => {
  const { navigationTimings } = await import("../lib/browser-timings");
  const measured = navigationTimings({
    startTime: 0,
    requestStart: 1500,
    responseStart: 1800,
    domContentLoadedEventEnd: 2400,
    loadEventEnd: 8100,
  });
  assert.deepEqual(measured, {
    totalLoadMs: 8100,
    ttfbMs: 1800,
    responseWaitMs: 300,
    domContentLoadedMs: 2400,
  });
  assert.deepEqual(navigationTimings(null), {
    totalLoadMs: null,
    ttfbMs: null,
    responseWaitMs: null,
    domContentLoadedMs: null,
  });
  const partial = navigationTimings({
    startTime: 0,
    requestStart: 1500,
    responseStart: 1800,
    domContentLoadedEventEnd: 2400,
    loadEventEnd: 0,
  });
  assert.equal(partial.totalLoadMs, null);
  assert.equal(partial.domContentLoadedMs, 2400);
});

test("capture verdict depends on screenshot evidence, not diagnostic noise", () => {
  const result = unavailableResult("us", "https://example.com", "", "");
  result.error = null;
  result.httpStatus = 200;
  result.totalLoadMs = 18000;
  result.contentCheck = { expectedText: "Welcome", outcome: "matched" };
  result.screenshotUrl = "data:image/jpeg;base64,fixture";
  result.networkRequests = [
    {
      method: "GET",
      request: "https://example.com/unused.js",
      status: 503,
      durationMs: 100,
    },
  ];
  result.consoleEntries = [{ level: "error", message: "Background error" }];
  summarizeResult(result);
  assert.equal(result.status, "pass");
  assert.equal(failedRequests(result).length, 1);
  result.contentCheck.outcome = "not-matched";
  summarizeResult(result);
  assert.equal(result.status, "pass");
  result.screenshotUrl = null;
  result.error = { code: "PAGE_TIMEOUT", message: "Navigation timed out" };
  summarizeResult(result);
  assert.equal(result.status, "warning");
});
test("legacy captures and execution failures are inconclusive", () => {
  const result = unavailableResult(
    "us",
    "https://example.com",
    "EXECUTION_FAILED",
    "Browser unavailable",
  );
  assert.equal(result.status, "warning");
  result.error = null;
  result.httpStatus = 200;
  summarizeResult(result);
  assert.equal(result.status, "warning");
  assert.match(result.issue, /Screenshot unavailable/);
});
test("cancelled requests remain separate from HTTP failures in diagnostics", () => {
  const result = unavailableResult("us", "https://example.com", "", "");
  result.networkRequests = [
    {
      method: "GET",
      request: "https://example.com/sign-in?_rsc=123",
      status: 200,
      durationMs: null,
      failure: "net::ERR_ABORTED",
    },
  ];
  assert.equal(failedRequests(result).length, 0);
  assert.equal(cancelledRequests(result).length, 1);
  result.networkRequests[0].status = 503;
  assert.equal(failedRequests(result).length, 1);
});

test("exit evidence requires both matching countries and a stable IP", async () => {
  const { parseExitObservation, verifyObservations } =
    await import("../lib/server/proxy/geolocation");
  const us = parseExitObservation({
    success: true,
    ip: "8.8.8.8",
    country_code: "US",
  })!;
  assert.equal(parseExitObservation({ success: false }), null);
  assert.equal(
    parseExitObservation({ success: true, ip: "invalid", country_code: "US" }),
    null,
  );
  assert.equal(verifyObservations("us", us, us).status, "consistent");
  assert.equal(verifyObservations("jp", us, us).status, "mismatch");
  assert.equal(verifyObservations("us", us, null).status, "unverified");
  assert.equal(
    verifyObservations("us", us, { ...us, ip: "1.1.1.1" }).status,
    "changed",
  );
  const result = unavailableResult("jp", "https://example.com", "", "");
  result.error = null;
  result.contentCheck = { expectedText: "Welcome", outcome: "matched" };
  result.locationVerification = verifyObservations("jp", us, us);
  summarizeResult(result);
  assert.equal(result.status, "warning");
});

test("capture API requires credentials and validates input without launching a browser", async () => {
  const { captureRequest } = await import("../lib/server/capture-api");
  const { NextRequest } = await import("next/server");
  const previous = process.env.CAPTURE_API_KEY;
  process.env.CAPTURE_API_KEY = "fixture-key-123456789012345678901234567890";
  try {
    const make = (key?: string) =>
      new NextRequest("http://localhost/api/capture", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": "application/json",
          ...(key ? { authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          url: "https://example.com",
          country: "invalid",
        }),
      });
    assert.equal((await captureRequest(make(), true)).status, 401);
    assert.equal((await captureRequest(make("wrong"), true)).status, 401);
    assert.equal(
      (await captureRequest(make(process.env.CAPTURE_API_KEY), true)).status,
      400,
    );
  } finally {
    if (previous === undefined) delete process.env.CAPTURE_API_KEY;
    else process.env.CAPTURE_API_KEY = previous;
  }
});

test("regional assertions determine verdict; screenshot and HTTP 200 cannot hide a price mismatch", () => {
  const result = unavailableResult("br", "https://example.com", "", "");
  result.error = null;
  result.httpStatus = 200;
  result.screenshotUrl = "data:image/jpeg;base64,fixture";
  result.locationVerification = {
    status: "consistent",
    before: null,
    after: null,
    provider: "ipwho.is",
  };
  const rule = {
    id: "price",
    name: "Product price",
    country: "br",
    kind: "text" as const,
    selector: "#price",
    expected: "R$ 149,00",
  };
  result.assertions = [
    { rule, outcome: "fail", observed: "$29.00", reason: "Text differs" },
  ];
  summarizeResult(result);
  assert.equal(result.status, "failed");
  result.assertions[0].outcome = "pass";
  result.networkRequests = [
    {
      method: "GET",
      request: "https://example.com/noise.svg",
      status: 402,
      durationMs: 20,
    },
  ];
  summarizeResult(result);
  assert.equal(result.status, "pass");
  result.locationVerification.status = "unverified";
  summarizeResult(result);
  assert.equal(result.status, "warning");
});
test("rule validation rejects unsupported or incomplete configurations", async () => {
  const { validateRules } = await import("../lib/regional-rules");
  const rule = {
    id: "one",
    name: "Price",
    country: "br",
    kind: "text",
    selector: "#price",
    expected: "R$ 149,00",
  };
  assert.equal(validateRules([rule]).length, 1);
  assert.throws(() => validateRules([rule, rule]));
  assert.throws(() => validateRules([{ ...rule, kind: "script" }]));
  assert.throws(() => validateRules([{ ...rule, selector: "" }]));
  assert.throws(() => validateRules([{ ...rule, country: "zz" }]));
});
test("blocked, not-served, or unverified sessions make every check inconclusive, never a mismatch or pass", async () => {
  const { checkVerdict } = await import("../lib/results");
  const result = unavailableResult("th", "https://example.com", "", "");
  result.error = null;
  result.httpStatus = 200;
  result.screenshotUrl = "data:image/jpeg;base64,fixture";
  result.locationVerification = { status: "consistent", before: null, after: null, provider: "ipwho.is" };
  const rule = { id: "p", name: "Price", country: "th", kind: "contains" as const, selector: "", expected: "฿1,000" };
  result.assertions = [{ rule, outcome: "fail", observed: "Not shown", reason: "Missing" }];
  summarizeResult(result);
  assert.equal(result.status, "failed");
  assert.equal(checkVerdict(result, result.assertions[0]).outcome, "fail");
  result.httpStatus = 403;
  summarizeResult(result);
  assert.equal(result.status, "warning");
  assert.match(result.issue, /Inconclusive: The page was not served \(HTTP 403\)/);
  assert.equal(checkVerdict(result, result.assertions[0]).outcome, "inconclusive");
  result.httpStatus = 200;
  result.accessIssue = "Bot-protection or CAPTCHA page detected";
  result.assertions[0].outcome = "pass";
  summarizeResult(result);
  assert.equal(result.status, "warning");
  assert.equal(checkVerdict(result, result.assertions[0]).outcome, "inconclusive");
  result.assertions = [];
  summarizeResult(result);
  assert.equal(result.status, "warning");
});
