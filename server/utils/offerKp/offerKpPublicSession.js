/**
 * In-memory история public-чата OfferKP (по sessionId) для enrich «какая цена?».
 */

const TTL_MS = Math.max(
  5 * 60 * 1000,
  parseInt(process.env.OFFER_KP_PUBLIC_SESSION_TTL_MS, 10) || 30 * 60 * 1000
);
const MAX_MESSAGES = Math.max(
  4,
  parseInt(process.env.OFFER_KP_PUBLIC_SESSION_MAX_MESSAGES, 10) || 20
);

/** @type {Map<string, { updatedAt: number, messages: object[] }>} */
const sessions = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > TTL_MS) sessions.delete(id);
  }
}

function getPublicChatHistory(sessionId) {
  if (!sessionId) return [];
  pruneExpired();
  const session = sessions.get(String(sessionId));
  if (!session) return [];
  return session.messages.map((m) => ({ ...m }));
}

function appendPublicChatMessage(sessionId, role, content) {
  if (!sessionId || !content) return;
  const id = String(sessionId);
  pruneExpired();
  const session = sessions.get(id) || { updatedAt: Date.now(), messages: [] };
  session.messages.push({ role, content: String(content) });
  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }
  session.updatedAt = Date.now();
  sessions.set(id, session);
}

function clearPublicChatSession(sessionId) {
  if (sessionId) sessions.delete(String(sessionId));
}

module.exports = {
  getPublicChatHistory,
  appendPublicChatMessage,
  clearPublicChatSession,
};
