import { describe, expect, it } from "vitest";
import { attachmentDisplayName } from "../attachmentDisplayName";

describe("attachmentDisplayName", () => {
  it("prefers File.name when present", () => {
    expect(
      attachmentDisplayName({
        file: { name: "live.xlsx" },
        document: { title: "ignored.xlsx" },
      })
    ).toBe("live.xlsx");
  });

  it("falls back to document title when file is null (thread hydrate)", () => {
    expect(
      attachmentDisplayName({
        file: null,
        document: {
          id: 46,
          title: "запрос кп метизы.xlsx",
          filename: "запрос кп метизы.xlsx-bfd03afd.json",
        },
      })
    ).toBe("запрос кп метизы.xlsx");
  });

  it("does not throw when attachment/file/document are null", () => {
    expect(attachmentDisplayName(null)).toBe("file");
    expect(attachmentDisplayName({ file: null, document: null })).toBe("file");
    expect(attachmentDisplayName({})).toBe("file");
  });
});
