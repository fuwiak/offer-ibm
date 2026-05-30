import { useState } from "react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { FilePdf, FileDoc, CircleNotch } from "@phosphor-icons/react";
import OfferKp from "@/models/offerKp";
import { saveAs } from "file-saver";
import { AUTH_TOKEN } from "@/utils/constants";

/** Country → currency / VAT defaults (mirrors server generateQuoteDocx). */
function localeForCountry(country = "") {
  const c = String(country).trim().toLowerCase();
  if (["poland", "polska", "pologne", "pl"].includes(c)) {
    return { currency: "PLN", locale: "pl-PL", vatRate: 0.23 };
  }
  return { currency: "EUR", locale: "fr-FR", vatRate: 0.2 };
}

const SENDER = {
  name: "AV ELIA GLASS SOLUTIONS",
  address: "14 allée du Nautilus",
  city: "80440 Glisy, France",
  email: "info@alliaverre.com",
  phone: "+33 3 22 47 47 55",
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
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
 * Rendered, paper-like preview of the current quotation draft.
 */
export default function QuotePreview() {
  const { quoteDraft } = useOfferKp();
  const [busy, setBusy] = useState(null);

  const preview = quoteDraft?.preview;
  if (!preview) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-theme-text-secondary">
        Complete the quote steps to see a live document preview here.
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
          : await OfferKp.generateQuoteDocx(payload);
      const url =
        kind === "pdf"
          ? OfferKp.quotePdfDownloadUrl(result.storageFilename)
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
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-theme-sidebar-border bg-theme-bg-secondary">
        <span className="text-xs text-theme-text-secondary truncate min-w-0">
          {customer.name
            ? `Quotation — ${customer.name}`
            : `Quotation ${reference}`}
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
              <div className="offerKp-quote-doc__brand">{SENDER.name}</div>
              <div className="offerKp-quote-doc__brand-sub">
                Vacuum Insulating Glazing — Tempered
              </div>
            </div>
            <div className="offerKp-quote-doc__meta">
              <div className="offerKp-quote-doc__title">QUOTATION</div>
              <div>Quote No: {reference}</div>
              <div>Date: {fmtDate(createdAt)}</div>
              <div>Valid until: {fmtDate(addDays(createdAt, 30))}</div>
            </div>
          </div>

          <div className="offerKp-quote-doc__rule" />

          <div className="offerKp-quote-doc__parties">
            <div>
              <div className="offerKp-quote-doc__label">FROM</div>
              <div className="offerKp-quote-doc__strong">{SENDER.name}</div>
              <div>{SENDER.address}</div>
              <div>{SENDER.city}</div>
              <div>{SENDER.email}</div>
              <div>{SENDER.phone}</div>
            </div>
            <div>
              <div className="offerKp-quote-doc__label">TO</div>
              <div className="offerKp-quote-doc__strong">
                {customer.name || "—"}
              </div>
              {customer.country && <div>{customer.country}</div>}
            </div>
          </div>

          <div className="offerKp-quote-doc__label offerKp-quote-doc__section">
            ITEMS
          </div>
          <table className="offerKp-quote-doc__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Dimensions (mm)</th>
                <th className="num">Qty</th>
                <th className="num">Unit Price</th>
                <th className="num">Total</th>
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
                    <td className="num">{qty} pcs</td>
                    <td className="num">{money(unit)}</td>
                    <td className="num strong">{money(line.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="offerKp-quote-doc__totals">
            <div>
              <span>Subtotal</span>
              <span>{money(preview.subtotal)}</span>
            </div>
            <div>
              <span>Delivery</span>
              <span>{money(preview.shipping)}</span>
            </div>
            <div>
              <span>VAT ({Math.round(vatRate * 100)}%)</span>
              <span>{money(vat)}</span>
            </div>
            <div className="offerKp-quote-doc__grand">
              <span>Total (incl. VAT)</span>
              <span>{money(grandTotal)}</span>
            </div>
          </div>

          <div className="offerKp-quote-doc__label offerKp-quote-doc__section">
            TERMS &amp; CONDITIONS
          </div>
          <ul className="offerKp-quote-doc__terms">
            <li>Payment Terms: 50% deposit at order, balance before delivery.</li>
            <li>This quotation is valid until the date mentioned above.</li>
            <li>All prices are in {currency}.</li>
            <li>24-month manufacturer warranty on vacuum insulating glazing.</li>
          </ul>

          <div className="offerKp-quote-doc__sign">
            <div className="offerKp-quote-doc__strong">Best regards,</div>
            <div className="offerKp-quote-doc__brand-sub">{SENDER.name} Team</div>
          </div>
        </div>
      </div>
    </div>
  );
}
