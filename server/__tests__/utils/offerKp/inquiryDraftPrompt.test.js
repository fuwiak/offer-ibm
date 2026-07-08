const fs = require("fs");
const path = require("path");
const {
  limitCatalogBlocksForAgent,
  formatInquiryDraftSection,
  mergeInquiryDraftIntoUserPrompt,
  isInquiryPdfCatalogBlock,
} = require("../../../utils/offerKp/inquiryDraftPrompt");
const { parseInquiryText } = require("../../../utils/offerKp/parseInquiry");

const SLOZHNOST_FIXTURE = path.join(
  __dirname,
  "../../fixtures/offerKp/slozhnost-vysokaya-1-table.txt"
);

describe("inquiryDraftPrompt", () => {
  it("keeps PDF inquiry catalog blocks when limiting agent context", () => {
    const pdfBlocks = Array.from({ length: 12 }, (_, i) =>
      `[Каталог · purolat.com · PDF] Болт M${6 + (i % 3)}x${20 + i}`
    );
    const generic = [
      "[Каталог · purolat.com] Штанга DIN 975",
      "[Каталог · purolat.com] Винт DIN 912",
    ];
    const limited = limitCatalogBlocksForAgent(
      [...pdfBlocks, ...generic],
      8
    );
    expect(limited).toHaveLength(8);
    expect(limited.every(isInquiryPdfCatalogBlock)).toBe(true);
  });

  it("formats multi-line inquiry draft for agent prompt", () => {
    const draft = {
      lines: [
        {
          requestedName: "Болт M10x100 ГОСТ 7805-70",
          name: "Болт DIN 931 M10x100",
          quantity: 30,
          unit: "кг",
          unitPriceNet: 19.69,
          status: "in_stock",
        },
        {
          requestedName: "Болт M10x20 ГОСТ 7805-70",
          name: "Болт DIN 931 M10x20",
          quantity: 14,
          unit: "кг",
          unitPriceNet: 12.5,
          status: "in_stock",
        },
      ],
    };
    const section = formatInquiryDraftSection(draft);
    expect(section).toContain("ЧЕРНОВИК КП ПО ЗАЯВКЕ");
    expect(section).toContain("Строк в заявке: 2");
    expect(section).toContain("M10x100");
    expect(section).toContain("30 кг");
    expect(section).toContain("14 кг");
  });

  it("parseInquiry yields 20 lines from Slozhnost fixture for multi-position KP", () => {
    const text = fs.readFileSync(SLOZHNOST_FIXTURE, "utf8");
    const lines = parseInquiryText(text);
    expect(lines).toHaveLength(20);
    expect(lines[0].thread).toEqual({ size: "10", length: "100" });
    expect(lines[0].quantity).toBe(30);
    expect(lines[0].unit).toBe("кг");
  });
});
