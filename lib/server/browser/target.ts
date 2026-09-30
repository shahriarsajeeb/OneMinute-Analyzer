import "server-only";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export class TargetError extends Error {
  constructor(message = "Use a public HTTP or HTTPS URL on port 80 or 443.") {
    super(message);
    this.name = "TargetError";
  }
}
export function isPublicAddress(value: string): boolean {
  try {
    const address = ipaddr.process(value.replace(/^\[|\]$/g, ""));
    return address.range() === "unicast";
  } catch {
    return false;
  }
}
export function parseTarget(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TargetError();
  }
  if (
    value.length > 2048 ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new TargetError();
  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (
    !host ||
    /(^|\.)(localhost|local|internal|home|lan|test|invalid)$/.test(host) ||
    (!host.includes(".") && !ipaddr.isValid(host))
  )
    throw new TargetError("Private and local destinations cannot be tested.");
  if (ipaddr.isValid(host) && !isPublicAddress(host))
    throw new TargetError(
      "Private and reserved IP addresses cannot be tested.",
    );
  return url;
}
export async function validateTarget(
  value: string,
  resolve = lookup,
): Promise<URL> {
  const url = parseTarget(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let records;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    records = await Promise.race([
      resolve(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new TargetError("Destination DNS lookup timed out.")),
          4000,
        );
        timer.unref();
      }),
    ]);
  } catch (error) {
    if (error instanceof TargetError) throw error;
    throw new TargetError("The destination hostname could not be resolved.");
  } finally {
    clearTimeout(timer);
  }
  if (
    !records.length ||
    records.some((record) => !isPublicAddress(record.address))
  )
    throw new TargetError(
      "Private and reserved destinations cannot be tested.",
    );
  return url;
}
