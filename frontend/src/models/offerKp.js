import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import i18n from "@/i18n";

async function offerKpFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...baseHeaders(),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const err = new Error(data.error || "Session expired. Please sign in again.");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    throw new Error(data.error || res.statusText || "Request failed");
  }
  return data;
}

const OfferKp = {
  async config() {
    const res = await fetch(`${API_BASE}/offerKp/config`);
    if (!res.ok) throw new Error("Failed to load offer-kp config");
    return res.json();
  },

  async submitPartnerRequest(data) {
    const res = await fetch(`${API_BASE}/offerKp/partner-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async listNotifications() {
    return offerKpFetch(`${API_BASE}/offerKp/notifications`);
  },

  async markAllNotificationsRead() {
    return offerKpFetch(`${API_BASE}/offerKp/notifications/read-all`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async getDashboardStats() {
    return offerKpFetch(`${API_BASE}/offerKp/dashboard/stats`);
  },

  async previewQuote(lines, shipping = 0) {
    const res = await fetch(`${API_BASE}/offerKp/quotes/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, shipping }),
    });
    if (!res.ok) throw new Error("Preview failed");
    return res.json();
  },

  async generateQuotePdf(quoteData) {
    return offerKpFetch(`${API_BASE}/offerKp/quotes/pdf`, {
      method: "POST",
      body: JSON.stringify(quoteData),
    });
  },

  quotePdfDownloadUrl(storageFilename) {
    return `${API_BASE}/offerKp/quotes/pdf/${encodeURIComponent(storageFilename)}`;
  },

  streamPublicChat(message, sessionId, onChunk, onDone) {
    const controller = new AbortController();
    fetch(`${API_BASE}/offerKp/public/stream-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId,
        // Jawny język interfejsu — serwer wybiera źródło prawne (pl → ELI API).
        language: i18n?.language || null,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (
                (data.type === "textResponse" || data.type === "textResponseChunk") &&
                data.textResponse
              ) {
                onChunk(data.textResponse);
              }
              if (data.close || data.type === "finalizeResponseStream") {
                onDone(data);
              }
            } catch {
              /* ignore partial JSON */
            }
          }
        }
        onDone(null);
      })
      .catch((err) => onDone({ error: err.message }));

    return () => controller.abort();
  },
};

export default OfferKp;
