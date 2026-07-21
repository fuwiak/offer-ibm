import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { FilePdf, FileDoc, FileXls, CircleNotch } from "@phosphor-icons/react";
import OfferKp from "@/models/offerKp";
import { saveAs } from "file-saver";
import { AUTH_TOKEN } from "@/utils/constants";
import { QUOTE_BRAND, localeForCountry } from "@/utils/offerKp/quoteBrand";
import showToast from "@/utils/toast";

function toDateInputValue(d) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d, days) {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

function lineNeedsReview(line = {}) {
  const status = `${line.status || ""} ${line.kpStatus || ""}`;
  return Boolean(
    line.unitNeedsRecalc ||
      /требует|требуется|needs review/i.test(status) ||
      ["none", "size_mismatch", "spec_mismatch"].includes(line.matchType)
  );
}

function lineNetTotal(line = {}, vatRate) {
  if (line.lineTotal != null && Number.isFinite(Number(line.lineTotal))) {
    return Number(line.lineTotal);
  }
  const quantity = Number(line.quantity) || 0;
  const grossUnitPrice = Number(line.priceWithVat) || 0;
  return Number(((quantity * grossUnitPrice) / (1 + vatRate)).toFixed(2));
}

function lineUnitNet(line = {}, vatRate) {
  const qty = Number(line.quantity) || 0;
  if (line.unitPriceNet != null && Number.isFinite(Number(line.unitPriceNet))) {
    return Number(line.unitPriceNet);
  }
  if (line.priceWithVat != null && Number.isFinite(Number(line.priceWithVat))) {
    return Number((Number(line.priceWithVat) / (1 + vatRate)).toFixed(2));
  }
  return qty > 0 ? Number((lineNetTotal(line, vatRate) / qty).toFixed(2)) : 0;
}

function recalcLine(line, vatRate, { preserveLineTotal = false } = {}) {
  const qty = Number(line.quantity) || 0;
  const priceWithVat = Number(line.priceWithVat) || 0;
  const unitPriceNet = priceWithVat / (1 + vatRate);
  const next = {
    ...line,
    quantity: qty,
    priceWithVat,
    unitPriceNet: Number(unitPriceNet.toFixed(2)),
  };
  if (!preserveLineTotal) {
    next.lineTotal = Number((qty * unitPriceNet).toFixed(2));
  }
  return next;
}

function defaultDoc() {
  return {
    brandCompany: QUOTE_BRAND.companyName,
    brandTagline: QUOTE_BRAND.tagline,
    brandWebsite: QUOTE_BRAND.website,
    title: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ",
    createdAt: toDateInputValue(new Date()),
    validUntil: toDateInputValue(addDays(new Date(), 30)),
    supplierCompany: QUOTE_BRAND.companyName,
    supplierAddress: QUOTE_BRAND.address,
    supplierWebsite: QUOTE_BRAND.website,
    supplierEmail: QUOTE_BRAND.email || "",
    supplierPhone: QUOTE_BRAND.phone || "",
    positionsLabel: `ПОЗИЦИИ КАТАЛОГА ${QUOTE_BRAND.catalogLabel.toUpperCase()}`,
    termsLabel: "УСЛОВИЯ",
    terms: [
      "Оплата и отгрузка — по согласованию с менеджером purolat.com.",
      "Оферта действительна 30 дней с даты документа.",
      `Цены в {currency}; позиции из каталога ${QUOTE_BRAND.catalogLabel}.`,
      QUOTE_BRAND.warrantyNote || "Сертифицированная продукция.",
    ],
    signOff: "С уважением,",
    signCompany: QUOTE_BRAND.companyName,
  };
}

/**
 * HTML-превью коммерческого предложения purolat.com.
 * Все поля документа редактируемы (как блок ПОКУПАТЕЛЬ).
 */
export default function QuotePreview() {
  const { t } = useTranslation("offerKp");
  const { quoteDraft, setQuoteDraft } = useOfferKp();
  const [busy, setBusy] = useState(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const lines = quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  const preview = quoteDraft?.preview;
  const doc = useMemo(
    () => ({ ...defaultDoc(), ...(quoteDraft?.doc || {}) }),
    [quoteDraft?.doc]
  );

  const customer = quoteDraft?.customer || {};
  const reference = quoteDraft?.reference || "DRAFT";
  const {
    currency,
    locale,
    vatRate: countryVat,
  } = localeForCountry(customer.country);
  const vatRate =
    doc.vatRate != null && Number.isFinite(Number(doc.vatRate))
      ? Number(doc.vatRate)
      : countryVat;

  const reviewCount = useMemo(
    () => lines.filter(lineNeedsReview).length,
    [lines]
  );
  useEffect(() => {
    setReviewConfirmed(false);
  }, [lines]);

  const syncLines = useCallback(
    (nextLines) => {
      const nextSubtotal = nextLines.reduce(
        (sum, line) => sum + lineNetTotal(line, vatRate),
        0
      );
      setQuoteDraft((prev) => ({
        ...prev,
        hardwareLines: nextLines,
        preview: {
          ...(prev.preview || {}),
          lines: nextLines,
          subtotal: nextSubtotal,
          total: nextSubtotal,
          shipping: Number(prev.shipping ?? prev.preview?.shipping ?? 0) || 0,
        },
      }));
    },
    [setQuoteDraft, vatRate]
  );

  if (!preview && !lines.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-theme-text-secondary">
        Пройдите шаги конструктора, чтобы увидеть превью оферты purolat.com.
      </div>
    );
  }

  const money = (n) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(Number(n) || 0)
      .replace(/[\u202f\u00a0]/g, " ");

  const subtotal = lines.reduce(
    (sum, line) => sum + lineNetTotal(line, vatRate),
    0
  );
  const shipping = Number(quoteDraft.shipping ?? preview?.shipping ?? 0) || 0;
  const net = subtotal + shipping;
  const vat = net * vatRate;
  const grandTotal = net + vat;

  const createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();
  const validUntil = doc.validUntil
    ? new Date(doc.validUntil)
    : addDays(createdAt, 30);

  function setCustomerField(field, value) {
    setQuoteDraft((prev) => ({
      ...prev,
      customer: {
        ...(prev.customer || {}),
        [field]: value,
      },
    }));
  }

  function setDocField(field, value) {
    setQuoteDraft((prev) => ({
      ...prev,
      doc: {
        ...defaultDoc(),
        ...(prev.doc || {}),
        [field]: value,
      },
    }));
  }

  function setTerm(index, value) {
    setQuoteDraft((prev) => {
      const base = { ...defaultDoc(), ...(prev.doc || {}) };
      const terms = [...(base.terms || [])];
      terms[index] = value;
      return { ...prev, doc: { ...base, terms } };
    });
  }

  function updateLine(index, patch, opts) {
    const next = lines.map((l, i) =>
      i === index ? recalcLine({ ...l, ...patch }, vatRate, opts) : l
    );
    syncLines(next);
  }

  function handleLineField(index, field, value) {
    const line = lines[index] || {};
    if (field === "name") {
      updateLine(index, { name: value, productName: value });
      return;
    }
    if (field === "article") {
      updateLine(index, { article: value, sku: value });
      return;
    }
    if (field === "quantity") {
      updateLine(index, { quantity: Number(value) || 0 });
      return;
    }
    if (field === "unitNet") {
      const unitNet = Number(value) || 0;
      const priceWithVat = Number((unitNet * (1 + vatRate)).toFixed(2));
      updateLine(index, { priceWithVat, unitPriceNet: unitNet });
      return;
    }
    if (field === "lineTotal") {
      const qty = Number(line.quantity) || 0;
      const lineTotal = Number(value) || 0;
      const unitNet = qty > 0 ? lineTotal / qty : 0;
      const priceWithVat = Number((unitNet * (1 + vatRate)).toFixed(2));
      updateLine(
        index,
        { priceWithVat, unitPriceNet: Number(unitNet.toFixed(2)), lineTotal },
        { preserveLineTotal: true }
      );
      return;
    }
    updateLine(index, { [field]: value });
  }

  function setShipping(value) {
    const next = Number(value) || 0;
    setQuoteDraft((prev) => ({
      ...prev,
      shipping: next,
      preview: {
        ...(prev.preview || {}),
        shipping: next,
      },
    }));
  }

  const payload = {
    reference: quoteDraft.reference,
    customer: { name: customer.name || "", country: customer.country || "" },
    priceMode: quoteDraft.priceMode || "public",
    lines,
    shipping,
    subtotal,
    total: subtotal,
    vatRate,
    currency,
    reviewConfirmed,
    createdAt,
    doc,
  };

  async function download(kind) {
    if (busy || (reviewCount > 0 && !reviewConfirmed)) return;
    setBusy(kind);
    try {
      const result =
        kind === "pdf"
          ? await OfferKp.generateQuotePdf(payload)
          : kind === "xlsx"
            ? await OfferKp.generateQuoteXlsx(payload)
            : await OfferKp.generateQuoteDocx(payload);
      const url =
        kind === "pdf"
          ? OfferKp.quotePdfDownloadUrl(result.storageFilename)
          : kind === "xlsx"
            ? OfferKp.quoteXlsxDownloadUrl(result.storageFilename)
            : OfferKp.quoteDocxDownloadUrl(result.storageFilename);
      const token = window.localStorage.getItem(AUTH_TOKEN) || "";
      const res = await fetch(url, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      saveAs(blob, result.filename);
    } catch (e) {
      console.error("[QuotePreview] download error:", e);
      showToast("Не удалось скачать документ. Попробуйте ещё раз.", "error");
    } finally {
      setBusy(null);
    }
  }

  const terms = doc.terms || [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary">
        <span className="text-xs text-theme-text-secondary truncate min-w-0">
          {customer.name ? `Оферта — ${customer.name}` : `Оферта ${reference}`}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => download("pdf")}
            disabled={!!busy || (reviewCount > 0 && !reviewConfirmed)}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#0c7d69] hover:bg-[#0a6757] text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "pdf" ? (
              <CircleNotch size={12} weight="bold" className="animate-spin" />
            ) : (
              <FilePdf size={12} weight="bold" />
            )}
            PDF
          </button>
          <button
            type="button"
            onClick={() => download("xlsx")}
            disabled={!!busy || (reviewCount > 0 && !reviewConfirmed)}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary-button hover:bg-[#a9583e] text-white text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "xlsx" ? (
              <CircleNotch size={12} weight="bold" className="animate-spin" />
            ) : (
              <FileXls size={12} weight="bold" />
            )}
            XLSX
          </button>
          <button
            type="button"
            onClick={() => download("docx")}
            disabled={!!busy || (reviewCount > 0 && !reviewConfirmed)}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-theme-sidebar-border text-theme-text-primary text-[11px] font-medium hover:bg-theme-sidebar-item-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy === "docx" ? (
              <CircleNotch size={12} weight="bold" className="animate-spin" />
            ) : (
              <FileDoc size={12} weight="bold" />
            )}
            Word
          </button>
        </div>
      </div>

      {reviewCount > 0 && (
        <label className="flex items-start gap-2 px-3 py-2 border-b border-amber-500/40 bg-amber-500/10 text-[11px] text-theme-text-primary">
          <input
            type="checkbox"
            checked={reviewConfirmed}
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
      )}

      <div className="flex-1 overflow-auto bg-[#525659] p-3" translate="no">
        <div className="offerKp-quote-doc notranslate" translate="no">
          <div className="offerKp-quote-doc__head">
            <div>
              <input
                type="text"
                value={doc.brandCompany || ""}
                onChange={(e) => setDocField("brandCompany", e.target.value)}
                className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--brand"
              />
              <input
                type="text"
                value={doc.brandTagline || ""}
                onChange={(e) => setDocField("brandTagline", e.target.value)}
                className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--muted"
              />
              <input
                type="text"
                value={doc.brandWebsite || ""}
                onChange={(e) => setDocField("brandWebsite", e.target.value)}
                className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--muted"
              />
            </div>
            <div className="offerKp-quote-doc__meta">
              <input
                type="text"
                value={doc.title || ""}
                onChange={(e) => setDocField("title", e.target.value)}
                className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--title"
              />
              <label className="offerKp-quote-doc__edit-row">
                <span>№</span>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) =>
                    setQuoteDraft((prev) => ({
                      ...prev,
                      reference: e.target.value,
                    }))
                  }
                  className="offerKp-quote-doc__edit-input"
                />
              </label>
              <label className="offerKp-quote-doc__edit-row">
                <span>Дата:</span>
                <input
                  type="date"
                  value={toDateInputValue(createdAt)}
                  onChange={(e) => setDocField("createdAt", e.target.value)}
                  className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--date"
                />
              </label>
              <label className="offerKp-quote-doc__edit-row">
                <span>Действительно до:</span>
                <input
                  type="date"
                  value={toDateInputValue(validUntil)}
                  onChange={(e) => setDocField("validUntil", e.target.value)}
                  className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--date"
                />
              </label>
            </div>
          </div>

          <div className="offerKp-quote-doc__rule" />

          <div className="offerKp-quote-doc__parties">
            <div>
              <div className="offerKp-quote-doc__label">ПОСТАВЩИК</div>
              <input
                type="text"
                value={doc.supplierCompany || ""}
                onChange={(e) => setDocField("supplierCompany", e.target.value)}
                className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--strong"
              />
              <input
                type="text"
                value={doc.supplierAddress || ""}
                onChange={(e) => setDocField("supplierAddress", e.target.value)}
                className="offerKp-quote-doc__edit-input"
              />
              <input
                type="text"
                value={doc.supplierWebsite || ""}
                onChange={(e) => setDocField("supplierWebsite", e.target.value)}
                className="offerKp-quote-doc__edit-input"
              />
              <input
                type="text"
                value={doc.supplierEmail || ""}
                onChange={(e) => setDocField("supplierEmail", e.target.value)}
                placeholder="Email"
                className="offerKp-quote-doc__edit-input"
              />
              <input
                type="text"
                value={doc.supplierPhone || ""}
                onChange={(e) => setDocField("supplierPhone", e.target.value)}
                placeholder="Телефон"
                className="offerKp-quote-doc__edit-input"
              />
            </div>
            <div className="offerKp-quote-doc__buyer">
              <div className="offerKp-quote-doc__label">
                {t("quote.buyer", { defaultValue: "ПОКУПАТЕЛЬ" })}
              </div>
              <label className="offerKp-quote-doc__edit-field">
                <span className="sr-only">
                  {t("quote.customerName", {
                    defaultValue: "Название покупателя",
                  })}
                </span>
                <input
                  type="text"
                  value={customer.name || ""}
                  onChange={(e) => setCustomerField("name", e.target.value)}
                  placeholder={t("quote.customerNamePlaceholder", {
                    defaultValue: "Название компании или ФИО",
                  })}
                  className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--strong"
                />
              </label>
              <label className="offerKp-quote-doc__edit-field">
                <span className="sr-only">
                  {t("quote.customerCountry", {
                    defaultValue: "Страна доставки",
                  })}
                </span>
                <input
                  type="text"
                  value={customer.country || ""}
                  onChange={(e) => setCustomerField("country", e.target.value)}
                  placeholder={t("quote.customerCountryPlaceholder", {
                    defaultValue: "Страна (напр. Россия)",
                  })}
                  className="offerKp-quote-doc__edit-input"
                />
              </label>
            </div>
          </div>

          <input
            type="text"
            value={doc.positionsLabel || ""}
            onChange={(e) => setDocField("positionsLabel", e.target.value)}
            className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--section"
          />
          <table className="offerKp-quote-doc__table">
            <colgroup>
              <col className="offerKp-quote-doc__col-name" />
              <col className="offerKp-quote-doc__col-article" />
              <col className="offerKp-quote-doc__col-qty" />
              <col className="offerKp-quote-doc__col-price" />
              <col className="offerKp-quote-doc__col-sum" />
            </colgroup>
            <thead>
              <tr>
                <th>Позиция</th>
                <th>Артикул</th>
                <th className="num">Кол-во</th>
                <th className="num">Цена/шт</th>
                <th className="num">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const qty = Number(line.quantity) || 0;
                const unit = lineUnitNet(line, vatRate);
                const sum = lineNetTotal(line, vatRate);
                return (
                  <tr key={i}>
                    <td>
                      <textarea
                        rows={2}
                        value={
                          line.name || line.productName || line.productId || ""
                        }
                        onChange={(e) =>
                          handleLineField(i, "name", e.target.value)
                        }
                        className="offerKp-quote-doc__edit-input offerKp-quote-doc__cell-input offerKp-quote-doc__cell-input--name"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={line.article || line.sku || ""}
                        onChange={(e) =>
                          handleLineField(i, "article", e.target.value)
                        }
                        className="offerKp-quote-doc__edit-input offerKp-quote-doc__cell-input"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={(e) =>
                          handleLineField(i, "quantity", e.target.value)
                        }
                        className="offerKp-quote-doc__edit-input offerKp-quote-doc__cell-input offerKp-quote-doc__cell-input--num"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={unit}
                        onChange={(e) =>
                          handleLineField(i, "unitNet", e.target.value)
                        }
                        className="offerKp-quote-doc__edit-input offerKp-quote-doc__cell-input offerKp-quote-doc__cell-input--num"
                      />
                    </td>
                    <td className="num strong">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={sum}
                        onChange={(e) =>
                          handleLineField(i, "lineTotal", e.target.value)
                        }
                        className="offerKp-quote-doc__edit-input offerKp-quote-doc__cell-input offerKp-quote-doc__cell-input--num offerKp-quote-doc__cell-input--strong"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="offerKp-quote-doc__totals">
            <div>
              <span>Подытог</span>
              <span>{money(subtotal)}</span>
            </div>
            <div>
              <span>Доставка</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
                className="offerKp-quote-doc__edit-input offerKp-quote-doc__totals-input"
              />
            </div>
            <div>
              <label className="offerKp-quote-doc__vat-edit">
                <span>НДС (</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(vatRate * 100)}
                  onChange={(e) =>
                    setDocField("vatRate", (Number(e.target.value) || 0) / 100)
                  }
                  className="offerKp-quote-doc__edit-input offerKp-quote-doc__vat-input"
                />
                <span>%)</span>
              </label>
              <span>{money(vat)}</span>
            </div>
            <div className="offerKp-quote-doc__grand">
              <span>Итого с НДС</span>
              <span>{money(grandTotal)}</span>
            </div>
          </div>

          <input
            type="text"
            value={doc.termsLabel || ""}
            onChange={(e) => setDocField("termsLabel", e.target.value)}
            className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--section"
          />
          <ul className="offerKp-quote-doc__terms">
            {terms.map((term, i) => (
              <li key={i}>
                <input
                  type="text"
                  value={String(term).replace("{currency}", currency)}
                  onChange={(e) => setTerm(i, e.target.value)}
                  className="offerKp-quote-doc__edit-input"
                />
              </li>
            ))}
          </ul>

          <div className="offerKp-quote-doc__sign">
            <input
              type="text"
              value={doc.signOff || ""}
              onChange={(e) => setDocField("signOff", e.target.value)}
              className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--strong"
            />
            <input
              type="text"
              value={doc.signCompany || ""}
              onChange={(e) => setDocField("signCompany", e.target.value)}
              className="offerKp-quote-doc__edit-input offerKp-quote-doc__edit-input--muted"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
