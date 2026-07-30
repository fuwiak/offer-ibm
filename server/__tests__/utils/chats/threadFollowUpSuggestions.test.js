/* eslint-env jest, node */

const {
  detectFollowUpIssues,
  buildRecoveryFollowUpSuggestions,
  detectUiLanguage,
} = require("../../../utils/chats/threadFollowUpRecovery");
const {
  parseSuggestionsFromLlmText,
  mergeFollowUpSuggestions,
  extractAgentTurnForFollowUps,
  buildDraftFollowUpSuggestions,
} = require("../../../utils/chats/threadFollowUpSuggestions");

describe("threadFollowUpRecovery", () => {
  it("detects empty DOCX template after KP request", () => {
    const issues = detectFollowUpIssues({
      prompt: "сделай кп",
      assistantText:
        'Создан Word document "offer.docx" с таблицей-шаблоном для заполнения данными из каталога.',
      catalogInjected: false,
    });
    expect(issues).toEqual(
      expect.arrayContaining(["missing_catalog", "empty_template"])
    );
  });

  it("builds Polish recovery suggestions", () => {
    const suggestions = buildRecoveryFollowUpSuggestions({
      issues: ["empty_template"],
      prompt: "dodaj kп",
      language: "pl",
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toMatch(/szablon|DOCX/i);
  });

  it("detects Polish UI language", () => {
    expect(detectUiLanguage("dodaj ofertę")).toBe("pl");
  });
});

describe("threadFollowUpSuggestions", () => {
  it("parses JSON array from LLM output", () => {
    const raw =
      '["Какие аналоги есть для DIN 933 M8?","Сформировать КП по этим позициям","Проверить наличие на складе"]';
    expect(parseSuggestionsFromLlmText(raw)).toEqual([
      "Какие аналоги есть для DIN 933 M8?",
      "Сформировать КП по этим позициям",
      "Проверить наличие на складе",
    ]);
  });

  it("merges recovery suggestions ahead of LLM output", () => {
    const merged = mergeFollowUpSuggestions(
      ["Recovery one", "Recovery two"],
      ["Recovery one", "LLM extra"]
    );
    expect(merged).toEqual(["Recovery one", "Recovery two", "LLM extra"]);
  });

  it("extracts agent turn across tool/status messages", () => {
    const turn = extractAgentTurnForFollowUps([
      { from: "USER", content: "сделай кп" },
      { from: "@agent", content: 'Creating Word document "offer.docx"' },
      { from: "@agent", content: "Successfully created Word document" },
      {
        from: "workspace",
        content: "Файл содержит шаблон для заполнения из каталога.",
      },
    ]);
    expect(turn.prompt).toBe("сделай кп");
    expect(turn.assistantText).toContain("offer.docx");
    expect(turn.assistantText).toContain("шаблон");
  });

  it("builds only executable follow-ups from the current KP draft", () => {
    const suggestions = buildDraftFollowUpSuggestions({
      prompt: "Покажи текущую сводку",
      quoteDraft: {
        hardwareLines: [
          {
            quantity: 2,
            unitPriceNet: 50,
            alternatives: [{ price: 40, stockCount: 5 }],
          },
        ],
      },
    });
    expect(suggestions).toEqual([
      "Подставь самые дешёвые доступные аналоги в текущую сводку",
      "Какова общая сумма заказа по текущему списку?",
      "Покажи краткий итог текущего списка: позиции и общую сумму",
    ]);
  });

  it("does not suggest analog mutation when the draft has no usable alternatives", () => {
    const suggestions = buildDraftFollowUpSuggestions({
      prompt: "Jaka jest oferta?",
      language: "pl",
      quoteDraft: {
        hardwareLines: [{ quantity: 1, unitPriceNet: 10, alternatives: [] }],
      },
    });
    expect(suggestions).toEqual([
      "Jaka jest łączna suma bieżącej listy?",
      "Pokaż krótkie podsumowanie bieżącej listy: pozycje i sumę",
      "Ile pozycji znajduje się teraz na bieżącej liście?",
    ]);
  });
});
