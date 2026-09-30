import { loadEnvConfig } from "@next/env";
import { failedRequests, cancelledRequests } from "../lib/results";
import { isCountryCode } from "../lib/countries";
import { runPage, RunnerError } from "../lib/server/browser/runner";
import { TargetError } from "../lib/server/browser/target";
import { ProxyError } from "../lib/server/proxy/errors";

loadEnvConfig(process.cwd(), true);
async function main() {
  const [url = "https://example.com", country = "jp", expectedText] =
    process.argv.slice(2);
  if (!isCountryCode(country)) throw new Error("Unsupported country.");
  const result = await runPage(url, country, undefined, expectedText);
  console.log(
    JSON.stringify(
      {
        location: result.locationId,
        contentCheck: result.contentCheck,
        locationVerification: result.locationVerification,
        status: result.status,
        httpStatus: result.httpStatus,
        finalUrl: result.finalUrl,
        totalLoadMs: result.totalLoadMs,
        performance: result.performance,
        screenshotCaptured: !!result.screenshotUrl,
        requests: result.networkRequests.length,
        failedRequests: failedRequests(result).length,
        cancelledRequests: cancelledRequests(result).length,
        consoleErrors: result.consoleEntries.filter(
          (item) => item.level === "error",
        ).length,
        redirects: result.redirects.length,
        error: result.error,
        notes: result.notes,
      },
      null,
      2,
    ),
  );
  if (result.error) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    error instanceof RunnerError ||
      error instanceof ProxyError ||
      error instanceof TargetError
      ? error.message
      : "Browser check failed.",
  );
  process.exitCode = 1;
});
