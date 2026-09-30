# OneMinute Analyzer — regional screenshots

Capture a public URL through country-targeted DataImpulse connections, compare screenshots, inspect final URLs and exit evidence, and download JPEGs. Next.js, TypeScript, and Playwright. No website-health grades or text assertions are required.

## Setup

```bash
npm install
npm run browser:install
npm run dev
```

Configure `.env.local` from `.env.example`: `DATAIMPULSE_LOGIN` and `DATAIMPULSE_PASSWORD` are base proxy plan credentials. `CAPTURE_API_KEY` is a server-only secret of at least 32 characters; generate one with `openssl rand -hex 32`. Never use NEXT_PUBLIC for credentials. Restart after changing configuration.

Open http://127.0.0.1:3000. Choose a URL and countries (US and UK by default). Results appear side by side, with JPEG downloads and inspectable capture evidence. The most recent 20 runs are stored in this browser's IndexedDB. History is not synchronized across devices; clearing browser storage deletes it. If browser quota is exhausted, the current result remains available in memory but is not persisted.

## API

```bash
curl http://127.0.0.1:3000/api/capture \
  -H "Authorization: Bearer $CAPTURE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","country":"us"}'
```

Response: JSON with `screenshotUrl` (JPEG data URL or null), `finalUrl`, `httpStatus`, `locationId`, `locationVerification`, diagnostics, and error information. `status: pass` means a screenshot was captured, not that the website works. API responses are not automatically stored; callers own persistence. The local dashboard uses `/api/test` with same-origin restrictions. `/api/capture` always requires the key.

Both routes share a limit of two active browsers and 20 accepted captures per minute per server process. Invalid credentials and malformed inputs do not launch browsers. Responses use Cache-Control: no-store. Request JSON is limited to 4 KB. A captured error or challenge page is still a valid screenshot: inspect the image and HTTP status.

## Evidence and limits

Each fresh Chromium visit uses a unique proxy session. ipwho.is exit probes before and after the visit record country, IP, and timestamps. Consistent probes do not prove the exit IP of every resource; unavailable, changed, or mismatched probes are shown explicitly. Two additional proxy requests per capture, five seconds per probe, no retry or direct fallback. Geolocation is approximate and the free service has rate limits/no SLA.

Capture viewport: 1440 × 900, JPEG. Load wait: up to 30 seconds, followed by a 1.5-second observation window. Overall session deadline: 55 seconds. Timings exclude probes and screenshot capture; they include the proxy path and are not local-user speed benchmarks. No clicks, login, checkout, or automatic retries. Assets consume proxy bandwidth.

This is a working local application, not a deployed multi-tenant SaaS. Scripts bind to loopback. Private destinations, unsafe ports, popups, downloads and service workers are blocked. Public hosting requires hardened isolated browser workers, outbound network enforcement, durable storage and distributed limits; proxy-side DNS is outside this process's control. Do not expose it as an anonymous public browser service.

## Checks

```bash
npm run typecheck
npm run test:browser
npm run test:proxy
npm run build
```

`npm run proxy:check -- jp` and `npm run browser:check -- https://example.com jp` use paid proxy traffic. Automated tests use fixtures.
