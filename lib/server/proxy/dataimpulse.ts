import "server-only";

import { randomUUID } from "node:crypto";
import { isCountryCode, type CountryCode } from "@/lib/countries";
import { ProxyError } from "./errors";

export type ProxyCredentials = { login: string; password: string };
/** Compatible with Playwright's browser/context proxy option. Server use only. */
export type BrowserProxy = {
  server: string;
  username: string;
  password: string;
};
export type ProxySession = {
  country: CountryCode;
  sessionId: string;
  proxy: BrowserProxy;
};

export function readProxyCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProxyCredentials {
  const login = env.DATAIMPULSE_LOGIN?.trim();
  const password = env.DATAIMPULSE_PASSWORD;
  if (!login || !password) {
    throw new ProxyError(
      "NOT_CONFIGURED",
      "Set DATAIMPULSE_LOGIN and DATAIMPULSE_PASSWORD in .env.local. Use the proxy plan credentials, not your account password or API key.",
    );
  }
  // Parameters are appended by this adapter, never accepted from configuration.
  if (
    !/^[A-Za-z0-9_.@-]+$/.test(login) ||
    login.includes("__") ||
    /[\r\n\0]/.test(password) ||
    !password.trim()
  ) {
    throw new ProxyError(
      "INVALID_CONFIG",
      "Use the base DataImpulse proxy login without targeting parameters, and a valid proxy password.",
    );
  }
  return { login, password };
}

export function createProxySession(
  country: string,
  sessionId: string = randomUUID().replaceAll("-", ""),
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProxySession {
  if (!isCountryCode(country)) {
    throw new ProxyError(
      "INVALID_COUNTRY",
      "Choose a supported lowercase country code, such as us, gb, de, or jp.",
    );
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) {
    throw new ProxyError(
      "INVALID_SESSION",
      "Proxy session IDs must contain 1–64 letters, numbers, underscores, or hyphens.",
    );
  }
  const credentials = readProxyCredentials(env);
  return {
    country,
    sessionId,
    proxy: {
      server: "http://gw.dataimpulse.com:823",
      username: `${credentials.login}__cr.${country};sessid.${sessionId}`,
      password: credentials.password,
    },
  };
}
