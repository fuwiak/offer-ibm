const prisma = require("../utils/prisma");

const MS_DAY = 86400000;
const EXPIRY_WINDOW_MS = 7 * MS_DAY;

function formatQuoteExpiry(link) {
  const ref = link.quote?.reference || "Quote";
  const days = Math.max(
    1,
    Math.ceil((new Date(link.expiresAt).getTime() - Date.now()) / MS_DAY)
  );
  return {
    id: `quote-expiry-${link.id}`,
    type: "quote_expiry",
    message: `Quote ${ref} link expires in ${days} day${days === 1 ? "" : "s"}`,
    read: false,
    at: new Date(link.expiresAt).getTime(),
    href: "/",
    quoteId: link.quoteId,
  };
}

function formatQuoteValidated(quote) {
  const age =
    Date.now() - new Date(quote.lastUpdatedAt || quote.createdAt).getTime();
  const expiring = age > 25 * MS_DAY;
  return {
    id: `quote-val-${quote.id}`,
    type: "quote_expiry",
    message: expiring
      ? `Quote ${quote.reference} expires soon — follow up with the client`
      : `Quote ${quote.reference} validated and ready to share`,
    read: age > 2 * MS_DAY,
    at: new Date(quote.lastUpdatedAt || quote.createdAt).getTime(),
    href: "/",
  };
}

function formatCommissionQuote(quote) {
  return {
    id: `commission-quote-${quote.id}`,
    type: "commission_paid",
    message: `Commission available for quote ${quote.reference} (${quote.total ?? "—"} €)`,
    read:
      Date.now() -
        new Date(quote.lastUpdatedAt || quote.createdAt).getTime() >
      3 * MS_DAY,
    at: new Date(quote.lastUpdatedAt || quote.createdAt).getTime(),
    href: "/dashboard",
  };
}

function demoNotifications() {
  const now = Date.now();
  return [
    {
      id: "demo-quote-1",
      type: "quote_expiry",
      message: "Quote AV-2024-031 validated and ready to share",
      read: false,
      at: now - 5 * 3600e3,
      href: "/",
    },
    {
      id: "demo-comm-1",
      type: "commission_paid",
      message: "Commission available for quote AV-2024-028 (€ 1,240)",
      read: true,
      at: now - 3 * MS_DAY,
      href: "/dashboard",
    },
  ];
}

function parseChatResponse(response) {
  if (!response || typeof response !== "string") return {};
  try {
    return JSON.parse(response);
  } catch {
    return {};
  }
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatMoneyUsd(value = 0) {
  return Number(value || 0).toFixed(4);
}

function buildUsageNotifications(chats = [], nowTs = Date.now()) {
  const dayStart = startOfDay(nowTs);
  const bucketMs = 8 * 60 * 60 * 1000;
  const elapsed = Math.max(0, nowTs - dayStart);
  const completedBuckets = Math.min(3, Math.floor(elapsed / bucketMs));
  if (completedBuckets <= 0) return [];

  const normalized = chats.map((chat) => {
    const parsed = parseChatResponse(chat.response);
    const metrics = parsed?.metrics || {};
    const promptTokens = Number(metrics.prompt_tokens || 0);
    const completionTokens = Number(metrics.completion_tokens || 0);
    const totalTokens = Number(metrics.total_tokens || promptTokens + completionTokens);
    const costUsd = Number(metrics?.cost?.usdTotal || 0);
    return {
      createdAt: new Date(chat.createdAt).getTime(),
      totalTokens,
      costUsd,
    };
  });

  const notifications = [];
  for (let bucket = 1; bucket <= completedBuckets; bucket++) {
    const bucketEnd = dayStart + bucket * bucketMs;
    const dayStats = normalized.reduce(
      (acc, entry) => {
        if (entry.createdAt <= bucketEnd) {
          acc.tokens += entry.totalTokens;
          acc.costUsd += entry.costUsd;
        }
        return acc;
      },
      { tokens: 0, costUsd: 0 }
    );

    notifications.push({
      id: `token-usage-${dayStart}-${bucket}`,
      type: "token_usage",
      message: `Token usage (today, ${String(bucket * 8).padStart(2, "0")}:00): ${dayStats.tokens.toLocaleString("en-US")} tokens · $${formatMoneyUsd(dayStats.costUsd)}`,
      read: bucket !== completedBuckets,
      at: bucketEnd,
      href: "/notifications",
    });
  }

  return notifications;
}

const OfferKpNotifications = {
  /**
   * Quotes, share links, token usage — no inbound mailbox.
   */
  async list({ limit = 20, userId = null, role = "admin" } = {}) {
    const items = [];
    const perSource = Math.max(3, Math.ceil(limit / 3));

    const soon = new Date(Date.now() + EXPIRY_WINDOW_MS);
    const links = await prisma.offerKp_share_links.findMany({
      where: { expiresAt: { lte: soon, gt: new Date() } },
      include: { quote: { select: { reference: true } } },
      orderBy: { expiresAt: "asc" },
      take: perSource,
    });
    for (const link of links) {
      items.push(formatQuoteExpiry(link));
    }

    const quoteWhere =
      role === "admin" ? {} : userId ? { userId: Number(userId) } : {};

    const quotes = await prisma.offerKp_quotes.findMany({
      where: quoteWhere,
      orderBy: { lastUpdatedAt: "desc" },
      take: 10,
    });

    for (const q of quotes) {
      if (q.status === "validated") items.push(formatQuoteValidated(q));
      if (q.status === "won") items.push(formatCommissionQuote(q));
    }

    const todayStart = new Date(startOfDay(Date.now()));
    const chatWhere =
      role === "admin"
        ? { createdAt: { gte: todayStart }, include: true }
        : {
            createdAt: { gte: todayStart },
            include: true,
            user_id: userId ? Number(userId) : -1,
          };
    const chats = await prisma.workspace_chats.findMany({
      where: chatWhere,
      select: { createdAt: true, response: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    items.push(...buildUsageNotifications(chats));

    const seen = new Set();
    const merged = items
      .filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);

    if (merged.length === 0) return demoNotifications();
    return merged;
  },

  async markAllRead() {
    return { count: 0 };
  },
};

module.exports = { OfferKpNotifications };
