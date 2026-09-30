/** Navigation timestamps all share the browser's performance time origin. */
export type NavigationSample = {
  startTime: number;
  requestStart: number;
  responseStart: number;
  domContentLoadedEventEnd: number;
  loadEventEnd: number;
};
export function navigationTimings(nav: NavigationSample | null) {
  const elapsed = (end: number | undefined, start: number | undefined) =>
    end !== undefined && start !== undefined && end > 0 && end >= start
      ? Math.round(end - start)
      : null;
  return {
    totalLoadMs: elapsed(nav?.loadEventEnd, nav?.startTime),
    // TTFB includes redirects, connection setup, and the proxied path.
    ttfbMs: elapsed(nav?.responseStart, nav?.startTime),
    responseWaitMs: elapsed(nav?.responseStart, nav?.requestStart),
    domContentLoadedMs: elapsed(nav?.domContentLoadedEventEnd, nav?.startTime),
  };
}
