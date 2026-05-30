const httpLogger =
  ({ enableTimestamps = false }) =>
  (req, res, next) => {
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
      const ts = enableTimestamps
        ? ` @ ${new Date().toISOString()}`
        : "";
      console.log(
        `\x1b[35m[COLLECTOR]\x1b[0m ${statusColor}${code}\x1b[0m ${req.method} ${req.originalUrl || req.path}${ts}`
      );

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };

module.exports = {
  httpLogger,
};
