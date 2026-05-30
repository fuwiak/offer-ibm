const httpLogger =
  ({ enableTimestamps = false }) =>
  (req, res, next) => {
    // Capture the original res.end to log response status
    const originalEnd = res.end;

    res.end = function (chunk, encoding) {
      const code = res.statusCode;
      const statusColor =
        code >= 500
          ? "\x1b[41m\x1b[37m"
          : code >= 400
            ? "\x1b[33m"
            : code >= 300
              ? "\x1b[36m"
              : "\x1b[32m";
      const tag =
        req.path.startsWith("/api") || req.originalUrl?.startsWith("/api")
          ? "\x1b[35m[BACKEND-API]\x1b[0m"
          : "\x1b[34m[BACKEND-SPA]\x1b[0m";
      const ts = enableTimestamps
        ? ` @ ${new Date().toISOString()}`
        : "";
      console.log(
        `${tag} ${statusColor}${code}\x1b[0m ${req.method} ${req.originalUrl || req.path}${ts}`
      );

      // Call the original end method
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };

module.exports = {
  httpLogger,
};
