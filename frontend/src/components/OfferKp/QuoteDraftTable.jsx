import { useCallback, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash,
  MagnifyingGlass,
  FilePdf,
  FileXls,
  FileDoc,
  CircleNotch,
  Brain,
  TrendDown,
  ArrowCounterClockwise,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import OfferKp from "@/models/offerKp";
import { downloadBlob } from "@/utils/downloadBlob";
import { AUTH_TOKEN } from "@/utils/constants";
import { OFFER_KP_QUOTE_STATUSES } from "@/utils/offerKp/quoteFlow";
import { buildQuoteMarkdown } from "@/utils/offerKp/buildQuoteMarkdown";
import { localeForCountry } from "@/utils/offerKp/quoteBrand";
import {
  lineGrossTotal,
  lineUnitGross,
  recalcLineGross,
} from "@/utils/offerKp/quoteLineTotals";
import {
  altNetPrice,
  isInStockAlternative,
  resolveCheapestAnalogsForLines,
  explainCheapestAnalogsEmpty,
  sortAlternativesByName,
} from "@/utils/offerKp/pickCheapestAnalog";
import { resolveProductUrl } from "@/utils/offerKp/resolveProductUrl";
import showToast from "@/utils/toast";

const EMPTY_LINE = {
  name: "",
  article: "",
  quantity: 1,
  unit: "шт",
  priceWithVat: 0,
  unitPriceNet: 0,
  lineTotal: 0,
  weightKg: 0,
  status: "Требует проверки",
  comment: "",
  custom: {},
  alternatives: [],
};

function newCustomColumnId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function statusClass(status) {
  if (status === "В наличии") return "offerKp-status--ok";
  if (status === "Аналог") return "offerKp-status--analog";
  if (status === "Под заказ") return "offerKp-status--order";
  if (status === "Нет в наличии") return "offerKp-status--none";
  return "offerKp-status--review";
}

const COMMON_UNITS = ["шт", "кг", "м", "компл", "уп"];

function recalcLine(line, vatRate, { preserveLineTotal = false } = {}) {
  const next = recalcLineGross(line, vatRate, { preserveLineTotal });
  const qty = Number(next.quantity) || 0;
  if (line.unit === "кг") {
    next.lineWeightKg = qty;
  } else if (
    line.lineWeightKg != null &&
    Number.isFinite(Number(line.lineWeightKg)) &&
    line._weightEdited
  ) {
    next.lineWeightKg = Number(Number(line.lineWeightKg).toFixed(4));
    next.weightKg =
      qty > 0
        ? Number((Number(line.lineWeightKg) / qty).toFixed(4))
        : Number(line.weightKg) || 0;
  } else {
    const unitWeight = Number(line.weightKg) || 0;
    next.weightKg = unitWeight;
    next.lineWeightKg = Number((unitWeight * qty).toFixed(4));
  }
  delete next._weightEdited;
  return next;
}

function lineNeedsReview(line = {}) {
  const status = `${line.status || ""} ${line.kpStatus || ""}`;
  return Boolean(
    line.unitNeedsRecalc ||
      /требует|требуется|needs review/i.test(status) ||
      ["none", "size_mismatch", "spec_mismatch"].includes(line.matchType)
  );
}

function lineTotalWeight(line = {}) {
  if (line.lineWeightKg != null && Number.isFinite(Number(line.lineWeightKg))) {
    return Number(line.lineWeightKg);
  }
  if (line.unit === "кг") return Number(line.quantity) || 0;
  return (Number(line.weightKg) || 0) * (Number(line.quantity) || 1);
}

export default function QuoteDraftTable() {
  const { t } = useTranslation("offerKp");
  const {
    quoteDraft,
    setQuoteDraft,
    activeThreadSlug,
    setDocumentPanelView,
    setQuotePdfUrl,
    setDocPreview,
  } = useOfferKp();
  const [busy, setBusy] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [recognizedOnly, setRecognizedOnly] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [columnPromptOpen, setColumnPromptOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  /** Snapshot before last «Дешёвые аналоги» — one-step undo. */
  const [cheapestAnalogsUndo, setCheapestAnalogsUndo] = useState(null);

  const lines = (
    quoteDraft?.hardwareLines ||
    quoteDraft?.preview?.lines ||
    []
  ).filter((line) => line && typeof line === "object");
  const customColumns = quoteDraft?.customColumns || [];
  const { vatRate, currency } = localeForCountry(quoteDraft?.customer?.country);
  const reviewCount = useMemo(
    () => lines.filter(lineNeedsReview).length,
    [lines]
  );
  const recognizedLines = useMemo(
    () => lines.filter((line) => !lineNeedsReview(line)),
    [lines]
  );
  // Stable string — `lines` is a new array every render, so keying the
  // confirm-reset effect on it uncheckd the box right after each click.
  const reviewSignature = useMemo(
    () =>
      lines
        .map((line, i) => (lineNeedsReview(line) ? i : null))
        .filter((i) => i != null)
        .join(","),
    [lines]
  );

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) => sum + lineGrossTotal(line),
      0
    );
    const totalWeightKg = lines.reduce(
      (sum, line) => sum + lineTotalWeight(line),
      0
    );
    return { subtotal, totalWeightKg, grossTotal: subtotal };
  }, [lines]);

  useEffect(() => {
    setReviewConfirmed(false);
  }, [reviewSignature, quoteDraft?.reference]);

  useEffect(() => {
    setCheapestAnalogsUndo(null);
  }, [quoteDraft?.reference]);

  useEffect(() => {
    if (!lines.length) return;
    const markdown = buildQuoteMarkdown({
      reference: quoteDraft?.reference || "DRAFT",
      customer: quoteDraft?.customer || {},
      lines,
      subtotal: totals.subtotal,
      total: totals.subtotal,
      shipping: quoteDraft?.shipping || 0,
      currency,
    });
    setDocPreview((prev) => ({
      filename:
        prev?.filename ||
        quoteDraft?.sourceFilename ||
        `KP-${quoteDraft?.reference || "DRAFT"}.docx`,
      storageFilename: prev?.storageFilename,
      markdown,
    }));
  }, [
    lines,
    totals.subtotal,
    quoteDraft?.reference,
    quoteDraft?.customer,
    quoteDraft?.shipping,
    quoteDraft?.sourceFilename,
    vatRate,
    currency,
    setDocPreview,
  ]);

  const updateLine = useCallback(
    (index, patch, recalcOpts) => {
      setQuoteDraft((prev) => {
        const current = prev.hardwareLines || prev.preview?.lines || [];
        const next = current.map((l, i) =>
          i === index ? recalcLine({ ...l, ...patch }, vatRate, recalcOpts) : l
        );
        const subtotal = next.reduce(
          (sum, line) => sum + lineGrossTotal(line),
          0
        );
        const totalWeightKg = next.reduce(
          (sum, line) => sum + lineTotalWeight(line),
          0
        );
        return {
          ...prev,
          hardwareLines: next,
          preview: {
            ...(prev.preview || {}),
            lines: next,
            subtotal,
            totalWeightKg,
            total: subtotal,
          },
        };
      });
    },
    [setQuoteDraft, vatRate]
  );

  const logCorrection = useCallback(
    async (index, field, oldValue, newValue, line) => {
      try {
        await OfferKp.logCorrections([
          {
            threadSlug: activeThreadSlug,
            quoteReference: quoteDraft?.reference,
            lineIndex: index,
            field,
            oldValue: String(oldValue ?? ""),
            newValue: String(newValue ?? ""),
            aiSuggestion: String(oldValue ?? ""),
            inquiryRaw: line?.inquiryRaw || line?.requestedName || "",
            productId: line?.productId || null,
            matchType: line?.matchType || null,
            reviewReason: line?.reviewReason || line?.mismatchReason || null,
          },
        ]);
      } catch {
        /* non-blocking */
      }
    },
    [activeThreadSlug, quoteDraft?.reference]
  );

  const handleFieldChange = (index, field, value, line, opts = {}) => {
    const old =
      field === "lineTotalGross"
        ? lineGrossTotal(line)
        : field === "lineWeightKg"
          ? lineTotalWeight(line)
          : field.startsWith("custom:")
            ? (line.custom?.[field.slice(7)] ?? "")
            : line[field];
    if (field === "lineTotalGross") {
      const qty = Number(line.quantity) || 0;
      const gross = Number(value) || 0;
      const priceWithVat = qty > 0 ? Number((gross / qty).toFixed(2)) : 0;
      const lineTotal = Number(gross.toFixed(2));
      setQuoteDraft((prev) => {
        const current = prev.hardwareLines || prev.preview?.lines || [];
        const next = current.map((l, i) =>
          i === index
            ? recalcLine({ ...l, priceWithVat, lineTotal }, vatRate, {
                preserveLineTotal: true,
              })
            : l
        );
        const subtotal = next.reduce(
          (sum, row) => sum + lineGrossTotal(row),
          0
        );
        const totalWeightKg = next.reduce(
          (sum, row) => sum + lineTotalWeight(row),
          0
        );
        return {
          ...prev,
          hardwareLines: next,
          preview: {
            ...(prev.preview || {}),
            lines: next,
            subtotal,
            totalWeightKg,
            total: subtotal,
          },
        };
      });
    } else if (field === "lineWeightKg") {
      updateLine(index, {
        lineWeightKg: Number(value) || 0,
        _weightEdited: true,
      });
    } else if (field.startsWith("custom:")) {
      const columnId = field.slice(7);
      updateLine(
        index,
        {
          custom: {
            ...(line.custom || {}),
            [columnId]: value,
          },
        },
        opts
      );
    } else if (field === "article") {
      const prevSku = String(line.article || line.sku || "").trim();
      const nextSku = String(value ?? "").trim();
      const patch = { article: value, sku: value };
      if (prevSku !== nextSku) {
        patch.productUrl = undefined;
        patch.url = undefined;
      }
      updateLine(index, patch, opts);
    } else {
      updateLine(index, { [field]: value }, opts);
    }
    if (String(old) !== String(value)) {
      logCorrection(
        index,
        field === "lineTotalGross" ? "lineTotal" : field,
        old,
        value,
        line
      );
    }
  };

  const addCustomColumn = () => {
    const label = newColumnLabel.trim();
    if (!label) return;
    const id = newCustomColumnId();
    setQuoteDraft((prev) => ({
      ...prev,
      customColumns: [...(prev.customColumns || []), { id, label }],
    }));
    setNewColumnLabel("");
    setColumnPromptOpen(false);
  };

  const removeCustomColumn = (columnId) => {
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const nextLines = current.map((line) => {
        if (!line.custom || !(columnId in line.custom)) return line;
        const custom = { ...line.custom };
        delete custom[columnId];
        return { ...line, custom };
      });
      return {
        ...prev,
        customColumns: (prev.customColumns || []).filter(
          (col) => col.id !== columnId
        ),
        hardwareLines: nextLines,
        preview: {
          ...(prev.preview || {}),
          lines: nextLines,
        },
      };
    });
  };

  const removeLine = (index) => {
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = current.filter((_, i) => i !== index);
      return {
        ...prev,
        hardwareLines: next,
        preview: { ...prev.preview, lines: next },
      };
    });
  };

  const addLine = () => {
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = [...current, { ...EMPTY_LINE }];
      return {
        ...prev,
        hardwareLines: next,
        preview: { ...prev.preview, lines: next },
      };
    });
  };

  const setCustomerField = (field, value) => {
    setQuoteDraft((prev) => ({
      ...prev,
      customer: {
        ...(prev.customer || {}),
        [field]: value,
      },
    }));
  };

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const data = await OfferKp.searchProducts(searchQuery.trim());
      setSearchResults(data.products || []);
    } catch (e) {
      console.error(e);
      showToast(
        t("quote.searchError", {
          defaultValue: "Could not search products. Please try again.",
        }),
        "error"
      );
    } finally {
      setSearchLoading(false);
    }
  }

  function addFromSearch(product) {
    const priceWithVat = Number(product.price) || 0;
    const line = recalcLine(
      {
        ...EMPTY_LINE,
        name: product.name,
        article: product.matched_sku || product.sku || "",
        productId: String(product.id),
        productUrl:
          product.productUrl || product.url || product.product_url || undefined,
        priceWithVat,
        status: "Требует проверки",
      },
      vatRate
    );
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = [...current, line];
      return {
        ...prev,
        hardwareLines: next,
        preview: { ...prev.preview, lines: next },
      };
    });
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  function buildTeachPayload(line, index) {
    const sku = String(line.article || line.sku || "").trim();
    const sourceName = String(
      line.inquiryRaw ||
        line.requestedName ||
        line.name ||
        line.productName ||
        ""
    ).trim();
    if (!sourceName) return null;
    const status = String(line.status || "");
    let matchType = line.matchType;
    if (!matchType || !["exact", "analog", "none"].includes(matchType)) {
      if (/аналог|analog/i.test(status)) matchType = "analog";
      else if (!sku) matchType = "none";
      else matchType = "exact";
    }
    if (!sku && matchType !== "none") return null;
    return {
      sourceName,
      inquiryRaw: line.inquiryRaw || sourceName,
      sku,
      article: sku,
      matchedName: line.name || line.productName || null,
      name: line.name || line.productName || null,
      matchType,
      status,
      productId: line.productId || null,
      lineIndex: index,
      threadSlug: activeThreadSlug,
      quoteReference: quoteDraft?.reference || null,
    };
  }

  async function teachLines(indices = null) {
    if (teaching) return;
    const targets =
      indices == null
        ? lines.map((line, i) => ({ line, i }))
        : indices.map((i) => ({ line: lines[i], i }));
    const examples = targets
      .map(({ line, i }) => buildTeachPayload(line, i))
      .filter(Boolean);
    if (!examples.length) {
      showToast(
        t("draftTable.teachEmpty", {
          defaultValue:
            "Нет строк для обучения: нужны текст заявки и артикул (SKU).",
        }),
        "warning"
      );
      return;
    }
    setTeaching(true);
    try {
      const result = await OfferKp.teachExamples(examples, {
        threadSlug: activeThreadSlug,
      });
      if (!result?.success && !result?.taught) {
        throw new Error(result?.error || "teach failed");
      }
      showToast(
        t("draftTable.teachSuccess", {
          count: result.taught,
          total: result.total ?? result.stats?.total,
          defaultValue:
            "В обучение: {{count}}. Память matching: {{total}} примеров.",
        }),
        "success"
      );
    } catch (e) {
      console.error("[QuoteDraftTable] teach:", e);
      showToast(
        t("draftTable.teachError", {
          defaultValue: "Не удалось сохранить пример для обучения.",
        }),
        "error"
      );
    } finally {
      setTeaching(false);
    }
  }

  function altPatch(alt, live = null) {
    if (!alt || typeof alt !== "object") return {};
    const catalogPrice =
      (live && Number(live.unitPriceNet) > 0
        ? Number(live.unitPriceNet)
        : altNetPrice(alt)) || 0;
    const inStock =
      live && live.stockCount != null
        ? Number(live.stockCount) > 0
        : isInStockAlternative(alt);
    const status =
      alt.status ||
      (inStock
        ? "В наличии"
        : alt.matchType === "analog"
          ? "Аналог"
          : "Аналог");
    const weightFromLive =
      live && live.weightKg != null && Number.isFinite(Number(live.weightKg))
        ? Number(live.weightKg)
        : null;
    const weightFromAlt =
      alt.weightKg != null && Number.isFinite(Number(alt.weightKg))
        ? Number(alt.weightKg)
        : null;
    // Never invent weight — only ShopDB (live hydrate or alt payload).
    const weightKg = weightFromLive ?? weightFromAlt ?? 0;
    return {
      name: live?.name || alt.name || "",
      article: live?.sku || alt.sku,
      sku: live?.sku || alt.sku,
      productId: live?.productId || alt.productId || undefined,
      productUrl: alt.productUrl || alt.url || undefined,
      matchType: alt.matchType || "analog",
      // Цена из каталога уже с НДС.
      priceWithVat: Number(catalogPrice.toFixed(2)),
      weightKg,
      status: live && Number(live.stockCount) > 0 ? "В наличии" : status,
      kpStatus:
        alt.matchType === "exact" && inStock
          ? "Точное соответствие"
          : "Предложен аналог",
      analogOf: alt.analogOf,
      stockCount:
        live?.stockCount != null
          ? Number(live.stockCount) || 0
          : Number(alt.stockCount) || 0,
      allowPrice: catalogPrice > 0,
    };
  }

  async function selectAlternative(lineIndex, alt) {
    if (!alt || typeof alt !== "object") return;
    let live = null;
    const needsHydrate =
      altNetPrice(alt) <= 0 ||
      alt.weightKg == null ||
      !Number.isFinite(Number(alt.weightKg));
    if (needsHydrate && (alt.sku || alt.productId)) {
      try {
        live = await OfferKp.hydrateProductCommercial({
          sku: alt.sku,
          productId: alt.productId,
        });
      } catch (e) {
        console.warn("[QuoteDraftTable] commercial hydrate failed:", e);
      }
    }
    // Single update — avoid dual setState race that dropped price/weight.
    updateLine(lineIndex, altPatch(alt, live));
  }

  async function applyCheapestAnalogs() {
    const picks = resolveCheapestAnalogsForLines(lines);
    if (!picks.length) {
      const reason = explainCheapestAnalogsEmpty(lines);
      const toastKey = {
        out_of_stock: "draftTable.cheapestAnalogsEmptyOutOfStock",
        already_best: "draftTable.cheapestAnalogsEmptyAlreadyBest",
        no_menu: "draftTable.cheapestAnalogsEmptyNoMenu",
        no_priced_stock: "draftTable.cheapestAnalogsEmptyNoPricedStock",
        empty: "draftTable.cheapestAnalogsEmpty",
      }[reason];
      const defaults = {
        out_of_stock:
          "Все позиции без наличия на складе — подставить дешёвый аналог нечего.",
        already_best: "Уже выбран лучший вариант из наличия с ценой.",
        no_menu:
          "У позиций нет меню «Аналоги» (≥2 варианта) после сопоставления.",
        no_priced_stock:
          "В меню «Аналоги» нет вариантов одновременно в наличии и с ценой из каталога.",
        empty: "Нет строк для подстановки аналогов.",
      };
      showToast(
        t(toastKey || "draftTable.cheapestAnalogsEmpty", {
          defaultValue: defaults[reason] || defaults.no_priced_stock,
        }),
        "info"
      );
      return;
    }

    const hydratedPicks = await Promise.all(
      picks.map(async (p) => {
        const alt = p.alt;
        if (
          altNetPrice(alt) > 0 &&
          alt.weightKg != null &&
          Number.isFinite(Number(alt.weightKg))
        ) {
          return { ...p, live: null };
        }
        try {
          const live = await OfferKp.hydrateProductCommercial({
            sku: alt.sku,
            productId: alt.productId,
          });
          return { ...p, live };
        } catch {
          return { ...p, live: null };
        }
      })
    );

    const byIndex = new Map(
      hydratedPicks.map((p) => [p.index, { alt: p.alt, live: p.live }])
    );
    const snapshotLines = lines.map((line) => ({ ...line }));
    setCheapestAnalogsUndo({
      hardwareLines: snapshotLines,
      previewLines: snapshotLines,
      subtotal: quoteDraft?.preview?.subtotal,
      totalWeightKg: quoteDraft?.preview?.totalWeightKg,
      total: quoteDraft?.preview?.total,
    });
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = current.map((line, i) => {
        const pick = byIndex.get(i);
        if (!pick) return line;
        return recalcLine(
          { ...line, ...altPatch(pick.alt, pick.live) },
          vatRate
        );
      });
      const subtotal = next.reduce(
        (sum, line) => sum + lineGrossTotal(line),
        0
      );
      const totalWeightKg = next.reduce(
        (sum, line) => sum + lineTotalWeight(line),
        0
      );
      return {
        ...prev,
        hardwareLines: next,
        preview: {
          ...(prev.preview || {}),
          lines: next,
          subtotal,
          totalWeightKg,
          total: subtotal,
        },
      };
    });

    showToast(
      t("draftTable.cheapestAnalogsSuccess", {
        count: picks.length,
        defaultValue: "Подставлено из наличия с ценой: {{count}}",
      }),
      "success"
    );
  }

  function undoCheapestAnalogs() {
    if (!cheapestAnalogsUndo) return;
    const snap = cheapestAnalogsUndo;
    setQuoteDraft((prev) => {
      const restored = snap.hardwareLines || [];
      return {
        ...prev,
        hardwareLines: restored,
        preview: {
          ...(prev.preview || {}),
          lines: snap.previewLines || restored,
          subtotal: snap.subtotal ?? prev.preview?.subtotal,
          totalWeightKg: snap.totalWeightKg ?? prev.preview?.totalWeightKg,
          total: snap.total ?? prev.preview?.total,
        },
      };
    });
    setCheapestAnalogsUndo(null);
    showToast(
      t("draftTable.cheapestAnalogsUndoSuccess", {
        defaultValue: "Отменено: восстановлены позиции до «Дешёвые аналоги».",
      }),
      "info"
    );
  }

  async function exportFile(kind) {
    const useRecognizedOnly = recognizedOnly && reviewCount > 0;
    if (busy) return;
    if (!useRecognizedOnly && reviewCount > 0 && !reviewConfirmed) return;
    const exportLines = useRecognizedOnly ? recognizedLines : lines;
    if (!exportLines.length) return;
    const exportSubtotal = useRecognizedOnly
      ? exportLines.reduce((sum, line) => sum + lineGrossTotal(line), 0)
      : totals.subtotal;
    setBusy(kind);
    try {
      const payload = {
        reference: quoteDraft?.reference || "DRAFT",
        customer: quoteDraft?.customer || {},
        lines: exportLines,
        subtotal: exportSubtotal,
        total: exportSubtotal,
        shipping: quoteDraft?.shipping || 0,
        vatRate,
        currency,
        reviewConfirmed: useRecognizedOnly ? true : reviewConfirmed,
        createdAt: quoteDraft?.doc?.createdAt
          ? new Date(quoteDraft.doc.createdAt)
          : new Date(),
        doc: quoteDraft?.doc,
      };
      let result;
      let url;
      if (kind === "pdf") {
        result = await OfferKp.generateQuotePdf(payload);
        url = OfferKp.quotePdfDownloadUrl(result.storageFilename);
      } else if (kind === "xlsx") {
        result = await OfferKp.generateQuoteXlsx(payload);
        url = OfferKp.quoteXlsxDownloadUrl(result.storageFilename);
      } else {
        result = await OfferKp.generateQuoteDocx(payload);
        url = OfferKp.quoteDocxDownloadUrl(result.storageFilename);
        const markdown = buildQuoteMarkdown({
          reference: payload.reference,
          customer: payload.customer,
          lines: exportLines,
          subtotal: exportSubtotal,
          total: exportSubtotal,
          shipping: payload.shipping,
          vatRate,
          currency,
        });
        setDocPreview({
          filename: result.filename,
          storageFilename: result.storageFilename,
          markdown,
        });
      }
      const token = window.localStorage.getItem(AUTH_TOKEN) || "";
      const res = await fetch(url, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      await downloadBlob(blob, result.filename);
      if (kind === "pdf") {
        const blobUrl = URL.createObjectURL(blob);
        setQuotePdfUrl({
          url: blobUrl,
          filename: result.filename,
        });
        setDocumentPanelView("pdf");
      }
    } catch (e) {
      console.error("[QuoteDraftTable]", e);
      showToast(
        t("quote.downloadError", {
          defaultValue: "Could not download the document. Please try again.",
        }),
        "error"
      );
    } finally {
      setBusy(null);
    }
  }

  const exportReady = recognizedOnly
    ? recognizedLines.length > 0
    : reviewCount === 0 || reviewConfirmed;

  if (!lines.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-theme-text-secondary">
        {t("layout.draftTableEmpty", {
          defaultValue:
            "Отправьте заявку в чат — система сформирует черновик КП с позициями и статусами.",
        })}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-theme-sidebar-border">
        <div className="min-w-0">
          <span className="text-xs font-medium text-theme-text-primary truncate block">
            {t("layout.tabCrossSection")} · {quoteDraft?.reference || "DRAFT"}
          </span>
          <span className="text-[10px] text-theme-text-secondary">
            {t("draftTable.manualHint", {
              defaultValue:
                "Редактируйте любое поле: позиция, артикул, кол-во, ед., цена, сумма, вес, статус, комментарий. Можно добавить свои колонки.",
            })}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => teachLines()}
            disabled={teaching}
            title={t("draftTable.teachAllTitle", {
              defaultValue:
                "Сохранить подтверждённые позиции в память matching (override + embeddings / few-shot)",
            })}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover disabled:opacity-60"
          >
            {teaching ? (
              <CircleNotch size={13} className="animate-spin" />
            ) : (
              <Brain size={13} weight="fill" />
            )}
            {t("draftTable.teachAll", { defaultValue: "В обучение" })}
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
          >
            <MagnifyingGlass size={13} />
            {t("draftTable.addFromDb", { defaultValue: "Из базы" })}
          </button>
          <button
            type="button"
            onClick={applyCheapestAnalogs}
            title={t("draftTable.cheapestAnalogsTitle", {
              defaultValue:
                "Подставить по каждой строке самый дешёвый вариант из меню «Аналоги» с ценой и наличием на складе",
            })}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
          >
            <TrendDown size={13} weight="bold" />
            {t("draftTable.cheapestAnalogs", {
              defaultValue: "Дешёвые аналоги",
            })}
          </button>
          {cheapestAnalogsUndo && (
            <button
              type="button"
              onClick={undoCheapestAnalogs}
              title={t("draftTable.cheapestAnalogsUndoTitle", {
                defaultValue:
                  "Отменить последнюю подстановку «Дешёвые аналоги»",
              })}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-theme-sidebar-item-hover"
            >
              <ArrowCounterClockwise size={13} weight="bold" />
              {t("draftTable.cheapestAnalogsUndo", {
                defaultValue: "Отменить",
              })}
            </button>
          )}
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
          >
            <Plus size={13} />
            {t("quote.addLine")}
          </button>
          <button
            type="button"
            onClick={() => setColumnPromptOpen((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
            title={t("draftTable.addColumnTitle", {
              defaultValue: "Добавить свою колонку в таблицу",
            })}
          >
            <Plus size={13} />
            {t("draftTable.addColumn", { defaultValue: "Колонка" })}
          </button>
        </div>
      </div>

      {columnPromptOpen && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-sidebar-border bg-theme-bg-secondary">
          <input
            type="text"
            autoFocus
            value={newColumnLabel}
            onChange={(e) => setNewColumnLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustomColumn();
              if (e.key === "Escape") {
                setColumnPromptOpen(false);
                setNewColumnLabel("");
              }
            }}
            placeholder={t("draftTable.columnNamePlaceholder", {
              defaultValue: "Название колонки",
            })}
            className="flex-1 text-xs px-2 py-1.5 rounded border border-theme-sidebar-border bg-theme-bg-chat-input"
          />
          <button
            type="button"
            onClick={addCustomColumn}
            disabled={!newColumnLabel.trim()}
            className="px-2 py-1 rounded bg-primary-button text-white text-xs disabled:opacity-50"
          >
            {t("draftTable.addColumnConfirm", { defaultValue: "Добавить" })}
          </button>
        </div>
      )}

      <div className="offerKp-draft-customer px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary">
        <div className="offerKp-draft-customer__label">
          {t("quote.buyer", { defaultValue: "ПОКУПАТЕЛЬ" })}
        </div>
        <div className="offerKp-draft-customer__fields">
          <label className="offerKp-draft-customer__field min-w-0 flex-1">
            <span className="sr-only">
              {t("quote.customerName", {
                defaultValue: "Название покупателя",
              })}
            </span>
            <input
              type="text"
              value={quoteDraft?.customer?.name || ""}
              onChange={(e) => setCustomerField("name", e.target.value)}
              placeholder={t("quote.customerNamePlaceholder", {
                defaultValue: "Название компании или ФИО",
              })}
              className="offerKp-draft-customer__input"
            />
          </label>
          <label className="offerKp-draft-customer__field w-[9rem] shrink-0">
            <span className="sr-only">
              {t("quote.customerCountry", {
                defaultValue: "Страна доставки",
              })}
            </span>
            <input
              type="text"
              value={quoteDraft?.customer?.country || ""}
              onChange={(e) => setCustomerField("country", e.target.value)}
              placeholder={t("quote.customerCountryPlaceholder", {
                defaultValue: "Страна",
              })}
              className="offerKp-draft-customer__input"
            />
          </label>
        </div>
      </div>

      {searchOpen && (
        <div className="px-3 py-2 border-b border-theme-sidebar-border shrink-0 bg-theme-bg-secondary">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder={t("draftTable.searchPlaceholder", {
                defaultValue: "DIN 931 M8x40…",
              })}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-theme-sidebar-border bg-theme-bg-chat-input"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searchLoading}
              className="px-2 py-1 rounded bg-primary-button text-white text-xs"
            >
              {searchLoading ? "…" : "OK"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs">
              {searchResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addFromSearch(p)}
                    className="w-full text-left px-2 py-1 hover:bg-theme-sidebar-item-hover rounded truncate"
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        <table className="offerKp-draft-table w-full text-xs">
          <thead>
            <tr>
              <th>№</th>
              <th>{t("draftTable.name", { defaultValue: "Позиция" })}</th>
              <th>{t("draftTable.article", { defaultValue: "Артикул" })}</th>
              <th>{t("quote.quantity")}</th>
              <th>{t("draftTable.unit", { defaultValue: "Ед." })}</th>
              <th>{t("draftTable.price", { defaultValue: "Цена" })}</th>
              <th>{t("draftTable.sum", { defaultValue: "Сумма" })}</th>
              <th>{t("draftTable.weight", { defaultValue: "Вес" })}</th>
              <th>{t("draftTable.status", { defaultValue: "Статус" })}</th>
              <th>{t("draftTable.comment", { defaultValue: "Коммент." })}</th>
              {customColumns.map((col) => (
                <th key={col.id} className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <button
                      type="button"
                      onClick={() => removeCustomColumn(col.id)}
                      title={t("draftTable.removeColumn", {
                        defaultValue: "Удалить колонку",
                      })}
                      className="text-theme-text-secondary hover:text-red-500"
                      aria-label={t("draftTable.removeColumn", {
                        defaultValue: "Удалить колонку",
                      })}
                    >
                      <Trash size={11} />
                    </button>
                  </span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="min-w-[120px]">
                  {(() => {
                    const recognized = String(
                      line.requestedName || line.inquiryRaw || ""
                    ).trim();
                    const shown = String(
                      line.name || line.productName || ""
                    ).trim();
                    if (!recognized || recognized === shown) return null;
                    return (
                      <span
                        className="block text-[10px] text-green-700 dark:text-green-400 truncate"
                        title={t("draftTable.recognizedFrom", {
                          defaultValue: "Распознано из заявки",
                        })}
                      >
                        {recognized}
                      </span>
                    );
                  })()}
                  <input
                    type="text"
                    value={line.name || line.productName || ""}
                    onChange={(e) =>
                      handleFieldChange(i, "name", e.target.value, line)
                    }
                    title={
                      line.matchType === "analog"
                        ? t("draftTable.analogSubstituted", {
                            defaultValue: "Подставлен аналог из каталога",
                          })
                        : undefined
                    }
                    className={`w-full bg-transparent border-b border-transparent hover:border-theme-sidebar-border focus:border-primary-button outline-none ${
                      line.matchType === "analog"
                        ? "text-amber-700 dark:text-amber-400"
                        : ""
                    }`}
                  />
                  {line.analogOf && (
                    <span className="block text-[10px] text-amber-600">
                      {line.analogOf}
                    </span>
                  )}
                  {(() => {
                    const sortedAlternatives = sortAlternativesByName(
                      line.alternatives
                    );
                    if (sortedAlternatives.length <= 1) return null;
                    return (
                    <select
                      className="mt-0.5 w-full text-[10px] bg-theme-bg-secondary rounded"
                      defaultValue=""
                      onChange={(e) => {
                        const alt =
                          sortedAlternatives[Number(e.target.value)];
                        if (alt) selectAlternative(i, alt);
                      }}
                    >
                      <option value="" disabled>
                        {t("draftTable.alternatives", {
                          defaultValue: "Аналоги",
                        })}
                      </option>
                      {sortedAlternatives.map((a, ai) => {
                          const net = altNetPrice(a);
                          const stock = Number(a.stockCount) || 0;
                          const priceBit =
                            net > 0 ? ` · ${net.toFixed(2)}` : " · нет цены";
                          const stockBit =
                            stock > 0
                              ? ` · ${stock} шт`
                              : isInStockAlternative(a)
                                ? ""
                                : " · нет на складе";
                          return (
                            <option key={ai} value={ai}>
                              {(a.name || "").slice(0, 36)} ({a.status}
                              {priceBit}
                              {stockBit})
                            </option>
                          );
                        })}
                    </select>
                    );
                  })()}
                </td>
                <td>
                  <span className="inline-flex items-center gap-0.5 max-w-[9rem]">
                    <input
                      type="text"
                      value={line.article || line.sku || ""}
                      onChange={(e) =>
                        handleFieldChange(i, "article", e.target.value, line)
                      }
                      className="w-20 min-w-0 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none"
                    />
                    {resolveProductUrl(line) ? (
                      <a
                        href={resolveProductUrl(line)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t("draftTable.openProduct", {
                          defaultValue: "Открыть на purolat.com",
                        })}
                        aria-label={t("draftTable.openProduct", {
                          defaultValue: "Открыть на purolat.com",
                        })}
                        className="shrink-0 text-primary-button hover:opacity-80 p-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowSquareOut size={12} weight="bold" />
                      </a>
                    ) : null}
                  </span>
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity || 1}
                    onChange={(e) =>
                      handleFieldChange(
                        i,
                        "quantity",
                        Number(e.target.value),
                        line
                      )
                    }
                    className="w-14 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none text-right"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    list={`offerKp-unit-${i}`}
                    value={line.unit || "шт"}
                    onChange={(e) =>
                      handleFieldChange(i, "unit", e.target.value, line)
                    }
                    className="w-12 bg-transparent border-b border-transparent hover:border-theme-sidebar-border focus:border-primary-button outline-none"
                  />
                  <datalist id={`offerKp-unit-${i}`}>
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={lineUnitGross(line)}
                    onChange={(e) =>
                      handleFieldChange(
                        i,
                        "priceWithVat",
                        Number(e.target.value),
                        line
                      )
                    }
                    className="w-20 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none text-right"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={Number(lineGrossTotal(line).toFixed(2))}
                    onChange={(e) =>
                      handleFieldChange(
                        i,
                        "lineTotalGross",
                        Number(e.target.value),
                        line
                      )
                    }
                    className="w-20 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none text-right"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={Number(lineTotalWeight(line).toFixed(3))}
                    onChange={(e) =>
                      handleFieldChange(
                        i,
                        "lineWeightKg",
                        Number(e.target.value),
                        line
                      )
                    }
                    className="w-16 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none text-right"
                  />
                </td>
                <td>
                  <select
                    value={line.status || "Требует проверки"}
                    onChange={(e) =>
                      handleFieldChange(i, "status", e.target.value, line)
                    }
                    className={`offerKp-status-select text-[10px] rounded px-1 py-0.5 ${statusClass(line.status)}`}
                  >
                    {OFFER_KP_QUOTE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="min-w-[100px]">
                  <input
                    type="text"
                    value={line.comment || ""}
                    onChange={(e) =>
                      handleFieldChange(i, "comment", e.target.value, line)
                    }
                    placeholder={t("draftTable.commentPlaceholder", {
                      defaultValue: "Комментарий",
                    })}
                    className="w-full bg-transparent border-b border-transparent hover:border-theme-sidebar-border focus:border-primary-button outline-none text-[10px]"
                  />
                </td>
                {customColumns.map((col) => (
                  <td key={col.id} className="min-w-[80px]">
                    <input
                      type="text"
                      value={line.custom?.[col.id] ?? ""}
                      onChange={(e) =>
                        handleFieldChange(
                          i,
                          `custom:${col.id}`,
                          e.target.value,
                          line
                        )
                      }
                      className="w-full bg-transparent border-b border-transparent hover:border-theme-sidebar-border focus:border-primary-button outline-none text-[10px]"
                    />
                  </td>
                ))}
                <td>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => teachLines([i])}
                      disabled={teaching}
                      title={t("draftTable.teachLineTitle", {
                        defaultValue:
                          "В обучение модели (override + embeddings)",
                      })}
                      className="text-theme-text-secondary hover:text-primary-button p-0.5 disabled:opacity-60"
                      aria-label={t("draftTable.teachLine", {
                        defaultValue: "В обучение",
                      })}
                    >
                      <Brain size={14} weight="fill" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-theme-text-secondary hover:text-red-500 p-0.5"
                      aria-label="Remove"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="text-right font-medium">
                {t("quote.total")}
              </td>
              <td className="text-right font-medium">
                {totals.grossTotal.toFixed(2)}
              </td>
              <td className="text-right font-medium">
                {totals.totalWeightKg.toFixed(3)} кг
              </td>
              <td colSpan={3 + customColumns.length} />
            </tr>
          </tfoot>
        </table>
      </div>

      {reviewCount > 0 && (
        <div className="px-3 py-2 border-t border-amber-500/40 bg-amber-500/10 text-[11px] text-theme-text-primary flex flex-col gap-1">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              disabled={recognizedOnly}
              onChange={(event) => setReviewConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {t("draftTable.reviewConfirm", {
                count: reviewCount,
                defaultValue:
                  "{{count}} поз. требуют проверки. Подтверждаю ручную проверку перед экспортом.",
              })}
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={recognizedOnly}
              onChange={(event) => setRecognizedOnly(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {t("draftTable.exportRecognizedOnly", {
                count: recognizedLines.length,
                defaultValue:
                  "В КП только распознанные позиции ({{count}}) — без строк «требует проверки».",
              })}
            </span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-t border-theme-sidebar-border">
        <button
          type="button"
          onClick={() => exportFile("docx")}
          disabled={!!busy || !exportReady}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[#0c7d69] text-white text-xs font-medium disabled:opacity-60"
        >
          {busy === "docx" ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <FileDoc size={14} weight="fill" />
          )}
          DOCX
        </button>
        <button
          type="button"
          onClick={() => exportFile("pdf")}
          disabled={!!busy || !exportReady}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-[#cc785c] text-white text-xs font-medium disabled:opacity-60"
        >
          {busy === "pdf" ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <FilePdf size={14} weight="fill" />
          )}
          PDF
        </button>
        <button
          type="button"
          onClick={() => exportFile("xlsx")}
          disabled={!!busy || !exportReady}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-primary-button text-white text-xs font-medium disabled:opacity-60"
        >
          {busy === "xlsx" ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <FileXls size={14} weight="fill" />
          )}
          XLSX
        </button>
        <button
          type="button"
          onClick={() => setDocumentPanelView("quotePreview")}
          className="px-2 py-1.5 rounded-md border border-theme-sidebar-border text-xs"
        >
          {t("layout.tabPreview")}
        </button>
      </div>
    </div>
  );
}
