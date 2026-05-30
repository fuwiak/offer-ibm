const KPI = [
  { label: "Open quotes", value: "8", delta: "+2 this week" },
  { label: "Orders in progress", value: "3", delta: "2 shipping soon" },
  { label: "Pipeline value", value: "€ 42,800", delta: "+12% vs last month" },
  { label: "Active leads", value: "7", delta: "3 hot" },
];

const RECENT = [
  { ref: "AV-2024-031", partner: "Atelier Quadra", status: "Validated", amount: "€ 8,450" },
  { ref: "AV-2025-009", partner: "Cabinet Dupré BET", status: "In production", amount: "€ 7,850" },
  { ref: "ORD-2025-012", partner: "SAS De La Rosa", status: "Shipped", amount: "€ 3,420" },
];

export default function PartnerDashboard() {
  return (
    <div className="space-y-8 max-w-5xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPI.map((kpi) => (
          <div
            key={kpi.label}
            className="border border-theme-sidebar-border bg-theme-bg-primary p-4"
          >
            <p className="text-[10px] uppercase tracking-wide text-theme-text-secondary">
              {kpi.label}
            </p>
            <p className="text-2xl font-light text-theme-text-primary mt-1">
              {kpi.value}
            </p>
            <p className="text-xs text-theme-text-secondary mt-1">{kpi.delta}</p>
          </div>
        ))}
      </div>

      <div className="border border-theme-sidebar-border bg-theme-bg-primary p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary mb-4">
          Recent activity
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-theme-text-secondary border-b border-theme-sidebar-border">
              <th className="pb-2 font-medium">Reference</th>
              <th className="pb-2 font-medium">Partner</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {RECENT.map((row) => (
              <tr key={row.ref} className="border-b border-theme-sidebar-border last:border-0">
                <td className="py-3 font-mono text-theme-text-primary">{row.ref}</td>
                <td className="py-3 text-theme-text-primary">{row.partner}</td>
                <td className="py-3 text-theme-text-secondary">{row.status}</td>
                <td className="py-3 text-right font-mono text-theme-text-primary">
                  {row.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
