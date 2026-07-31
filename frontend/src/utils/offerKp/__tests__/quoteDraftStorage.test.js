import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  stripDraftForStorage,
  stripLineForStorage,
  saveQuoteDraft,
  loadQuoteDraft,
  clearQuoteDraft,
} from "../quoteDraftStorage";

function fatAlternative(i) {
  return {
    productId: `p${i}`,
    name: `Alt ${i}`,
    sku: `SKU-${i}`,
    price: 1.5 + i,
    stockCount: 10,
    matchType: "analog",
    productUrl: `https://example.com/p/${i}/` + "x".repeat(200),
    features: { diameter: "M6", length: 20, junk: "y".repeat(500) },
    _features: { vector: Array.from({ length: 50 }, (_, j) => j + i) },
    description: "z".repeat(2000),
  };
}

function fatLine(n) {
  return {
    inquiryRaw: `Винт DIN 6912 M6х20 — ${n} шт`,
    name: `Винт DIN 6912 M6x20`,
    requestedName: `Винт DIN 6912 M6х20`,
    article: `A-${n}`,
    productId: `pid-${n}`,
    quantity: n * 100,
    unit: "шт",
    unitPriceNet: 2.5,
    priceWithVat: 3,
    lineTotal: 250,
    weightKg: 0.1,
    status: "В наличии",
    kpStatus: "Точное соответствие",
    matchType: "exact",
    allowPrice: true,
    comment: "ok",
    alternatives: Array.from({ length: 40 }, (_, i) => fatAlternative(i)),
    evidence: {
      requested: "vinт",
      selected_product_id: `pid-${n}`,
      match_sources: ["structured", "name_cosine"],
      blob: "e".repeat(5000),
    },
    conformalSet: { ids: Array.from({ length: 30 }, (_, i) => `c${i}`) },
    anomaly: { score: 0.1, detail: "a".repeat(1000) },
    activeLearning: { reason: "al".repeat(500) },
    blocking: { blocks: Array.from({ length: 20 }, () => ({ k: "b".repeat(100) })) },
    selective: { gate: true, reason: "s".repeat(500) },
    similarSuggestion: {
      name: "sim",
      sku: "S",
      description: "d".repeat(3000),
    },
  };
}

describe("stripDraftForStorage", () => {
  it("drops alternatives, evidence, and enrichment blobs", () => {
    const draft = {
      reference: "KP-1",
      customer: { name: "ООО Тест", country: "RU" },
      hardwareLines: [fatLine(1), fatLine(2)],
      preview: {
        lines: [fatLine(1), fatLine(2)],
        subtotal: 500,
        total: 500,
        totalWeightKg: 0.2,
      },
      shipping: 0,
      doc: { vatRate: 0.2, createdAt: "2026-07-31", huge: "h".repeat(10000) },
    };

    const slim = stripDraftForStorage(draft);
    expect(slim.reference).toBe("KP-1");
    expect(slim.customer.name).toBe("ООО Тест");
    expect(slim.hardwareLines).toHaveLength(2);
    expect(slim.hardwareLines[0].article).toBe("A-1");
    expect(slim.hardwareLines[0].alternatives).toEqual([]);
    expect(slim.hardwareLines[0].evidence).toBeUndefined();
    expect(slim.hardwareLines[0].conformalSet).toBeUndefined();
    expect(slim.hardwareLines[0].anomaly).toBeUndefined();
    expect(slim.hardwareLines[0].similarSuggestion).toBeUndefined();
    expect(slim.preview.subtotal).toBe(500);
    expect(slim.preview.lines[0].alternatives).toEqual([]);
    expect(slim.doc.vatRate).toBe(0.2);
    expect(slim.doc.huge).toBeUndefined();

    const fatJson = JSON.stringify(draft);
    const slimJson = JSON.stringify(slim);
    expect(slimJson.length).toBeLessThan(fatJson.length / 10);
  });

  it("stripLineForStorage keeps core restore fields", () => {
    const slim = stripLineForStorage(fatLine(5));
    expect(slim.name).toContain("DIN 6912");
    expect(slim.quantity).toBe(500);
    expect(slim.unitPriceNet).toBe(2.5);
    expect(slim.matchType).toBe("exact");
    expect(slim.alternatives).toEqual([]);
  });

  it("omitPreviewLines drops duplicate preview.lines", () => {
    const slim = stripDraftForStorage(
      { hardwareLines: [fatLine(1)], preview: { lines: [fatLine(1)], subtotal: 1 } },
      { omitPreviewLines: true }
    );
    expect(slim.preview.lines).toBeUndefined();
    expect(slim.preview.subtotal).toBe(1);
    expect(slim.hardwareLines).toHaveLength(1);
  });
});

describe("saveQuoteDraft quota handling", () => {
  const ws = "offer-kp-partner";
  const thread = "test-thread-quota";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists stripped draft and reloads core fields", () => {
    const draft = {
      reference: "KP-Q",
      customer: { name: "A", country: "PL" },
      hardwareLines: [fatLine(1)],
      preview: { lines: [fatLine(1)], subtotal: 10, total: 10 },
    };
    const result = saveQuoteDraft(ws, thread, draft);
    expect(result.ok).toBe(true);

    const loaded = loadQuoteDraft(ws, thread);
    expect(loaded.reference).toBe("KP-Q");
    expect(loaded.hardwareLines[0].article).toBe("A-1");
    expect(loaded.hardwareLines[0].alternatives).toEqual([]);
  });

  it("never throws on QuotaExceededError and prunes old keys", () => {
    // Seed old drafts
    for (let i = 0; i < 4; i += 1) {
      localStorage.setItem(
        `offerKp:quote-draft:v2:${ws}:old-${i}`,
        JSON.stringify({ updatedAt: i + 1, hardwareLines: [{ name: "x" }] })
      );
    }

    const setItem = localStorage.setItem.bind(localStorage);
    let calls = 0;
    vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      calls += 1;
      if (calls === 1) {
        const err = new Error(
          "Failed to execute 'setItem' on 'Storage': Setting the value of '" +
            key +
            "' exceeded the quota."
        );
        err.name = "QuotaExceededError";
        throw err;
      }
      return setItem(key, value);
    });

    let result;
    expect(() => {
      result = saveQuoteDraft(ws, thread, {
        hardwareLines: [fatLine(1)],
        preview: { lines: [fatLine(1)], subtotal: 1 },
      });
    }).not.toThrow();
    expect(result.ok).toBe(true);
    expect(result.pruned).toBe(true);
  });

  it("clearQuoteDraft removes key", () => {
    saveQuoteDraft(ws, thread, {
      hardwareLines: [{ name: "a", quantity: 1 }],
      preview: { lines: [{ name: "a" }] },
    });
    clearQuoteDraft(ws, thread);
    const loaded = loadQuoteDraft(ws, thread);
    expect(loaded.hardwareLines?.length || 0).toBe(0);
  });
});
