"use strict";

const {
  normalizeCommandText,
  matchUiDraftCommand,
  isUiDraftCommand,
} = require("../../../utils/offerKp/uiDraftCommands");
const {
  routeOfferKpMessage,
  OFFER_KP_INTENTS,
} = require("../../../utils/offerKp/intentRouter");
const {
  looksLikeDraftEdit,
  applyDraftChatEdits,
} = require("../../../utils/offerKp/draftChatEdit");

describe("uiDraftCommands cheapest_analogs (exact UI labels)", () => {
  const shouldMatch = [
    "Дешёвые аналоги",
    "Cheapest analogs",
    "Najtańsze analogi",
  ];

  const shouldReject = [
    "подставь дешёвые аналоги",
    "давай возьмём самые дешёвые аналоги по всем позициям",
    "найди дешёвые аналоги DIN 933 М10х80",
    "подбери дешёвый аналог на болт М12",
    "какие дешёвые аналоги есть в каталоге?",
    "what are the cheapest analogs for DIN 912?",
    "сколько будет 2+2",
    "привет",
  ];

  it("does not mangle «всех» into «всеx»", () => {
    expect(normalizeCommandText("встав для всех Дешёвые аналоги")).toBe(
      "встав для всех дешевые аналоги"
    );
  });

  it.each(shouldMatch)("matches label: %s", (text) => {
    expect(matchUiDraftCommand(text)).toBe("cheapest_analogs");
    expect(isUiDraftCommand(text)).toBe(true);
    expect(looksLikeDraftEdit(text)).toBe(true);
  });

  it.each(shouldReject)("rejects non-command: %s", (text) => {
    expect(matchUiDraftCommand(text)).toBeNull();
  });

  it("routes an exact label as edit_quote", () => {
    const routed = routeOfferKpMessage("Дешёвые аналоги");
    expect(routed.primaryIntent).toBe(OFFER_KP_INTENTS.EDIT_QUOTE);
    expect(routed.policy.allowQuoteMutation).toBe(true);
  });

  it("applies an LLM-resolved command without reparsing its wording", () => {
    const linesWithAlts = [
      {
        name: "Болт М16",
        article: "OLD",
        quantity: 10,
        unitPriceNet: 40,
        alternatives: [
          {
            sku: "OLD",
            name: "Болт М16 old",
            price: 40,
            matchType: "exact",
            stockCount: 0,
          },
          {
            sku: "CHEAP",
            name: "Болт М16 cheap",
            price: 15,
            matchType: "exact",
            stockCount: 20,
          },
        ],
      },
    ];
    const result = applyDraftChatEdits({
      message: "wybierzmy ekonomiczniejsze odpowiedniki dla całego zestawienia",
      resolvedCommand: "cheapest_analogs",
      quoteDraft: {
        hardwareLines: linesWithAlts,
        preview: { lines: linesWithAlts },
      },
      vatRate: 0.2,
    });
    expect(result.ok).toBe(true);
    expect(result.quoteDraft.hardwareLines[0].article).toBe("CHEAP");
    expect(result.quoteDraft.hardwareLines[0].unitPriceNet).toBe(15);
  });

  it("does not execute an unknown LLM command", () => {
    const result = applyDraftChatEdits({
      message: "zrób coś",
      resolvedCommand: "delete_database",
      quoteDraft: {
        hardwareLines: [{ name: "Болт", quantity: 1 }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_an_edit");
  });
});
