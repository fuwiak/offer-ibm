import { useEffect, useState } from "react";
import LawyerRevizorroSuiteLayout from "@/layouts/LawyerRevizorroSuiteLayout";
import { useTranslation } from "react-i18next";
import LawyerRevizorro from "@/models/lawyerRevizorro";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const STATUS_STYLE = {
  validated: { label: "Validated", cl: "text-primary-button" },
  negotiation: { label: "Negotiation", cl: "text-yellow-600" },
  won: { label: "Won", cl: "text-green-600" },
  draft: { label: "Draft", cl: "text-theme-text-secondary" },
};

export default function LawyerRevizorroDashboard() {
  const { t } = useTranslation("lawyerRevizorro");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await LawyerRevizorro.getDashboardStats();
        if (!cancelled) setData(stats);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = data?.kpis ?? [];
  const geo = data?.geo ?? [];
  const pipeline = data?.pipeline ?? [];
  const recent = data?.recent ?? [];
  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

  return (
    <LawyerRevizorroSuiteLayout>
      <h1 className="lawyerRevizorro-suite-page-title">{t("admin.nav.dashboard")}</h1>
      <p className="text-sm text-theme-text-secondary mb-8 max-w-2xl">
        {t("admin.workspacesSubtitle")}
      </p>

      {error && (
        <p className="text-sm text-red-600 mb-4" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton.default key={i} height={88} className="rounded-none" />
            ))
          : kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="bg-theme-bg-primary border border-theme-sidebar-border p-4"
              >
                <p className="text-[10px] text-theme-text-secondary uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className="text-2xl font-light text-theme-text-primary mt-1">
                  {kpi.value}
                </p>
                <p
                  className={`text-xs mt-1 ${kpi.up ? "text-green-600" : "text-red-600"}`}
                >
                  {kpi.delta} vs last month
                </p>
              </div>
            ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-theme-bg-primary border border-theme-sidebar-border p-5">
          <h2 className="text-xs font-semibold text-theme-text-primary uppercase tracking-wide mb-4">
            Quotes by territory
          </h2>
          {loading ? (
            <Skeleton.default count={3} height={28} />
          ) : geo.length === 0 ? (
            <p className="text-xs text-theme-text-secondary">No quote geography yet.</p>
          ) : (
            <div className="space-y-3">
              {geo.map((g) => (
                <div key={g.country}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-theme-text-primary">
                      {g.icon} {g.country}
                    </span>
                    <span className="text-xs text-theme-text-secondary">
                      {g.quotes} quotes · {g.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-theme-bg-chat-input">
                    <div
                      className="h-full bg-primary-button"
                      style={{ width: `${g.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-theme-bg-primary border border-theme-sidebar-border p-5">
          <h2 className="text-xs font-semibold text-theme-text-primary uppercase tracking-wide mb-4">
            Sales pipeline
          </h2>
          {loading ? (
            <Skeleton.default count={5} height={28} />
          ) : (
            <div className="space-y-3">
              {pipeline.map((stage) => (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-theme-text-primary">{stage.stage}</span>
                    <span className="text-xs text-theme-text-secondary">{stage.count}</span>
                  </div>
                  <div className="h-1.5 bg-theme-bg-chat-input">
                    <div
                      className="h-full"
                      style={{
                        width: `${(stage.count / maxPipeline) * 100}%`,
                        background: stage.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-theme-bg-primary border border-theme-sidebar-border">
        <div className="px-5 py-4 border-b border-theme-sidebar-border">
          <h2 className="text-xs font-semibold text-theme-text-primary uppercase tracking-wide">
            Recent quotes
          </h2>
        </div>
        {loading ? (
          <div className="p-5">
            <Skeleton.default count={4} height={32} />
          </div>
        ) : recent.length === 0 ? (
          <p className="px-5 py-6 text-xs text-theme-text-secondary">
            No quotes yet.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-theme-sidebar-border">
                {["Reference", "Partner", "Product", "Amount", "Status"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-2.5 text-theme-text-secondary font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const st = STATUS_STYLE[row.status] ?? STATUS_STYLE.draft;
                return (
                  <tr
                    key={row.ref}
                    className="border-b border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
                  >
                    <td className="px-5 py-3 font-mono text-theme-text-primary">{row.ref}</td>
                    <td className="px-5 py-3 text-theme-text-secondary">{row.partner}</td>
                    <td className="px-5 py-3 text-theme-text-secondary">{row.product}</td>
                    <td className="px-5 py-3 font-mono text-theme-text-primary">{row.amount}</td>
                    <td className={`px-5 py-3 font-medium ${st.cl}`}>{st.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </LawyerRevizorroSuiteLayout>
  );
}
