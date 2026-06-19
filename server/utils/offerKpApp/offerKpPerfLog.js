const PREFIX = "[BACKEND-PERF]";
const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || 500);

function offerKpPerfLog(level, message, meta = null) {
  const ts = new Date().toISOString();
  const line = meta
    ? `${PREFIX} ${ts} ${message} ${JSON.stringify(meta)}`
    : `${PREFIX} ${ts} ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function offerKpPerfTimed(label, meta = null) {
  const start = Date.now();
  return {
    done(extra = null) {
      const ms = Date.now() - start;
      const payload = { ...meta, ...extra, ms, slow: ms >= SLOW_MS };
      if (ms >= SLOW_MS) offerKpPerfLog("warn", `${label} SLOW`, payload);
      else offerKpPerfLog("info", label, payload);
      return ms;
    },
    fail(err, extra = null) {
      offerKpPerfLog("warn", `${label} failed`, {
        ...meta,
        ...extra,
        ms: Date.now() - start,
        error: err?.message || String(err),
      });
    },
  };
}

module.exports = {
  offerKpPerfLog,
  offerKpPerfTimed,
  SLOW_MS,
};
