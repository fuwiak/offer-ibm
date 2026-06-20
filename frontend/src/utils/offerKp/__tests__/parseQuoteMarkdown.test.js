import { describe, it, expect } from "vitest";
import {
  parseQuoteMarkdown,
  parseQuoteReferenceFromMarkdown,
} from "../parseQuoteMarkdown";

const SAMPLE = `# Коммерческое предложение KP-2024-001

## Позиции

| № | Наименование | Артикул | Кол-во | Ед. | Цена с НДС | Сумма | Статус | Комментарий |
|---|--------------|---------|--------|-----|------------|-------|--------|-------------|
| 1 | DIN 931 M8x40 | A-123 | 100 | шт | 12.50 RUB | 1250.00 RUB | В наличии | Срочно |
| 2 | Гайка M8 | B-456 | 50 | шт | 3.00 RUB | 150.00 RUB | Аналог | |
`;

describe("parseQuoteMarkdown", () => {
  it("parses table rows with status and comment", () => {
    const lines = parseQuoteMarkdown(SAMPLE);
    expect(lines).toHaveLength(2);
    expect(lines[0].name).toBe("DIN 931 M8x40");
    expect(lines[0].article).toBe("A-123");
    expect(lines[0].quantity).toBe(100);
    expect(lines[0].priceWithVat).toBe(12.5);
    expect(lines[0].lineTotal).toBe(1250);
    expect(lines[0].status).toBe("В наличии");
    expect(lines[0].comment).toBe("Срочно");
  });

  it("extracts reference from heading", () => {
    expect(parseQuoteReferenceFromMarkdown(SAMPLE)).toBe("KP-2024-001");
  });
});
