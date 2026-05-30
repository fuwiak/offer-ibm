import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import { UploadSimple, CheckCircle, Package, Truck, FileText } from "@phosphor-icons/react";

const ORDERS = [
  {
    id: "ORD-2025-012",
    partner: "Atelier Quadra (FR)",
    lines: [
      { product: "offer-kp One 8.3", dims: "1200×900 mm", qty: 10 },
      { product: "offer-kp Diamond", dims: "800×600 mm", qty: 5 },
    ],
    status: "confirmed",
    receivedAt: "2025-05-14",
  },
  {
    id: "ORD-2025-009",
    partner: "Cabinet Dupré BET (CH)",
    lines: [{ product: "offer-kp Hybrid", dims: "1500×1200 mm", qty: 8 }],
    status: "in_production",
    receivedAt: "2025-05-08",
  },
];

const DOC_TYPES = [
  { id: "pi", label: "Proforma Invoice (PI)", accept: ".pdf,.xlsx" },
  { id: "invoice", label: "Commercial Invoice", accept: ".pdf" },
  { id: "bl", label: "Bill of Lading (BL)", accept: ".pdf" },
];

const STATUS_OPTIONS = [
  { id: "confirmed", label: "Order confirmed" },
  { id: "in_production", label: "In production" },
  { id: "quality_check", label: "Quality check" },
  { id: "ready_to_ship", label: "Ready to ship" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
];

function StatusBadge({ status }) {
  const STYLE = {
    confirmed: "bg-blue-600/15 text-blue-400 light:text-blue-600",
    in_production: "bg-yellow-500/15 text-yellow-400 light:text-yellow-600",
    quality_check: "bg-orange-500/15 text-orange-400 light:text-orange-600",
    ready_to_ship: "bg-purple-500/15 text-purple-400 light:text-purple-600",
    shipped: "bg-teal-500/15 text-teal-400 light:text-teal-600",
    delivered: "bg-green-500/15 text-green-400 light:text-green-600",
  };
  const LABEL = {
    confirmed: "Confirmed",
    in_production: "In production",
    quality_check: "Quality check",
    ready_to_ship: "Ready to ship",
    shipped: "Shipped",
    delivered: "Delivered",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 font-medium ${STYLE[status] ?? ""}`}>
      {LABEL[status] ?? status}
    </span>
  );
}

export default function SupplierWorkflow() {
  const [orders, setOrders] = useState(ORDERS);
  const [selectedId, setSelectedId] = useState(ORDERS[0].id);
  const [uploads, setUploads] = useState({});
  const [statusUpdated, setStatusUpdated] = useState(null);
  const fileRefs = useRef({});

  const selected = orders.find((o) => o.id === selectedId);

  function handleUpload(docType, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploads((prev) => ({
      ...prev,
      [`${selectedId}-${docType}`]: { name: file.name, at: new Date().toLocaleTimeString() },
    }));
  }

  function handleStatusUpdate(newStatus) {
    setOrders((prev) =>
      prev.map((o) => (o.id === selectedId ? { ...o, status: newStatus } : o))
    );
    setStatusUpdated(selectedId);
    setTimeout(() => setStatusUpdated(null), 2000);
  }

  return (
    <div className="min-h-screen bg-theme-bg-container flex">
      {/* Order list */}
      <aside className="w-64 shrink-0 bg-theme-bg-primary border-r border-white/10 light:border-slate-200 flex flex-col">
        <div className="px-4 py-5 border-b border-white/10 light:border-slate-200">
          <Link to={paths.home()} className="text-[10px] text-blue-400 hover:text-blue-300 light:text-blue-600">
            ← Back to app
          </Link>
          <h1 className="text-sm font-semibold text-white light:text-slate-900 mt-2">
            LandVac Supplier Portal
          </h1>
          <p className="text-[10px] text-white/40 light:text-slate-500 mt-0.5">
            Orders pending action
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedId(order.id)}
              className={`w-full text-left px-4 py-3 border-b border-white/5 light:border-slate-100 transition-colors ${
                selectedId === order.id
                  ? "bg-white/5 light:bg-slate-50 border-l-2 border-l-blue-500"
                  : "hover:bg-white/3 light:hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-white light:text-slate-900">{order.id}</span>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-[10px] text-white/50 light:text-slate-500">{order.partner}</p>
              <p className="text-[10px] text-white/30 light:text-slate-400 mt-0.5">{order.receivedAt}</p>
            </button>
          ))}
        </div>
      </aside>

      {/* Detail panel */}
      {selected && (
        <main className="flex-1 p-6 space-y-6 overflow-y-auto max-w-2xl">
          {/* Order header */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-white light:text-slate-900">{selected.id}</h2>
              <StatusBadge status={selected.status} />
            </div>
            <p className="text-xs text-white/50 light:text-slate-500">{selected.partner} · received {selected.receivedAt}</p>
          </div>

          {/* Order lines */}
          <div className="bg-theme-bg-primary border border-white/10 light:border-slate-200">
            <div className="px-4 py-3 border-b border-white/10 light:border-slate-200 flex items-center gap-2">
              <Package size={14} className="text-white/50 light:text-slate-400" />
              <span className="text-xs font-semibold text-white light:text-slate-900 uppercase tracking-wide">
                Order lines
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 light:border-slate-100">
                  {["Product", "Dimensions", "Qty"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-white/40 light:text-slate-400 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((line, i) => (
                  <tr key={i} className="border-b border-white/5 light:border-slate-50">
                    <td className="px-4 py-2.5 text-white/80 light:text-slate-700">{line.product}</td>
                    <td className="px-4 py-2.5 font-mono text-white/60 light:text-slate-500">{line.dims}</td>
                    <td className="px-4 py-2.5 text-white/70 light:text-slate-600">×{line.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Document upload */}
          <div className="bg-theme-bg-primary border border-white/10 light:border-slate-200">
            <div className="px-4 py-3 border-b border-white/10 light:border-slate-200 flex items-center gap-2">
              <FileText size={14} className="text-white/50 light:text-slate-400" />
              <span className="text-xs font-semibold text-white light:text-slate-900 uppercase tracking-wide">
                Upload shipping documents
              </span>
            </div>
            <div className="p-4 space-y-3">
              {DOC_TYPES.map((doc) => {
                const key = `${selectedId}-${doc.id}`;
                const uploaded = uploads[key];
                return (
                  <div key={doc.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-white/70 light:text-slate-700">{doc.label}</p>
                      {uploaded && (
                        <p className="text-[10px] text-green-400 light:text-green-600 mt-0.5">
                          ✓ {uploaded.name} — {uploaded.at}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileRefs.current[doc.id]?.click()}
                      className={`text-[11px] px-3 py-1.5 flex items-center gap-1.5 shrink-0 ${
                        uploaded
                          ? "bg-green-600/20 text-green-400 light:text-green-600"
                          : "bg-white/10 light:bg-slate-100 text-white/70 light:text-slate-600 hover:bg-white/20 light:hover:bg-slate-200"
                      }`}
                    >
                      {uploaded ? <CheckCircle size={12} /> : <UploadSimple size={12} />}
                      {uploaded ? "Uploaded" : "Upload"}
                    </button>
                    <input
                      ref={(el) => (fileRefs.current[doc.id] = el)}
                      type="file"
                      accept={doc.accept}
                      className="sr-only"
                      onChange={(e) => handleUpload(doc.id, e)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status update */}
          <div className="bg-theme-bg-primary border border-white/10 light:border-slate-200">
            <div className="px-4 py-3 border-b border-white/10 light:border-slate-200 flex items-center gap-2">
              <Truck size={14} className="text-white/50 light:text-slate-400" />
              <span className="text-xs font-semibold text-white light:text-slate-900 uppercase tracking-wide">
                Update production status
              </span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const isCurrent = selected.status === opt.id;
                const isUpdated = statusUpdated === selectedId && isCurrent;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleStatusUpdate(opt.id)}
                    className={`text-[11px] py-2 px-3 text-left flex items-center gap-2 transition-colors border ${
                      isCurrent
                        ? "border-blue-500 bg-blue-600/15 text-blue-400 light:text-blue-600"
                        : "border-white/10 light:border-slate-200 text-white/50 light:text-slate-500 hover:border-white/30 hover:bg-white/5"
                    }`}
                  >
                    {isUpdated && <CheckCircle size={11} className="text-green-400 shrink-0" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
