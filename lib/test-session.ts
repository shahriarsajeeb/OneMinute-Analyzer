import { allIds } from "./mock-data";

export type TestConfig = { url: string; ids: string[] };
const storageKey = "oneminute-test";

export function normalizeUrl(input: string): string {
  const value = input.trim();
  const parsed = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    !parsed.hostname.includes(".")
  ) {
    throw new Error("Enter a valid HTTP or HTTPS website URL.");
  }
  return parsed.href;
}

// Only the current test is stored. There is no test history or account state.
export function saveTestConfig(config: TestConfig) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    /* Storage may be unavailable. */
  }
}

export function readTestConfig(): TestConfig | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (
      !data ||
      typeof data !== "object" ||
      !("url" in data) ||
      !("ids" in data)
    )
      return null;
    if (typeof data.url !== "string" || !Array.isArray(data.ids)) return null;
    const suppliedIds = data.ids;
    const ids = allIds.filter((id) => suppliedIds.includes(id));
    return ids.length ? { url: normalizeUrl(data.url), ids } : null;
  } catch {
    return null;
  }
}
