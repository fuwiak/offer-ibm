import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, UploadSimple, CheckCircle, ImageSquare } from "@phosphor-icons/react";
import { useOfferKp } from "@/contexts/OfferKpContext";

const ISSUE_TYPES = [
  { id: "breakage", label: "Glass breakage / damage" },
  { id: "seal", label: "Edge seal defect" },
  { id: "condensation", label: "Condensation inside unit" },
  { id: "delivery", label: "Delivery issue" },
  { id: "other", label: "Other" },
];

export default function SavModal({ onClose }) {
  const { t } = useTranslation("offerKp");
  const { addSavTicket, savTickets } = useOfferKp();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    issueType: "",
    orderRef: "",
    description: "",
  });
  const [photos, setPhotos] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  function handleFiles(e) {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - photos.length);
    const previews = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPhotos((prev) => [...prev, ...previews]);
  }

  function removePhoto(i) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.issueType || !form.description) return;
    const ticketId = `SAV-${new Date().getFullYear()}-${String(savTickets.length + 1).padStart(3, "0")}`;
    addSavTicket({
      id: ticketId,
      issueType: form.issueType,
      orderRef: form.orderRef,
      description: form.description,
      photoCount: photos.length,
    });
    setSubmitted(true);
    setTimeout(onClose, 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-zinc-900 light:bg-white border border-white/10 light:border-slate-200 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 light:border-slate-200 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-white light:text-slate-900">
              {t("sav.title", "After-sales request")}
            </h3>
            <p className="text-[11px] text-white/50 light:text-slate-500 mt-0.5">
              {t("sav.subtitle", "Our team will respond within 24 hours")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white light:text-slate-400">
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle size={40} className="text-green-400" weight="fill" />
            <p className="text-sm font-semibold text-white light:text-slate-900">
              {t("sav.submitted", "Ticket created")}
            </p>
            <p className="text-xs text-white/50 light:text-slate-500">
              {t("sav.submittedDetail", "Your after-sales ticket has been created and the admin team notified.")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Issue type */}
            <div>
              <label className="block text-xs text-white/60 light:text-slate-500 mb-1.5">
                {t("sav.issueType", "Issue type")} *
              </label>
              <div className="grid grid-cols-1 gap-1">
                {ISSUE_TYPES.map((type) => (
                  <label
                    key={type.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer border text-xs ${
                      form.issueType === type.id
                        ? "border-blue-500 bg-blue-600/10 text-white light:text-slate-900"
                        : "border-white/10 light:border-slate-200 text-white/60 light:text-slate-500 hover:border-white/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="issueType"
                      value={type.id}
                      className="sr-only"
                      onChange={(e) => setForm({ ...form, issueType: e.target.value })}
                    />
                    <span
                      className={`w-3 h-3 border flex items-center justify-center shrink-0 ${
                        form.issueType === type.id ? "border-blue-500 bg-blue-500" : "border-white/30"
                      }`}
                    >
                      {form.issueType === type.id && (
                        <span className="w-1.5 h-1.5 bg-white" />
                      )}
                    </span>
                    {type.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Order reference */}
            <div>
              <label className="block text-xs text-white/60 light:text-slate-500 mb-1.5">
                {t("sav.orderRef", "Order / Quote reference")}
              </label>
              <input
                type="text"
                value={form.orderRef}
                onChange={(e) => setForm({ ...form, orderRef: e.target.value })}
                placeholder="ORD-2025-012 or AV-2025-031"
                className="w-full bg-white/5 light:bg-slate-50 border border-white/10 light:border-slate-200 px-3 py-2 text-xs text-white light:text-slate-900 placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-white/60 light:text-slate-500 mb-1.5">
                {t("sav.description", "Description")} *
              </label>
              <textarea
                rows={3}
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("sav.descriptionPlaceholder", "Describe the issue in detail…")}
                className="w-full bg-white/5 light:bg-slate-50 border border-white/10 light:border-slate-200 px-3 py-2 text-xs text-white light:text-slate-900 placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {/* Photos */}
            <div>
              <label className="block text-xs text-white/60 light:text-slate-500 mb-1.5">
                {t("sav.photos", "Photos")} ({photos.length}/5)
              </label>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="w-14 h-14 object-cover border border-white/10"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1 -right-1 bg-red-600 text-white w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-14 h-14 flex flex-col items-center justify-center gap-1 border border-dashed border-white/20 light:border-slate-300 text-white/40 light:text-slate-400 hover:border-white/40 transition-colors"
                  >
                    <ImageSquare size={16} />
                    <span className="text-[9px]">Add</span>
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handleFiles}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-xs py-2.5 border border-white/20 light:border-slate-300 text-white/60 light:text-slate-600 hover:bg-white/5"
              >
                {t("sav.cancel", "Cancel")}
              </button>
              <button
                type="submit"
                disabled={!form.issueType || !form.description}
                className="flex-1 text-xs py-2.5 bg-[#0f62fe] text-white flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0353e9] transition-colors"
              >
                <UploadSimple size={13} />
                {t("sav.submit", "Submit ticket")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
