const {
  parseCatalogBlock,
  parseQuoteMeta,
  buildMarkdownQuote,
  buildQuoteArtifactsSummary,
  buildQuoteFileOutputs,
} = require("../../../utils/offerKp/autoQuoteArtifacts");

describe("autoQuoteArtifacts", () => {
  const sampleBlock = `[Каталог · purolat.com] Штанга DIN 975 M36x2000
ID товара (shop_product.id): 42
Цена: 1250.00 RUB
Ссылка: https://purolat.com/product/test/`;

  it("parseCatalogBlock extracts price and name", () => {
    const p = parseCatalogBlock(sampleBlock);
    expect(p.name).toContain("DIN 975");
    expect(p.price).toBe(1250);
    expect(p.currency).toBe("RUB");
    expect(p.url).toContain("purolat.com");
  });

  it("parseQuoteMeta detects Poland and quantity", () => {
    const meta = parseQuoteMeta(
      "КП для BHP Sp. z o.o., Polska, 10 szt, M36x2000"
    );
    expect(meta.customer.name).toMatch(/BHP/i);
    expect(meta.customer.country).toBe("Poland");
    expect(meta.quantity).toBe(10);
    expect(meta.dimensions.lengthMm).toBe(36);
  });

  it("buildMarkdownQuote includes reference and table", () => {
    const md = buildMarkdownQuote({
      reference: "PUR-20260101-01",
      customer: { name: "Test", country: "Poland" },
      lines: [
        {
          productName: "Rod",
          quantity: 1,
          unitPrice: 10,
          lineTotal: 10,
        },
      ],
      subtotal: 10,
      shipping: 0,
      total: 10,
      currency: "PLN",
      vatRate: 0.23,
      vatAmount: 2.3,
    });
    expect(md).toContain("PUR-20260101-01");
    expect(md).toContain("Rod");
    expect(md).toContain("НДС 23%");
  });

  it("buildQuoteArtifactsSummary lists file locations", () => {
    const summary = buildQuoteArtifactsSummary({
      reference: "PUR-20260101-01",
      pdf: { filename: "KP-PUR-20260101-01.pdf" },
      docx: { filename: "KP-PUR-20260101-01.docx" },
    });
    expect(summary).toContain("PUR-20260101-01");
    expect(summary).toContain("KP-PUR-20260101-01.pdf");
    expect(summary).toContain("панели справа");
    expect(summary).not.toContain("null");
  });

  it("buildQuoteFileOutputs persists download metadata", () => {
    const outputs = buildQuoteFileOutputs({
      pdf: {
        filename: "Quotation_Customer.pdf",
        storageFilename: "quote-abc.pdf",
        fileSize: 1024,
      },
      docx: {
        filename: "KP-test.docx",
        storageFilename: "doc-abc.docx",
        fileSize: 2048,
      },
      markdown: "# KP",
    });
    expect(outputs).toHaveLength(2);
    expect(outputs[0].payload.storageFilename).toBe("doc-abc.docx");
    expect(outputs[1].payload.storageFilename).toBe("quote-abc.pdf");
  });
});
