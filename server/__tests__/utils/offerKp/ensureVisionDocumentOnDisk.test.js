"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("ensureVisionDocumentOnDisk", () => {
  let tmpDir;
  let prevStorage;
  let prevNodeEnv;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "offerkp-vision-doc-"));
    prevStorage = process.env.STORAGE_DIR;
    prevNodeEnv = process.env.NODE_ENV;
    process.env.STORAGE_DIR = tmpDir;
    process.env.NODE_ENV = "production";
    fs.mkdirSync(path.join(tmpDir, "direct-uploads"), { recursive: true });
  });

  afterEach(() => {
    if (prevStorage === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = prevStorage;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("replaces id 0 with uuid and writes pageContent to disk", () => {
    const {
      ensureDocumentId,
      ensureVisionDocumentOnDisk,
    } = require("../../../utils/offerKp/offerKpDocumentIngest");

    expect(ensureDocumentId({ id: 0 })).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    const saved = ensureVisionDocumentOnDisk(
      {
        id: 0,
        pageContent: "Болт M10x50 100 шт",
        docSource: "pdf file uploaded by the user.",
      },
      "Slozhnost_vysokaya_1 (1).pdf"
    );

    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(saved.location).toContain(saved.id);
    const full = path.join(tmpDir, "direct-uploads", saved.location);
    expect(fs.existsSync(full)).toBe(true);
    const data = JSON.parse(fs.readFileSync(full, "utf8"));
    expect(data.pageContent).toContain("Болт M10x50");
  });

  it("keeps a valid uuid id", () => {
    const { ensureDocumentId } = require("../../../utils/offerKp/offerKpDocumentIngest");
    const id = "8837935c-e4cc-4963-9a08-0159d62d71d0";
    expect(ensureDocumentId({ id })).toBe(id);
  });
});
