/* eslint-env jest, node */

const {
  analyzeQuoteSourceDocuments,
  buildSourceOnlyQuoteMarkdown,
  verifySourceDeclaration,
} = require("../../../utils/offerKp/quoteSourceVerification");

function sourceText(count = 20) {
  const rows = Array.from(
    { length: count },
    (_, index) =>
      `${index + 1}\tБолт ГОСТ 7805-70 М${index + 6}х${index + 20} с гайкой\tкг\t${index + 1}`
  );
  return [
    "Заявка на поставку болтов",
    "Период потребности: первое полугодие 2026 года",
    "№\tНаименование товара\tЕд. изм.\tКоличество",
    ...rows,
  ].join("\n");
}

function declarationFrom(analysis) {
  return {
    source_verified: true,
    items_expected: analysis.itemCount,
    items_extracted: analysis.itemCount,
    prices_present: analysis.pricesPresent,
    ready_to_generate: true,
    items: analysis.items.map(({ number, name, unit, quantity }) => ({
      number,
      name,
      unit,
      quantity,
    })),
  };
}

describe("quote source verification", () => {
  it("extracts all 20 kg rows without inventing prices", () => {
    const analysis = analyzeQuoteSourceDocuments([
      { title: "request.pdf-1", pageContent: sourceText() },
    ]);

    expect(analysis).toMatchObject({
      sourceAvailable: true,
      sourceVerified: true,
      pageCount: 1,
      documentType: "PDF",
      itemCount: 20,
      units: ["кг"],
      pricesPresent: false,
      period: "первое полугодие 2026 года",
    });
    expect(analysis.items[0]).toMatchObject({
      number: 1,
      name: "Болт ГОСТ 7805-70 М6х20 с гайкой",
      unit: "кг",
      quantity: 1,
    });
  });

  it("rejects a declaration that changes kg to pieces", () => {
    const analysis = analyzeQuoteSourceDocuments([
      { title: "request.pdf-1", pageContent: sourceText() },
    ]);
    const declaration = declarationFrom(analysis);
    declaration.items[4].unit = "шт";

    const result = verifySourceDeclaration(declaration, analysis);
    expect(result.ok).toBe(false);
    expect(result.verification.ready_to_generate).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Единица измерения/i);
  });

  it("builds a source-only quote with placeholders and every row", () => {
    const analysis = analyzeQuoteSourceDocuments([
      { title: "request.pdf-1", pageContent: sourceText() },
    ]);
    const content = buildSourceOnlyQuoteMarkdown(analysis);

    expect(content).toContain("Поставщик:** [Указать поставщика]");
    expect(content).toContain("Заказчик:** [Указать заказчика]");
    expect(content).toContain("Дата:** [Указать дату]");
    expect(content).toContain(
      "Для расчёта стоимости необходимо получить цены поставщика"
    );
    expect(
      content.split("\n").filter((line) => /^\|\s*\d+\s*\|/.test(line))
    ).toHaveLength(20);
    expect(content.match(/\| кг \|/g)).toHaveLength(20);
    expect(content).not.toMatch(/purolat\.com|OfferKP/i);
  });
});
