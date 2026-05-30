export const NOTIFICATION_TYPE_ICON = {
  new_message: "✉️",
  quote_expiry: "📄",
  order_shipped: "📦",
  commission_paid: "💰",
  sav_update: "🎧",
  token_usage: "🧮",
};

export function timeAgo(ms) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function mergeNotifications(serverList = [], localList = []) {
  const byId = new Map();
  for (const n of serverList) byId.set(n.id, n);
  for (const n of localList) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => b.at - a.at);
}
