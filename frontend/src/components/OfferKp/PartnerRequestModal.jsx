import { useState } from "react";
import { useTranslation } from "react-i18next";
import OfferKp from "@/models/offerKp";

export default function PartnerRequestModal({ isOpen, onClose }) {
  const { t } = useTranslation("offerKp");
  const [form, setForm] = useState({
    company: "",
    email: "",
    country: "",
    message: "",
  });
  const [status, setStatus] = useState(null);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    const result = await OfferKp.submitPartnerRequest(form);
    setStatus(result.success ? "success" : "error");
    if (result.success) {
      setTimeout(() => {
        onClose();
        setStatus(null);
        setForm({ company: "", email: "", country: "", message: "" });
      }, 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white text-slate-900 p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">{t("bot.partnerModalTitle")}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            {t("bot.company")}
            <input
              required
              className="w-full border border-slate-300 mt-1 px-3 py-2 text-sm"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {t("bot.email")}
            <input
              type="email"
              required
              className="w-full border border-slate-300 mt-1 px-3 py-2 text-sm"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {t("bot.country")}
            <input
              className="w-full border border-slate-300 mt-1 px-3 py-2 text-sm"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {t("bot.message")}
            <textarea
              rows={3}
              className="w-full border border-slate-300 mt-1 px-3 py-2 text-sm"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </label>
          {status === "success" && (
            <p className="text-sm text-green-700">{t("bot.submitSuccess")}</p>
          )}
          {status === "error" && (
            <p className="text-sm text-red-600">{t("bot.submitError")}</p>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === "loading"}
              className="text-sm px-4 py-2 bg-[#0f62fe] text-white"
            >
              {t("bot.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
