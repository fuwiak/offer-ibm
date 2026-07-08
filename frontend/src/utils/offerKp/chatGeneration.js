/** True while assistant reply is still being generated (stream or pre-token wait). */
export function isOfferKpGenerationActive(loadingResponse, chatHistory = []) {
  if (loadingResponse) return true;
  const last = chatHistory[chatHistory.length - 1];
  if (!last || last.role !== "assistant") return false;
  if (last.closed) return false;
  return Boolean(last.animate || last.pending);
}
