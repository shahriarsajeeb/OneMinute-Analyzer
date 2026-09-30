import "server-only";

export type ProxyErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_CONFIG"
  | "INVALID_COUNTRY"
  | "INVALID_SESSION"
  | "PROXY_REJECTED"
  | "TIMEOUT"
  | "CONNECTION_FAILED"
  | "INVALID_RESPONSE";

/** Messages are controlled here. Never forward upstream errors or credentials. */
export class ProxyError extends Error {
  constructor(
    public readonly code: ProxyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}
