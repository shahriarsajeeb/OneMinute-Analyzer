import type { RegionalRule } from "./regional-rules";
import { isCountryCode } from "./countries";
import { unavailableResult, type PageResult, type TestResult } from "./results";

export type LocationProgress = {
  id: string;
  state: "queued" | "running" | "complete";
  result?: PageResult;
};

export async function executeTest(
  url: string,
  ids: string[],
  signal: AbortSignal,
  onProgress: (progress: LocationProgress) => void,
  expectedText?: string,
  rules?: RegionalRule[],
): Promise<TestResult> {
  const unique = [...new Set(ids)].filter(isCountryCode);
  if (!unique.length)
    throw new Error("Choose at least one supported location.");
  const results = new Array<PageResult>(unique.length);
  let next = 0;
  async function worker() {
    while (next < unique.length && !signal.aborted) {
      const index = next++;
      const country = unique[index];
      onProgress({ id: country, state: "running" });
      try {
        const response = await fetch("/api/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            country,
            rules: rules?.filter((rule) => rule.country === country),
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "The server could not complete the test.",
          );
        if (
          data.mode !== "live" ||
          data.locationId !== country ||
          !Array.isArray(data.networkRequests)
        )
          throw new Error("The server returned an invalid result.");
        results[index] = data as PageResult;
      } catch (error) {
        if (signal.aborted) throw error;
        const message =
          error instanceof Error && error.name === "TimeoutError"
            ? "The browser test timed out."
            : error instanceof Error
              ? error.message
              : "The browser test could not complete.";
        results[index] = unavailableResult(
          country,
          url,
          "EXECUTION_FAILED",
          message,
        );
      }
      if (rules?.length && !results[index].assertions?.length)
        results[index].assertions = rules
          .filter((rule) => rule.country === country)
          .map((rule) => ({
            rule,
            outcome: "inconclusive",
            observed: "Not evaluated",
            reason:
              results[index].error?.message ?? "No assertion evidence returned",
          }));
      if (!signal.aborted)
        onProgress({ id: country, state: "complete", result: results[index] });
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, unique.length) }, worker));
  signal.throwIfAborted();
  return {
    mode: "live",
    id: `TST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    url,
    expectedText,
    rules,
    completedAt: new Date().toISOString(),
    results,
  };
}
