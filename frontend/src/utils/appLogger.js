/**
 * Color-tagged console output in production builds (browser devtools).
 * Railway server logs use server/utils/logger — this is for [FRONTEND] only.
 */
const PREFIX = "[FRONTEND]";

function formatArgs(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(" ");
}

function patchConsole() {
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) =>
    orig.log(`\x1b[36m${PREFIX}\x1b[0m`, formatArgs(args));
  console.info = (...args) =>
    orig.info(`\x1b[36m${PREFIX}\x1b[0m`, formatArgs(args));
  console.warn = (...args) =>
    orig.warn(`\x1b[33m${PREFIX}\x1b[0m`, formatArgs(args));
  console.error = (...args) =>
    orig.error(`\x1b[31m${PREFIX}\x1b[0m`, formatArgs(args));

  window.addEventListener("error", (event) => {
    orig.error(
      `\x1b[31m${PREFIX}\x1b[0m uncaught:`,
      event.message,
      event.filename,
      event.lineno
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    orig.error(`\x1b[31m${PREFIX}\x1b[0m unhandled rejection:`, event.reason);
  });
}

export function installAppLogger() {
  if (import.meta.env.DEV) return;
  patchConsole();
}
