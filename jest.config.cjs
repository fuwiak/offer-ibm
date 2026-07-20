/** @type {import('jest').Config} */
module.exports = {
  // Frontend uses Vitest (ESM). Keep Jest scoped to Node packages only.
  roots: ["<rootDir>/server", "<rootDir>/collector"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/frontend/",
  ],
};
