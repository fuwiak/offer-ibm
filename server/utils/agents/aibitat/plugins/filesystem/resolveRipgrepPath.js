const fs = require("fs");

/** System rg (apt) when @vscode/ripgrep postinstall download is skipped in Docker. */
function resolveRipgrepPath() {
  try {
    const { rgPath } = require("@vscode/ripgrep");
    if (rgPath && fs.existsSync(rgPath)) return rgPath;
  } catch {
    // package missing or binary not downloaded
  }
  return "rg";
}

module.exports = { resolveRipgrepPath };
