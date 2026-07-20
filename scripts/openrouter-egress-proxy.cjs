#!/usr/bin/env node
/**
 * Tiny OpenRouter egress proxy for hosts where openrouter.ai returns
 * 403 "Access denied by security policy" (e.g. Selectel RU).
 *
 * Run on an unblocked machine (EU laptop / VPS), then either:
 *   - Point OPENROUTER_BASE_URL at this proxy, or
 *   - SSH reverse-tunnel it to the app host:
 *       ssh -N -R 127.0.0.1:8787:127.0.0.1:8787 root@87.228.90.43
 *     and set on the app host:
 *       OPENROUTER_BASE_URL=http://127.0.0.1:8787/api/v1
 */
const http = require("http");
const https = require("https");

const PORT = Number(process.env.PORT || process.env.OPENROUTER_PROXY_PORT || 8787);
const BIND = process.env.BIND || "127.0.0.1";
const UPSTREAM_HOST = process.env.OPENROUTER_UPSTREAM_HOST || "openrouter.ai";

const server = http.createServer((req, res) => {
  const headers = { ...req.headers, host: UPSTREAM_HOST };
  delete headers["content-length"];

  const upstream = https.request(
    {
      hostname: UPSTREAM_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `OpenRouter egress proxy upstream error: ${err.message}`,
        },
      })
    );
  });

  req.pipe(upstream);
});

server.listen(PORT, BIND, () => {
  console.log(
    `[openrouter-egress-proxy] listening on http://${BIND}:${PORT} → https://${UPSTREAM_HOST}`
  );
  console.log(
    `[openrouter-egress-proxy] set OPENROUTER_BASE_URL=http://${BIND}:${PORT}/api/v1`
  );
});
