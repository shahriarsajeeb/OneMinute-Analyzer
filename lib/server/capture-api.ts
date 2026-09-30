import { validateRules, type RegionalRule } from "@/lib/regional-rules";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isCountryCode } from "@/lib/countries";
import { runPage, RunnerError } from "@/lib/server/browser/runner";
import { TargetError } from "@/lib/server/browser/target";
import { ProxyError } from "@/lib/server/proxy/errors";

const state = globalThis as typeof globalThis & { __omaActiveRuns?: number };

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function captureRequest(request: NextRequest, apiOnly = false) {
  const configured = process.env.CAPTURE_API_KEY;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  const keyValid =
    !!configured &&
    configured.length >= 32 &&
    !!supplied &&
    Buffer.byteLength(configured) === Buffer.byteLength(supplied) &&
    timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
  if (apiOnly && !keyValid)
    return failure("A valid capture API key is required.", 401);
  // This POC has no account system. Keep paid browser execution on the local app.
  const origin = request.headers.get("origin");
  // Next may reconstruct request.url with an internal hostname.
  // Validate the actual Host header, not forwarded headers.
  let local: URL;
  try {
    local = new URL(`http://${request.headers.get("host") ?? ""}`);
  } catch {
    return failure("Invalid request origin.", 403);
  }
  if (
    !keyValid &&
    (!!local.username ||
      !!local.password ||
      !["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) ||
      origin !== local.origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  ) {
    return failure(
      "Browser testing is available only from this local app.",
      403,
    );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return failure("Send a JSON test request.", 415);
  let data: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("A URL and country are required.", 400);
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 32768) {
        await reader.cancel();
        return failure("Test request is too large.", 413);
      }
      chunks.push(chunk.value);
    }
    data = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return failure("Invalid test request.", 400);
  }
  if (
    !data ||
    typeof data !== "object" ||
    !("url" in data) ||
    typeof data.url !== "string" ||
    !("country" in data) ||
    !isCountryCode(data.country)
  )
    return failure("Provide a valid URL and supported country.", 400);
  let rules: RegionalRule[] = [];
  try {
    if ("rules" in data) rules = validateRules(data.rules);
    if (rules.some((rule) => rule.country !== data.country))
      return failure("Rules must match the requested country.", 400);
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Invalid rules",
      400,
    );
  }
  if ((state.__omaActiveRuns ?? 0) >= 2)
    return failure(
      "Two browser tests are already running. Please retry after they finish.",
      429,
    );
  const now = Date.now();
  const budget = globalThis as typeof globalThis & {
    __captureBudget?: { start: number; count: number };
  };
  if (!budget.__captureBudget || now - budget.__captureBudget.start >= 60_000)
    budget.__captureBudget = { start: now, count: 0 };
  if (budget.__captureBudget.count >= 20)
    return failure("Capture limit reached. Try again in one minute.", 429);
  budget.__captureBudget.count++;
  state.__omaActiveRuns = (state.__omaActiveRuns ?? 0) + 1;
  try {
    const result = await runPage(
      data.url,
      data.country,
      request.signal,
      undefined,
      rules,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TargetError) return failure(error.message, 400);
    if (error instanceof ProxyError) return failure(error.message, 503);
    if (error instanceof RunnerError)
      return failure(error.message, error.code === "CANCELLED" ? 499 : 503);
    return failure("Browser test could not complete.", 500);
  } finally {
    state.__omaActiveRuns = Math.max(0, (state.__omaActiveRuns ?? 1) - 1);
  }
}
