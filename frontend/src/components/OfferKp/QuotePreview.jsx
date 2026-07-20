import { useState } from "react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { FilePdf, FileDoc, FileXls, CircleNotch } from "@phosphor-icons/react";
import OfferKp from "@/models/offerKp";
import { saveAs } from "file-saver";
import { AUTH_TOKEN } from "@/utils/constants";
import { QUOTE_BRAND, localeForCountry } from "@/utils/offerKp/quoteBrand";
import showToast from "@/utils/toast";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addDays(d, days) {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * HTML-превью коммерческого предложения purolat.com.
 */
export default function QuotePreview() {
  const { quoteDraft } = useOfferKp();
  const [busy, setBusy] = useState(null);

  const preview = quoteDraft?.preview;
  if (!preview) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-theme-text-secondary">
        Пройдите шаги конструктора, чтобы увидеть превью оферты purolat.com.
      </div>
    );
  }

  const customer = quoteDraft.customer || {};
  const reference = quoteDraft.reference || "DRAFT";
  const createdAt = new Date();
  const { currency, locale, vatRate } = localeForCountry(customer.country);
  const money = (n) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(Number(n) || 0)
      .replace(/[\u202f\u00a0]/g, " ");

  const net = (Number(preview.subtotal) || 0) + (Number(preview.shipping) || 0);
  const vat = net * vatRate;
  const grandTotal = net + vat;

  const payload = {
    reference: quoteDraft.reference,
    customer: { name: customer.name || "", country: customer.country || "" },
    priceMode: quoteDraft.priceMode || "public",
    lines: preview.lines,
    shipping: preview.shipping,
    subtotal: preview.subtotal,
    total: preview.total,
    createdAt,
  };

  async function download(kind) {
    if (busy) return;
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary">
        <span className="text-xs text-theme-text-secondary truncate min-w-0">
          {customer.name
            ? `Оферта — ${customer.name}`
            : `Оферта ${reference}`}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => download("pdf")}
            disabled={!!busy}
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
            disabled={!!busy}
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
            disabled={!!busy}
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

      <div className="flex-1 overflow-y-auto bg-[#525659] p-3" translate="no">
        <div className="offerKp-quote-doc notranslate" translate="no">
          <div className="offerKp-quote-doc__head">
            <div>
              <div className="offerKp-quote-doc__brand">{QUOTE_BRAND.companyName}</div>
              <div className="offerKp-quote-doc__brand-sub">{QUOTE_BRAND.tagline}</div>
              <div className="offerKp-quote-doc__brand-sub">{QUOTE_BRAND.website}</div>
            </div>
            <div className="offerKp-quote-doc__meta">
              <div className="offerKp-quote-doc__title">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</div>
              <div>№ {reference}</div>
              <div>Дата: {fmtDate(createdAt)}</div>
              <div>Действительно до: {fmtDate(addDays(createdAt, 30))}</div>
            </div>
          </div>

          <div className="offerKp-quote-doc__rule" />

          <div className="offerKp-quote-doc__parties">
            <div>
              <div className="offerKp-quote-doc__label">ПОСТАВЩИК</div>
              <div className="offerKp-quote-doc__strong">{QUOTE_BRAND.companyName}</div>
              <div>{QUOTE_BRAND.address}</div>
              <div>{QUOTE_BRAND.website}</div>
              {QUOTE_BRAND.email && <div>{QUOTE_BRAND.email}</div>}
              {QUOTE_BRAND.phone && <div>{QUOTE_BRAND.phone}</div>}
            </div>
            <div>
              <div className="offerKp-quote-doc__label">ПОКУПАТЕЛЬ</div>
              <div className="offerKp-quote-doc__strong">
                {customer.name || "—"}
              </div>
              {customer.country && <div>{customer.country}</div>}
            </div>
          </div>

          <div className="offerKp-quote-doc__label offerKp-quote-doc__section">
            ПОЗИЦИИ КАТАЛОГА {QUOTE_BRAND.catalogLabel.toUpperCase()}
          </div>
          <table className="offerKp-quote-doc__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Наименование</th>
                <th>D × L (мм)</th>
                <th className="num">Кол-во</th>
                <th className="num">Цена/шт</th>
                <th className="num">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines?.map((line, i) => {
                const qty = line.quantity || 1;
                const unit = qty > 0 ? (line.lineTotal || 0) / qty : 0;
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{line.productName || line.productId}</td>
                    <td>
                      {line.lengthMm} × {line.heightMm}
                    </td>
                    <td className="num">{qty} шт</td>
                    <td className="num">{money(unit)}</td>
                    <td className="num strong">{money(line.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="offerKp-quote-doc__totals">
            <div>
              <span>Подытог</span>
              <span>{money(preview.subtotal)}</span>
            </div>
            <div>
              <span>Доставка</span>
              <span>{money(preview.shipping)}</span>
            </div>
            <div>
              <span>НДС ({Math.round(vatRate * 100)}%)</span>
              <span>{money(vat)}</span>
            </div>
            <div className="offerKp-quote-doc__grand">
              <span>Итого с НДС</span>
              <span>{money(grandTotal)}</span>
            </div>
          </div>

          <div className="offerKp-quote-doc__label offerKp-quote-doc__section">
            УСЛОВИЯ
          </div>
          <ul className="offerKp-quote-doc__terms">
            <li>Оплата и отгрузка — по согласованию с менеджером purolat.com.</li>
            <li>Оферта действительна 30 дней с даты документа.</li>
            <li>Цены в {currency}; позиции из каталога {QUOTE_BRAND.catalogLabel}.</li>
            <li>{QUOTE_BRAND.warrantyNote || "Сертифицированная продукция."}</li>
          </ul>

          <div className="offerKp-quote-doc__sign">
            <div className="offerKp-quote-doc__strong">С уважением,</div>
            <div className="offerKp-quote-doc__brand-sub">
              {QUOTE_BRAND.companyName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
