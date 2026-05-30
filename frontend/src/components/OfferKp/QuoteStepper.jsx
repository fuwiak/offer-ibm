import { useState } from "react";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { useTranslation } from "react-i18next";
import { QUOTE_STEPS, advanceQuoteDraft, updateQuoteLines } from "@/utils/offerKp/quoteFlow";
import { OFFER_KP_PRODUCTS } from "@/utils/offerKp/pricing";
import { Plus, Trash, FilePdf, CircleNotch } from "@phosphor-icons/react";
import OfferKp from "@/models/offerKp";
import { saveAs } from "file-saver";
import { AUTH_TOKEN } from "@/utils/constants";

const STEP_KEYS = [
  "stepProduct",
  "stepDimensions",
  "stepCalculation",
  "stepPreview",
  "stepValidate",
  "stepShare",
];

export default function QuoteStepper() {
  const { t } = useTranslation("offerKp");
  const { quoteDraft, setQuoteDraft, setQuotePdfUrl, setDocumentPanelView } = useOfferKp();
  const step = quoteDraft?.step ?? 0;
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfMeta, setPdfMeta] = useState(null);

  function advance() {
    setQuoteDraft((prev) => advanceQuoteDraft(prev));
  }

  function back() {
    setQuoteDraft((prev) => ({ ...prev, step: Math.max(0, prev.step - 1) }));
  }

  function updateLines(lines) {
    setQuoteDraft((prev) => updateQuoteLines(prev, lines));
  }

  function setProduct(lineIdx, productId) {
    const lines = quoteDraft.lines.map((l, i) =>
      i === lineIdx ? { ...l, productId } : l
    );
    updateLines(lines);
  }

  function setDim(lineIdx, field, value) {
    const lines = quoteDraft.lines.map((l, i) =>
      i === lineIdx ? { ...l, [field]: Number(value) || 0 } : l
    );
    updateLines(lines);
  }

  function addLine() {
    updateLines([
      ...quoteDraft.lines,
      { productId: "one-8-3", lengthMm: 1000, heightMm: 1000, quantity: 1 },
    ]);
  }

  function removeLine(idx) {
    if (quoteDraft.lines.length <= 1) return;
    updateLines(quoteDraft.lines.filter((_, i) => i !== idx));
  }

  const canAdvance = step < QUOTE_STEPS.length - 1;
  const isLastStep = step === QUOTE_STEPS.length - 1;

  async function handleDownloadPdf() {
    if (generatingPdf || !quoteDraft?.preview) return;
    setGeneratingPdf(true);
    try {
      const preview = quoteDraft.preview;
      const result = await OfferKp.generateQuotePdf({
        reference: quoteDraft.reference,
        lines: preview.lines,
        shipping: preview.shipping,
        subtotal: preview.subtotal,
        total: preview.total,
        createdAt: new Date(),
      });
      setPdfMeta(result);
      const apiUrl = OfferKp.quotePdfDownloadUrl(result.storageFilename);
      const token = window.localStorage.getItem(AUTH_TOKEN) || "";
      const res = await fetch(apiUrl, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      // Create a blob URL for the iframe preview
      const blobUrl = URL.createObjectURL(blob);
      setQuotePdfUrl({ url: blobUrl, filename: result.filename });
      setDocumentPanelView("pdf");
      saveAs(blob, result.filename);
    } catch (e) {
      console.error("[QuoteStepper] PDF error:", e);
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/40 light:text-slate-400 uppercase tracking-wide">
            Step {step + 1} of {QUOTE_STEPS.length}
          </p>
          <p className="text-[10px] font-medium text-blue-400 light:text-blue-600">
            {t(`quote.${STEP_KEYS[step]}`, QUOTE_STEPS[step])}
          </p>
        </div>
        <div className="flex gap-0.5">
          {QUOTE_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 transition-all ${
                i <= step ? "bg-blue-500" : "bg-white/10 light:bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white/5 light:bg-slate-50 border border-white/10 light:border-slate-200 p-3">
        {step === 0 && <ProductStep lines={quoteDraft.lines} setProduct={setProduct} />}
        {step === 1 && (
          <DimensionsStep lines={quoteDraft.lines} setDim={setDim} addLine={addLine} removeLine={removeLine} />
        )}
        {step >= 2 && quoteDraft.preview && (
          <PreviewStep preview={quoteDraft.preview} step={step} reference={quoteDraft.reference} />
        )}
        {(step === 5) && <ShareStep reference={quoteDraft.reference} />}
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="flex-1 py-2 border border-white/20 light:border-slate-300 text-white/60 light:text-slate-500 hover:bg-white/5 text-xs"
          >
            Back
          </button>
        )}
        {canAdvance && (
          <button
            type="button"
            onClick={advance}
            className="flex-1 py-2 bg-[#0f62fe] text-white text-xs hover:bg-[#0353e9] transition-colors"
          >
            {step === 4 ? t("quote.validate", "Generate quote") : "Continue →"}
          </button>
        )}
        {isLastStep && (
          <div className="flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="flex items-center justify-center gap-2 w-full py-2 bg-[#0f62fe] text-white text-xs hover:bg-[#0353e9] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generatingPdf ? (
                <CircleNotch size={14} weight="bold" className="animate-spin" />
              ) : (
                <FilePdf size={14} weight="bold" />
              )}
              {generatingPdf ? "Generating PDF…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPdfMeta(null);
                setQuoteDraft({ step: 0, reference: null, lines: [{ productId: "one-8-3", lengthMm: 1000, heightMm: 1000, quantity: 1 }], shipping: 0, preview: null });
              }}
              className="flex-1 py-2 border border-white/20 light:border-slate-300 text-white/50 light:text-slate-500 text-xs hover:bg-white/5"
            >
              New quote
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductStep({ lines, setProduct }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-white/40 light:text-slate-400">Select product for each line</p>
      {lines.map((line, i) => (
        <div key={i}>
          <label className="block text-[10px] text-white/50 light:text-slate-500 mb-1">Line {i + 1}</label>
          <select
            value={line.productId}
            onChange={(e) => setProduct(i, e.target.value)}
            className="w-full bg-black/30 light:bg-white border border-white/20 light:border-slate-300 px-2 py-1.5 text-xs text-white light:text-slate-900 focus:border-blue-500 focus:outline-none"
          >
            {OFFER_KP_PRODUCTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function DimensionsStep({ lines, setDim, addLine, removeLine }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-white/40 light:text-slate-400">Enter dimensions in mm</p>
      {lines.map((line, i) => {
        const product = OFFER_KP_PRODUCTS.find((p) => p.id === line.productId);
        return (
          <div key={i} className="border border-white/10 light:border-slate-200 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-white/70 light:text-slate-700">
                {product?.name ?? line.productId}
              </span>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-300">
                  <Trash size={11} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { field: "lengthMm", label: "L (mm)" },
                { field: "heightMm", label: "H (mm)" },
                { field: "quantity", label: "Qty" },
              ].map(({ field, label }) => (
                <label key={field} className="block">
                  <span className="text-[9px] text-white/40 light:text-slate-400">{label}</span>
                  <input
                    type="number"
                    min="1"
                    value={line[field]}
                    onChange={(e) => setDim(i, field, e.target.value)}
                    className="w-full bg-black/30 light:bg-white border border-white/20 light:border-slate-300 px-2 py-1 text-xs text-white light:text-slate-900 focus:border-blue-500 focus:outline-none mt-0.5"
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addLine}
        className="w-full py-1.5 border border-dashed border-white/20 light:border-slate-300 text-white/40 light:text-slate-400 hover:border-white/40 flex items-center justify-center gap-1.5 transition-colors"
      >
        <Plus size={11} /> Add line
      </button>
    </div>
  );
}

function PreviewStep({ preview, step, reference }) {
  const { t } = useTranslation("offerKp");
  return (
    <div className="space-y-2">
      {reference && (
        <p className="text-[10px] font-mono text-blue-400 light:text-blue-600 mb-2">
          {t("quote.reference", "Reference")}: {reference}
        </p>
      )}
      <ul className="space-y-1.5">
        {preview.lines?.map((line, i) => (
          <li key={i} className="bg-white/5 light:bg-slate-100 p-2">
            <div className="font-medium text-white/80 light:text-slate-800 text-[11px]">{line.productName}</div>
            <div className="text-[10px] text-white/50 light:text-slate-500 mt-0.5">
              {line.lengthMm}×{line.heightMm} mm · ×{line.quantity} · {line.surfaceM2} m²
              {line.surchargeMultiplier > 1 && ` · ×${line.surchargeMultiplier} surcharge`}
            </div>
            <div className="text-right font-mono text-[11px] text-white/70 light:text-slate-700 mt-1">
              {line.lineTotal} €
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 light:border-slate-200 pt-2 space-y-1 text-[10px] font-mono">
        <div className="flex justify-between text-white/50 light:text-slate-500">
          <span>{t("quote.subtotal")}</span><span>{preview.subtotal} €</span>
        </div>
        <div className="flex justify-between text-white/50 light:text-slate-500">
          <span>{t("quote.shipping")}</span><span>{preview.shipping} €</span>
        </div>
        <div className="flex justify-between font-semibold text-white light:text-slate-900">
          <span>{t("quote.total")}</span><span>{preview.total} €</span>
        </div>
      </div>
      {step >= 4 && (
        <p className="text-[10px] text-green-400 light:text-green-600 mt-2">
          ✓ Quote validated — ready to download or share
        </p>
      )}
    </div>
  );
}

function ShareStep({ reference }) {
  const [copied, setCopied] = useState(false);
  const url = reference
    ? `${window.location.origin}/share/${btoa(`offerKp-${reference}`).slice(0, 20)}`
    : null;

  function copy() {
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-white/40 light:text-slate-400">30-day read-only link for your client:</p>
      {url ? (
        <>
          <div className="bg-black/30 light:bg-slate-100 px-2 py-1.5 text-[10px] font-mono text-white/60 light:text-slate-600 break-all">
            {url}
          </div>
          <button
            type="button"
            onClick={copy}
            className="w-full py-1.5 bg-blue-600 text-white text-[11px] hover:bg-blue-700 transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
        </>
      ) : (
        <p className="text-[10px] text-white/30 light:text-slate-400">Validate the quote first to generate a share link.</p>
      )}
    </div>
  );
}
