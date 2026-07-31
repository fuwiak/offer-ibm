import { describe, expect, it } from "vitest";
import {
  buildContextActions,
  buildUploadStarterFollowUpTexts,
  hasQuoteDraftLines,
  pickLastQuoteFile,
  shortFilename,
} from "../contextActions";

describe("contextActions", () => {
  const t = (key, opts = {}) => {
    if (key === "home.contextActions.makeQuoteFromFile") {
      return `Сформировать КП по ${opts.filename}`;
    }
    if (key === "home.contextActions.makeQuoteFromFileCommand") {
      return `Сформировать КП по ${opts.filename}`;
    }
    if (key === "home.contextActions.showInquiryTextCommand") {
      return `Покажи текст заявки из загруженного файла ${opts.filename}`;
    }
    return key.replace("home.contextActions.", "");
  };

  it("shortens long filenames", () => {
    expect(shortFilename("short.pdf")).toBe("short.pdf");
    expect(shortFilename("very-long-inquiry-filename-here.pdf", 20)).toMatch(
      /\.pdf$/
    );
  });

  it("returns empty starters when no thread context", () => {
    const actions = buildContextActions({ t });
    expect(actions.map((a) => a.id)).toEqual(
      expect.arrayContaining([
        "uploadInquiry",
        "findByDin",
        "findBySku",
        "makeQuote",
      ])
    );
    expect(actions.every((a) => a.label)).toBe(true);
  });

  it("prefers draft and generated file actions", () => {
    const actions = buildContextActions({
      t,
      quoteDraft: {
        hardwareLines: [{ name: "bolt", quantity: 1 }],
        preview: { lines: [{ name: "bolt" }] },
      },
      threadQuoteFiles: [
        { filename: "kp.pdf", storageFilename: "kp.pdf", kind: "pdf" },
        { filename: "kp.docx", storageFilename: "kp.docx", kind: "docx" },
      ],
    });
    const ids = actions.map((a) => a.id);
    expect(ids.slice(0, 4)).toEqual([
      "openDraftTable",
      "openQuotePreview",
      "downloadDraftPdf",
      "downloadDraftDocx",
    ]);
    expect(ids).toContain("showLastPdf");
    expect(ids).toContain("showLastDocx");
    expect(ids).not.toContain("uploadInquiry");
    expect(actions.find((a) => a.id === "downloadDraftPdf").file?.filename).toBe(
      "kp.pdf"
    );
    expect(actions.find((a) => a.id === "downloadDraftDocx").file?.filename).toBe(
      "kp.docx"
    );
  });

  it("offers download chips from stored files without draft", () => {
    const actions = buildContextActions({
      t,
      threadQuoteFiles: [
        { filename: "kp.pdf", storageFilename: "kp.pdf", kind: "pdf" },
      ],
      max: 4,
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("downloadDraftPdf");
    expect(ids).not.toContain("uploadInquiry");
  });

  it("grounds upload chips in attachment filename", () => {
    const actions = buildContextActions({
      t,
      attachments: [
        {
          status: "added_context",
          document: {
            id: 12,
            filename: "zayavka.pdf",
            isPdf: true,
            hasOriginalPdf: true,
          },
        },
      ],
    });
    expect(actions.some((a) => a.id === "makeQuoteFromFile")).toBe(true);
    expect(actions.find((a) => a.id === "makeQuoteFromFile").label).toContain(
      "zayavka.pdf"
    );
    expect(actions.some((a) => a.id === "openUploadedPdf")).toBe(true);
  });

  it("detects draft lines and last quote files", () => {
    expect(hasQuoteDraftLines({ hardwareLines: [{}] })).toBe(true);
    expect(
      pickLastQuoteFile(
        [
          { filename: "a.docx", kind: "docx" },
          { filename: "b.pdf", kind: "pdf" },
        ],
        "pdf"
      )?.filename
    ).toBe("b.pdf");
  });

  it("builds upload starter texts with filename", () => {
    const texts = buildUploadStarterFollowUpTexts("rfq.pdf");
    expect(texts[0]).toContain("rfq.pdf");
  });
});
