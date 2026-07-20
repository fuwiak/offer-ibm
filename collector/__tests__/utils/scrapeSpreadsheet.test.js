const {
  findSpecHeader,
  scrapeSheetData,
  scrapeWorkbookSheets,
} = require("../../utils/scrapeSpreadsheet");

describe("scrapeSpreadsheet", () => {
  test("scrapes sparse BOM-style spec into designation\\tqty TSV", () => {
    const data = [
      [null, null, null, null, null, null],
      [null, null, null, null, "Спецификация 77", null],
      [null, null, null, null, "Обозначение (Артикул)", "Количество шт"],
      [
        null,
        null,
        null,
        null,
        "Амортизатор АКСС-25МХ ГОСТ РВ 9320-001-2008",
        2,
      ],
      [
        null,
        null,
        null,
        null,
        "Боковая стенка тип R 24568-151 (комплект левая и правая) ф.Schroff",
        1,
      ],
      [null, null, null, null, "Болт М12-6gx40.88.019 ГОСТ 7805-70", 4],
      [null, null, null, null, "Винт DIN 7500-Е М5х12-St", 75],
      [null, null, null, null, "Уплотнитель неопрен CR 8х2 ф. Руфом м.п.", 7.4],
    ];

    const header = findSpecHeader(data);
    expect(header).toEqual({
      rowIndex: 2,
      designationIdx: 4,
      qtyIdx: 5,
    });

    const text = scrapeSheetData(data);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Спецификация 77");
    expect(lines[1]).toBe("Обозначение (Артикул)\tКоличество шт");
    expect(lines[2]).toBe(
      "Амортизатор АКСС-25МХ ГОСТ РВ 9320-001-2008\t2"
    );
    expect(lines[3]).toContain("Боковая стенка");
    expect(lines[3].endsWith("\t1")).toBe(true);
    expect(lines[5]).toBe("Винт DIN 7500-Е М5х12-St\t75");
    expect(lines[6]).toBe("Уплотнитель неопрен CR 8х2 ф. Руфом м.п.\t7.4");
    expect(text).not.toMatch(/^,|,,/m);
  });

  test("falls back to nonempty cells when no designation/qty headers", () => {
    const data = [
      ["Name", "Size", "Notes"],
      ["Widget A", "M6", "urgent"],
      [null, null, null],
      ["Widget B", "M8", null],
    ];
    expect(scrapeSheetData(data)).toBe(
      ["Name\tSize\tNotes", "Widget A\tM6\turgent", "Widget B\tM8"].join("\n")
    );
  });

  test("scrapeWorkbookSheets labels sheets", () => {
    const text = scrapeWorkbookSheets([
      {
        name: "Лист1",
        data: [
          [null, "Обозначение (Артикул)", "Количество шт"],
          [null, "Болт М6 ГОСТ 7805-70", 8],
        ],
      },
    ]);
    expect(text.startsWith("Sheet: Лист1\n")).toBe(true);
    expect(text).toContain("Болт М6 ГОСТ 7805-70\t8");
  });

  test("returns empty string for empty sheet", () => {
    expect(scrapeSheetData([])).toBe("");
    expect(scrapeSheetData([[null, null], [undefined, ""]])).toBe("");
  });
});
