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
} from "@phosphor-icons/react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import OfferKp from "@/models/offerKp";
import { downloadBlob } from "@/utils/downloadBlob";
import { AUTH_TOKEN } from "@/utils/constants";
import { OFFER_KP_QUOTE_STATUSES } from "@/utils/offerKp/quoteFlow";
import { buildQuoteMarkdown } from "@/utils/offerKp/buildQuoteMarkdown";

const EMPTY_LINE = {
  name: "",
  article: "",
  quantity: 1,
  unit: "шт",
  priceWithVat: 0,
  lineTotal: 0,
  weightKg: 0,
  status: "Требует проверки",
  comment: "",
  alternatives: [],
};

function statusClass(status) {
  if (status === "В наличии") return "offerKp-status--ok";
  if (status === "Аналог") return "offerKp-status--analog";
  if (status === "Под заказ") return "offerKp-status--order";
  if (status === "Нет в наличии") return "offerKp-status--none";
  return "offerKp-status--review";
}

function recalcLine(line) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.priceWithVat) || 0;
  return {
    ...line,
    lineTotal: Number((qty * price).toFixed(2)),
  };
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

  const lines = quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + (Number(l.lineTotal) || Number(l.quantity) * Number(l.priceWithVat) || 0),
      0
    );
    const totalWeightKg = lines.reduce(
      (s, l) => s + (Number(l.weightKg) || 0) * (Number(l.quantity) || 1),
      0
    );
    return { subtotal, totalWeightKg };
  }, [lines]);

  useEffect(() => {
    if (!lines.length) return;
    const markdown = buildQuoteMarkdown({
      reference: quoteDraft?.reference || "DRAFT",
      customer: quoteDraft?.customer || {},
      lines,
      subtotal: totals.subtotal,
      total: totals.subtotal,
      shipping: quoteDraft?.shipping || 0,
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
    setDocPreview,
  ]);

  const updateLine = useCallback(
    (index, patch) => {
      setQuoteDraft((prev) => {
        const current = prev.hardwareLines || prev.preview?.lines || [];
        const next = current.map((l, i) =>
          i === index ? recalcLine({ ...l, ...patch }) : l
        );
        const subtotal = next.reduce((s, l) => s + (l.lineTotal || 0), 0);
        const totalWeightKg = next.reduce(
          (s, l) => s + (l.weightKg || 0) * (l.quantity || 1),
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
    [setQuoteDraft]
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
          },
        ]);
      } catch {
        /* non-blocking */
      }
    },
    [activeThreadSlug, quoteDraft?.reference]
  );

  const handleFieldChange = (index, field, value, line) => {
    const old = line[field];
    updateLine(index, { [field]: value });
    if (String(old) !== String(value)) {
      logCorrection(index, field, old, value, line);
    }
  };

  const removeLine = (index) => {
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = current.filter((_, i) => i !== index);
      return { ...prev, hardwareLines: next, preview: { ...prev.preview, lines: next } };
    });
  };

  const addLine = () => {
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = [...current, { ...EMPTY_LINE }];
      return { ...prev, hardwareLines: next, preview: { ...prev.preview, lines: next } };
    });
  };

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const data = await OfferKp.searchProducts(searchQuery.trim());
      setSearchResults(data.products || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
  }

  function addFromSearch(product) {
    const line = recalcLine({
      ...EMPTY_LINE,
      name: product.name,
      article: product.matched_sku || product.sku || "",
      productId: String(product.id),
      priceWithVat: Number(product.price) || 0,
      status: "Требует проверки",
    });
    setQuoteDraft((prev) => {
      const current = prev.hardwareLines || prev.preview?.lines || [];
      const next = [...current, line];
      return { ...prev, hardwareLines: next, preview: { ...prev.preview, lines: next } };
    });
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  function selectAlternative(lineIndex, alt) {
    const line = lines[lineIndex];
    handleFieldChange(
      lineIndex,
      "name",
      alt.name,
      line
    );
    updateLine(lineIndex, {
      name: alt.name,
      article: alt.sku,
      priceWithVat: alt.price,
      status: alt.status,
      analogOf: alt.analogOf,
    });
  }

  async function exportFile(kind) {
    if (busy) return;
    setBusy(kind);
    try {
      const payload = {
        reference: quoteDraft?.reference || "DRAFT",
        customer: quoteDraft?.customer || {},
        lines,
        subtotal: totals.subtotal,
        total: totals.subtotal,
        shipping: quoteDraft?.shipping || 0,
        createdAt: new Date(),
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
        const markdown = buildQuoteMarkdown({
          reference: payload.reference,
          customer: payload.customer,
          lines,
          subtotal: totals.subtotal,
          total: totals.subtotal,
          shipping: payload.shipping,
        });
        result = await OfferKp.generateDocxFromMarkdown({
          markdown,
          filename: `KP-${payload.reference}.docx`,
        });
        url = OfferKp.quoteDocxDownloadUrl(result.storageFilename);
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
    } finally {
      setBusy(null);
    }
  }

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
                "Ручная коррекция: кол-во, цена, статус, комментарии, позиции из базы.",
            })}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
            onClick={addLine}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
          >
            <Plus size={13} />
            {t("quote.addLine")}
          </button>
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
              <th>{t("draftTable.name", { defaultValue: "Наименование" })}</th>
              <th>{t("draftTable.article", { defaultValue: "Артикул" })}</th>
              <th>{t("quote.quantity")}</th>
              <th>{t("draftTable.unit", { defaultValue: "Ед." })}</th>
              <th>{t("draftTable.priceVat", { defaultValue: "Цена с НДС" })}</th>
              <th>{t("draftTable.sum", { defaultValue: "Сумма" })}</th>
              <th>{t("draftTable.weight", { defaultValue: "Вес" })}</th>
              <th>{t("draftTable.status", { defaultValue: "Статус" })}</th>
              <th>{t("draftTable.comment", { defaultValue: "Коммент." })}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td className="min-w-[120px]">
                  <input
                    type="text"
                    value={line.name || line.productName || ""}
                    onChange={(e) =>
                      handleFieldChange(i, "name", e.target.value, line)
                    }
                    className="w-full bg-transparent border-b border-transparent hover:border-theme-sidebar-border focus:border-primary-button outline-none"
                  />
                  {line.analogOf && (
                    <span className="block text-[10px] text-amber-600">
                      {line.analogOf}
                    </span>
                  )}
                  {line.alternatives?.length > 1 && (
                    <select
                      className="mt-0.5 w-full text-[10px] bg-theme-bg-secondary rounded"
                      defaultValue=""
                      onChange={(e) => {
                        const alt = line.alternatives[Number(e.target.value)];
                        if (alt) selectAlternative(i, alt);
                      }}
                    >
                      <option value="" disabled>
                        {t("draftTable.alternatives", { defaultValue: "Аналоги" })}
                      </option>
                      {line.alternatives.map((a, ai) => (
                        <option key={ai} value={ai}>
                          {a.name?.slice(0, 40)} ({a.status})
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <input
                    type="text"
                    value={line.article || line.sku || ""}
                    onChange={(e) =>
                      handleFieldChange(i, "article", e.target.value, line)
                    }
                    className="w-20 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity || 1}
                    onChange={(e) =>
                      handleFieldChange(i, "quantity", Number(e.target.value), line)
                    }
                    className="w-14 bg-transparent border-b border-transparent hover:border-theme-sidebar-border outline-none text-right"
                  />
                </td>
                <td>{line.unit || "шт"}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.priceWithVat ?? line.unitPrice ?? 0}
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
                <td className="text-right whitespace-nowrap">
                  {(line.lineTotal ?? 0).toFixed(2)}
                </td>
                <td className="text-right">
                  {Number(line.weightKg || 0).toFixed(3)}
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
                <td>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-theme-text-secondary hover:text-red-500 p-0.5"
                    aria-label="Remove"
                  >
                    <Trash size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="text-right font-medium">
                {t("quote.total")}
              </td>
              <td className="text-right font-medium">
                {totals.subtotal.toFixed(2)}
              </td>
              <td className="text-right font-medium">
                {totals.totalWeightKg.toFixed(3)} кг
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-t border-theme-sidebar-border">
        <button
          type="button"
          onClick={() => exportFile("docx")}
          disabled={!!busy}
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
          disabled={!!busy}
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
          disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-emerald-700 text-white text-xs font-medium disabled:opacity-60"
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
