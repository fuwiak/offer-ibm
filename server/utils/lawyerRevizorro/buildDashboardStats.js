const prisma = require("../prisma");
const { LAWYER_REVIZORRO_PRODUCTS } = require("./pricing");

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatEuro(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `€ ${Math.round(n).toLocaleString("fr-FR")}`;
}

function formatDelta(current, previous) {
  if (previous === 0) {
    return current > 0 ? { delta: `+${current}`, up: true } : { delta: "0", up: true };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct >= 0 ? "+" : "";
  return { delta: `${sign}${pct}%`, up: pct >= 0 };
}

function productLabelFromQuote(quote) {
  const line = quote.lines?.[0];
  if (!line) return "—";
  const product = LAWYER_REVIZORRO_PRODUCTS.find((p) => p.id === line.productId);
  if (product) return product.name.replace(/^lawyer-revizorro /, "");
  try {
    const preview = quote.previewJson ? JSON.parse(quote.previewJson) : null;
    const name = preview?.lines?.[0]?.productName;
    if (name) return name.replace(/^lawyer-revizorro /, "");
  } catch {
    /* ignore */
  }
  return line.productId || "—";
}

function formatQuoteRow(quote) {
  return {
    ref: quote.reference,
    partner: "—",
    product: productLabelFromQuote(quote),
    amount: formatEuro(quote.total),
    status: quote.status || "draft",
  };
}

function buildPipelineFromQuotes(quotes) {
  const counts = {};
  for (const q of quotes) {
    const s = q.status || "draft";
    counts[s] = (counts[s] || 0) + 1;
  }
  return [
    { stage: "Draft", count: counts.draft || 0, color: "#e0e0e0" },
    { stage: "Validated", count: counts.validated || 0, color: "#78a9ff" },
    { stage: "Won", count: counts.won || 0, color: "#42be65" },
    { stage: "Other", count: counts.other || 0, color: "#fa4d56" },
  ];
}

async function buildDashboardStats() {
  const now = new Date();
  const thisMonth = monthStart(now);
  const lastMonth = monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  const [quotes, partnerRequests] = await Promise.all([
    prisma.lawyerRevizorro_quotes.findMany({
      include: { lines: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.partner_requests.findMany({
      where: { createdAt: { gte: ytdStart } },
    }),
  ]);

  const quotesThisMonth = quotes.filter((q) => new Date(q.createdAt) >= thisMonth);
  const quotesLastMonth = quotes.filter(
    (q) =>
      new Date(q.createdAt) >= lastMonth && new Date(q.createdAt) < thisMonth
  );

  const pipelineValue = quotes
    .filter((q) => q.status !== "won" && q.total > 0)
    .reduce((s, q) => s + (q.total || 0), 0);

  const pipelineValueLast = quotesLastMonth
    .filter((q) => q.status !== "won")
    .reduce((s, q) => s + (q.total || 0), 0);

  const wonCount = quotes.filter((q) => q.status === "won").length;
  const conversionPct =
    quotes.length > 0 ? Math.round((wonCount / quotes.length) * 100) : 0;

  const qDelta = formatDelta(quotesThisMonth.length, quotesLastMonth.length);
  const revDelta = formatDelta(pipelineValue, pipelineValueLast);

  const recent = quotes.slice(0, 10).map(formatQuoteRow);

  const kpis = [
    {
      label: "Total quotes (month)",
      value: String(quotesThisMonth.length),
      ...qDelta,
    },
    {
      label: "Conversion rate",
      value: `${conversionPct}%`,
      delta: wonCount > 0 ? `+${wonCount} won` : "0 won",
      up: wonCount > 0,
    },
    {
      label: "Revenue pipeline",
      value: formatEuro(pipelineValue),
      ...revDelta,
    },
    {
      label: "New partners (YTD)",
      value: String(partnerRequests.length),
      delta: partnerRequests.length > 0 ? `+${partnerRequests.length}` : "0",
      up: true,
    },
  ];

  return {
    kpis,
    geo: [],
    pipeline: buildPipelineFromQuotes(quotes),
    recent,
    meta: {
      quotesCount: quotes.length,
    },
  };
}

module.exports = { buildDashboardStats };
