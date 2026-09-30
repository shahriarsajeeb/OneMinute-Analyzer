import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { MockAgent } from "undici";
import { countryCodes } from "../lib/countries";
import {
  createProxySession,
  readProxyCredentials,
} from "../lib/server/proxy/dataimpulse";
import { checkProxyConnection, probeExitIp } from "../lib/server/proxy/check";
import { ProxyError } from "../lib/server/proxy/errors";

const env = {
  DATAIMPULSE_LOGIN: "test_plan",
  DATAIMPULSE_PASSWORD: "private:@#;value",
};
function hasCode(code: string) {
  return (error: unknown) => error instanceof ProxyError && error.code === code;
}

for (const country of countryCodes) {
  test(`targets ${country} without changing the credential password`, () => {
    const session = createProxySession(country, "test-session", env);
    assert.equal(session.proxy.server, "http://gw.dataimpulse.com:823");
    assert.equal(
      session.proxy.username,
      `test_plan__cr.${country};sessid.test-session`,
    );
    assert.equal(session.proxy.password, env.DATAIMPULSE_PASSWORD);
  });
}

test("retests get fresh session IDs; an existing session is reusable", () => {
  const first = createProxySession("jp", undefined, env);
  const second = createProxySession("jp", undefined, env);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.deepEqual(createProxySession("jp", first.sessionId, env), first);
});

test("missing credentials fail before making any request", () => {
  assert.throws(() => readProxyCredentials({}), hasCode("NOT_CONFIGURED"));
  assert.throws(
    () => readProxyCredentials({ DATAIMPULSE_LOGIN: "plan" }),
    hasCode("NOT_CONFIGURED"),
  );
});

test("rejects targeting injection and malformed credentials without exposing them", () => {
  for (const login of [
    "secret__cr.us",
    "secret;cr.us",
    "secret:password",
    "secret\nvalue",
  ]) {
    assert.throws(
      () => readProxyCredentials({ ...env, DATAIMPULSE_LOGIN: login }),
      (error) => {
        assert.ok(error instanceof ProxyError);
        assert.equal(error.code, "INVALID_CONFIG");
        assert.ok(!error.message.includes(login));
        assert.ok(!error.message.includes(env.DATAIMPULSE_PASSWORD));
        return true;
      },
    );
  }
  assert.throws(
    () => readProxyCredentials({ ...env, DATAIMPULSE_PASSWORD: "\nsecret" }),
    hasCode("INVALID_CONFIG"),
  );
});

test("rejects unknown countries and unsafe session identifiers", () => {
  for (const country of ["uk", "US", "jp;cr.us", "", "__proto__"]) {
    assert.throws(
      () => createProxySession(country, "test", env),
      hasCode("INVALID_COUNTRY"),
    );
  }
  for (const session of ["", "test;cr.us", "a".repeat(65), "test\n"]) {
    assert.throws(
      () => createProxySession("jp", session, env),
      hasCode("INVALID_SESSION"),
    );
  }
});

async function mockProbe(
  status: number,
  body: string | object,
  delay = 0,
  timeout = 1000,
) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const scope = agent
    .get("https://api.ipify.org")
    .intercept({ path: "/?format=json", method: "GET" })
    .reply(status, body);
  if (delay) scope.delay(delay);
  try {
    return await probeExitIp("jp", agent, timeout);
  } finally {
    await agent.close();
  }
}

test("reports the real response IP without claiming country verification or returning secrets", async () => {
  const result = await mockProbe(200, { ip: "203.0.113.12" });
  assert.equal(result.exitIp, "203.0.113.12");
  assert.equal(result.requestedCountry, "jp");
  assert.equal(result.countryVerified, false);
  assert.equal("proxy" in result, false);
  assert.ok(result.durationMs >= 0);
});

test("accepts IPv6", async () => {
  assert.equal(
    (await mockProbe(200, { ip: "2001:db8::1" })).exitIp,
    "2001:db8::1",
  );
});

test("rejects malformed, missing, or oversized upstream data", async () => {
  for (const body of [
    "not-json",
    {},
    { ip: "not-an-ip" },
    { ip: 42 },
    "x".repeat(5000),
  ]) {
    await assert.rejects(
      () => mockProbe(200, body),
      hasCode("INVALID_RESPONSE"),
    );
  }
});

test("rejects non-success responses without exposing upstream text", async () => {
  for (const status of [403, 503]) {
    await assert.rejects(
      () => mockProbe(status, "secret upstream response"),
      (error) => {
        assert.ok(error instanceof ProxyError);
        assert.equal(error.code, "PROXY_REJECTED");
        assert.ok(!error.message.includes("secret"));
        return true;
      },
    );
  }
});

test("handles proxy authentication failures without leaking upstream text", async () => {
  await assert.rejects(
    () => mockProbe(407, "secret credentials"),
    hasCode("CONNECTION_FAILED"),
  );
});

test("bounds request time", async () => {
  await assert.rejects(
    () => mockProbe(200, { ip: "203.0.113.12" }, 100, 10),
    hasCode("TIMEOUT"),
  );
});

test("does not follow redirects from the diagnostic destination", async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent
    .get("https://api.ipify.org")
    .intercept({ path: "/?format=json" })
    .reply(302, "", { headers: { location: "https://elsewhere.invalid" } });
  try {
    await assert.rejects(
      () => probeExitIp("us", agent),
      hasCode("CONNECTION_FAILED"),
    );
  } finally {
    await agent.close();
  }
});

test("uses HTTP CONNECT with correct proxy authentication and no direct fallback", async () => {
  const server = createServer();
  let received:
    | { authorization: string | undefined; destination: string | undefined }
    | undefined;
  server.on("connect", (request, socket) => {
    received = {
      authorization: request.headers["proxy-authorization"],
      destination: request.url,
    };
    socket.end(
      "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const session = createProxySession("jp", "connection-test", env);
  session.proxy.server = `http://127.0.0.1:${address.port}`;
  try {
    await assert.rejects(
      () => checkProxyConnection(session),
      (error) => {
        assert.ok(error instanceof ProxyError);
        assert.equal(error.code, "CONNECTION_FAILED");
        assert.ok(!error.message.includes(env.DATAIMPULSE_PASSWORD));
        return true;
      },
    );
    assert.equal(received?.destination, "api.ipify.org:443");
    const expected = Buffer.from(
      `${session.proxy.username}:${env.DATAIMPULSE_PASSWORD}`,
    ).toString("base64");
    assert.equal(received?.authorization, `Basic ${expected}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
