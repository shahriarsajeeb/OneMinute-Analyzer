import { loadEnvConfig } from "@next/env";
import { isCountryCode } from "../lib/countries";
import { createProxySession } from "../lib/server/proxy/dataimpulse";
import { checkProxyConnection } from "../lib/server/proxy/check";
import { ProxyError } from "../lib/server/proxy/errors";

loadEnvConfig(process.cwd(), true);

async function main() {
  const args = process.argv.slice(2);
  const country = args[0] ?? "us";
  if (args.length > 1 || !isCountryCode(country)) {
    throw new ProxyError(
      "INVALID_COUNTRY",
      "Usage: npm run proxy:check -- <us|ca|gb|de|fr|nl|jp|sg|in|th|br>",
    );
  }
  const session = createProxySession(country);
  // Only the safe diagnostic result is printed; never the session credentials.
  const result = await checkProxyConnection(session);
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "Connection verified. The exit IP country has not been independently geolocated.",
  );
}

main().catch((error) => {
  const safe =
    error instanceof ProxyError
      ? error
      : new ProxyError("CONNECTION_FAILED", "Proxy check failed.");
  console.error(`${safe.code}: ${safe.message}`);
  process.exitCode = 1;
});
