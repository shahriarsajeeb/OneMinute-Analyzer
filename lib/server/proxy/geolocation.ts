import "server-only";
import { isIP } from "node:net";
import type { APIRequestContext } from "playwright";
import type { ExitObservation, LocationVerification } from "@/lib/results";

export function parseExitObservation(data: unknown): ExitObservation | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (
    value.success !== true ||
    typeof value.ip !== "string" ||
    !isIP(value.ip) ||
    typeof value.country_code !== "string" ||
    !/^[A-Z]{2}$/.test(value.country_code)
  )
    return null;
  return {
    ip: value.ip,
    country: value.country_code.toLowerCase(),
    checkedAt: new Date().toISOString(),
  };
}

// Context request shares the browser's configured proxy. Never fall back to a direct request.
export async function observeExit(
  request: APIRequestContext,
): Promise<ExitObservation | null> {
  try {
    const response = await request.get(
      "https://ipwho.is/?fields=success,ip,country_code",
      { timeout: 5000, maxRedirects: 0, maxRetries: 0 },
    );
    try {
      if (!response.ok()) return null;
      const body = await response.body();
      if (body.length > 4096) return null;
      return parseExitObservation(JSON.parse(body.toString()));
    } finally {
      await response.dispose();
    }
  } catch {
    return null;
  }
}

export function verifyObservations(
  country: string,
  before: ExitObservation | null,
  after: ExitObservation | null,
): LocationVerification {
  const status =
    !before || !after
      ? "unverified"
      : before.country !== country || after.country !== country
        ? "mismatch"
        : before.ip !== after.ip
          ? "changed"
          : "consistent";
  return { status, before, after, provider: "ipwho.is" };
}
