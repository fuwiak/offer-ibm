"use strict";

const {
  normalizeCommandText,
  matchUiDraftCommand,
  isUiDraftCommand,
} = require("../../../utils/offerKp/uiDraftCommands");
const { routeOfferKpMessage, OFFER_KP_INTENTS } = require("../../../utils/offerKp/intentRouter");
const {
  looksLikeDraftEdit,
  applyDraftChatEdits,
} = require("../../../utils/offerKp/draftChatEdit");

describe("uiDraftCommands cheapest_analogs", () => {
  const phrases = [
    "Дешёвые аналоги",
    "подставь дешёвые аналоги",
    "встав для всех Дешёвые аналоги",
    "вставь для всех дешевые аналоги",
    "вставь дешёвые аналоги для всех",
    "дешевые аналоги для всех",
    "примени дешёвые аналоги",
    "Cheapest analogs",
    "apply cheapest analogs for all",
    "Najtańsze analogi",
    "podstaw najtańsze analogi dla wszystkich",
  ];

  it("does not mangle «всех» into «всеx»", () => {
    expect(normalizeCommandText("встав для всех Дешёвые аналоги")).toBe(
      "встав для всех дешевые аналоги"
    );
  });

  it.each(phrases)("matches %s", (text) => {
    expect(matchUiDraftCommand(text)).toBe("cheapest_analogs");
    expect(isUiDraftCommand(text)).toBe(true);
    expect(looksLikeDraftEdit(text)).toBe(true);
  });

  it("routes as edit_quote, not system_help / out_of_scope", () => {
    const routed = routeOfferKpMessage("встав для всех Дешёвые аналоги");
    expect(routed.primaryIntent).toBe(OFFER_KP_INTENTS.EDIT_QUOTE);
    expect(routed.policy.allowQuoteMutation).toBe(true);
  });

  it("applies cheapest analogs for the «для всех» phrasing", () => {
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
      message: "встав для всех Дешёвые аналоги",
      quoteDraft: {
        hardwareLines: linesWithAlts,
        preview: { lines: linesWithAlts },
      },
      vatRate: 0.2,
    });
    expect(result.ok).toBe(true);
    expect(result.quoteDraft.hardwareLines[0].article).toBe("CHEAP");
    expect(result.quoteDraft.hardwareLines[0].unitPriceNet).toBe(15);
    expect(result.reply).toMatch(/Подставил дешёвые аналоги/i);
  });
});
