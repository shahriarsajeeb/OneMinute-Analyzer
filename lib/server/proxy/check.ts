import "server-only";

import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { ProxyAgent, fetch, type Dispatcher } from "undici";
import type { ProxySession } from "./dataimpulse";
import { ProxyError } from "./errors";

export type ProxyCheckResult = {
  provider: "dataimpulse";
  requestedCountry: ProxySession["country"];
  exitIp: string;
  durationMs: number;
  checkedAt: string;
  countryVerified: false;
};

export function createProxyAgent(session: ProxySession): ProxyAgent {
  return new ProxyAgent({
    uri: session.proxy.server,
    token: `Basic ${Buffer.from(`${session.proxy.username}:${session.proxy.password}`).toString("base64")}`,
    // TLS verification stays enabled for the target website.
    requestTls: { rejectUnauthorized: true },
    connectTimeout: 10_000,
  });
}

/** Fixed diagnostic destination; this is not an arbitrary-URL fetching API. */
export async function checkProxyConnection(
  session: ProxySession,
): Promise<ProxyCheckResult> {
  const agent = createProxyAgent(session);
  try {
    return await probeExitIp(session.country, agent);
  } finally {
    await agent.destroy();
  }
}

/** Separate transport lets automated tests use a local mock, with no paid traffic. */
export async function probeExitIp(
  country: ProxySession["country"],
  dispatcher: Dispatcher,
  timeoutMs = 15_000,
): Promise<ProxyCheckResult> {
  const started = performance.now();
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      dispatcher,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProxyError(
        "PROXY_REJECTED",
        "The proxy check was rejected. Check your plan credentials, balance, limits, and country availability.",
      );
    }
    // Limit the response even when Content-Length is missing or incorrect.
    let body = "";
    if (!response.body)
      throw new ProxyError(
        "INVALID_RESPONSE",
        "The proxy check returned no response body.",
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4096)
          throw new ProxyError(
            "INVALID_RESPONSE",
            "The proxy check returned an unexpectedly large response.",
          );
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      throw new ProxyError(
        "INVALID_RESPONSE",
        "The proxy check did not return a valid IP response.",
      );
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("ip" in data) ||
      typeof data.ip !== "string" ||
      !isIP(data.ip)
    ) {
      throw new ProxyError(
        "INVALID_RESPONSE",
        "The proxy check did not return a valid exit IP.",
      );
    }
    return {
      provider: "dataimpulse",
      requestedCountry: country,
      exitIp: data.ip,
      durationMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
      countryVerified: false,
    };
  } catch (error) {
    if (error instanceof ProxyError) throw error;
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    ) {
      throw new ProxyError(
        "TIMEOUT",
        "The proxy check timed out. Try again or select another country.",
      );
    }
    // Undici wraps CONNECT failures. Do not expose its raw message/cause.
    throw new ProxyError(
      "CONNECTION_FAILED",
      "Could not connect through DataImpulse. Check connectivity, proxy credentials, plan balance, limits, and country availability.",
    );
  }
}
