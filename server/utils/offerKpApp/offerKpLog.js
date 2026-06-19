const PREFIX = "[OfferKP-LLM]";

function offerKpLog(level, message, meta = null) {
  const ts = new Date().toISOString();
  const line = meta
    ? `${PREFIX} ${ts} ${message} ${JSON.stringify(meta)}`
    : `${PREFIX} ${ts} ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function offerKpLogTimed(label, meta = null) {
  const start = Date.now();
  return {
    done(extra = null) {
      offerKpLog("info", `${label} (${Date.now() - start}ms)`, {
        ...meta,
        ...extra,
      });
    },
    fail(err, extra = null) {
      offerKpLog("warn", `${label} failed (${Date.now() - start}ms)`, {
        ...meta,
        ...extra,
        error: err?.message || String(err),
      });
    },
  };
}

module.exports = { offerKpLog, offerKpLogTimed };
