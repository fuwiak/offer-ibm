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
});
