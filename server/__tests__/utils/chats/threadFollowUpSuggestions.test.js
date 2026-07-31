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
  buildUploadStarterFollowUps,
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

  it("builds upload starter chips when parsed files are present", () => {
    const suggestions = buildUploadStarterFollowUps({
      language: "ru",
      hasParsedFiles: true,
    });
    expect(suggestions[0]).toMatch(/КП|заявк/i);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it("includes filename in upload starter chips when known", () => {
    const suggestions = buildUploadStarterFollowUps({
      language: "ru",
      hasParsedFiles: true,
      filename: "zapros_M8.pdf",
    });
    expect(suggestions[0]).toContain("zapros_M8.pdf");
  });

  it("returns no upload starters without files", () => {
    expect(
      buildUploadStarterFollowUps({ language: "ru", hasParsedFiles: false })
    ).toEqual([]);
  });

  it("builds upload starters from filename even without OCR text flag pair", () => {
    const suggestions = buildUploadStarterFollowUps({
      language: "ru",
      hasParsedFiles: true,
      filename: "very_long_inquiry_filename_for_clipping.pdf",
    });
    expect(suggestions[0]).toMatch(/Сформировать КП по/);
    expect(suggestions[0].length).toBeLessThanOrEqual(140);
    expect(suggestions[0]).toContain("…");
    expect(suggestions[0]).toContain(".pdf");
  });

  it("builds quote-output follow-ups after PDF/DOCX artifacts", () => {
    const { buildQuoteOutputFollowUps } = require("../../../utils/chats/threadFollowUpSuggestions");
    const suggestions = buildQuoteOutputFollowUps({
      language: "ru",
      quoteOutputs: [{ type: "PdfFileDownload", payload: { filename: "kp.pdf" } }],
    });
    expect(suggestions[0]).toMatch(/итог|сумм/i);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps deterministic follow-ups when strict determinism disables LLM", async () => {
    const prev = process.env.OFFER_KP_STRICT_DETERMINISM;
    process.env.OFFER_KP_STRICT_DETERMINISM = "true";
    jest.resetModules();
    try {
      const {
        generateThreadFollowUpSuggestions,
      } = require("../../../utils/chats/threadFollowUpSuggestions");
      const result = await generateThreadFollowUpSuggestions({
        workspace: { slug: "demo", chatProvider: "lmstudio", chatModel: "x" },
        prompt: "привет",
        assistantText: "Здравствуйте! Чем помочь по заявке?",
        language: "ru",
        parsedFileNames: ["zapros.pdf"],
        parsedFileTexts: ["Болт DIN 933 M8×40 — 100 шт"],
      });
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0]).toMatch(/КП|заявк|сводк/i);
    } finally {
      if (prev === undefined) delete process.env.OFFER_KP_STRICT_DETERMINISM;
      else process.env.OFFER_KP_STRICT_DETERMINISM = prev;
      jest.resetModules();
    }
  });
});
