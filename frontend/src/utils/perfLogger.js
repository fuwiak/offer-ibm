const PREFIX = "[FRONTEND-PERF]";
const SLOW_MS = Number(import.meta.env.VITE_SLOW_REQUEST_MS || 500);

export function isPerfLogEnabled() {
  if (import.meta.env.VITE_OFFER_KP_PERF_LOG === "true") return true;
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem("offerKp_perf_log") === "1";
  } catch {
    return false;
  }
}

function log(level, message, meta = null) {
  if (!isPerfLogEnabled()) return;
  const line = meta
    ? `${PREFIX} ${message} ${JSON.stringify(meta)}`
    : `${PREFIX} ${message}`;
  if (level === "warn") console.warn(line);
  else if (level === "error") console.error(line);
  else console.log(line);
}

export function perfLog(message, meta = null) {
  log("info", message, meta);
}

export function perfWarn(message, meta = null) {
  log("warn", message, meta);
}

/** @type {Map<string, number>} */
const marks = new Map();

export function perfMark(name, meta = null) {
  marks.set(name, performance.now());
  perfLog(`mark:${name}`, meta);
}

export function perfMeasure(startMark, endMark, label = null) {
  const start = marks.get(startMark);
  const end = marks.get(endMark);
  if (start == null || end == null) return null;
  const ms = Math.round(end - start);
  const name = label || `${startMark}→${endMark}`;
  const level = ms >= SLOW_MS ? "warn" : "info";
  log(level, `measure:${name}`, { ms, slow: ms >= SLOW_MS });
  return ms;
}

export function perfTimed(label, meta = null) {
  const start = performance.now();
  return {
    done(extra = null) {
      const ms = Math.round(performance.now() - start);
      const payload = { ...meta, ...extra, ms, slow: ms >= SLOW_MS };
      if (ms >= SLOW_MS) perfWarn(`done:${label}`, payload);
      else perfLog(`done:${label}`, payload);
      return ms;
    },
    fail(err, extra = null) {
      perfWarn(`fail:${label}`, {
        ...meta,
        ...extra,
        ms: Math.round(performance.now() - start),
        error: err?.message || String(err),
      });
    },
  };
}

export function installPerfLogger() {
  if (!isPerfLogEnabled()) return;
  if (window.__offerKpPerfLoggerInstalled) return;
  window.__offerKpPerfLoggerInstalled = true;

  perfLog("perf logger enabled", {
    dev: import.meta.env.DEV,
    slowMs: SLOW_MS,
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method || "GET").toUpperCase();
    const timer = perfTimed("fetch", { method, url: shortenUrl(url) });
    try {
      const res = await origFetch(input, init);
      timer.done({ status: res.status, ok: res.ok });
      return res;
    } catch (err) {
      timer.fail(err);
      throw err;
    }
  };

  window.addEventListener("load", () => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return;
    perfLog("page:navigation", {
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadMs: Math.round(nav.loadEventEnd),
      ttfbMs: Math.round(nav.responseStart - nav.requestStart),
    });
  });
}

function shortenUrl(url = "") {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + (u.search ? u.search.slice(0, 80) : "");
  } catch {
    return String(url).slice(0, 120);
  }
}
