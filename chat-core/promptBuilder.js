function buildCurrentDatePreamble() {
  const tz = process.env.CHAT_SYSTEM_DATE_TZ || "Europe/Moscow";
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: tz,
  }).format(now);
  return `Текущая дата и время: ${formatted}. Часовой пояс: ${tz}.`;
}

function buildLegalSourcePriorityInstructions() {
  const hasGarant = !!process.env.GARANT_TOKEN;
  const hasWeb =
    !!process.env.YANDEX_SEARCH_API_KEY || !!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  if (!hasGarant && !hasWeb) return "";

  const lines = [
    "Правила приоритета источников:",
    hasGarant
      ? "- При наличии релевантных материалов ГАРАНТ используй как первичный источник."
      : null,
    hasWeb
      ? "- Веб-источники (Яндекс/Google) используй как вспомогательные."
      : null,
    hasGarant && hasWeb
      ? "- При конфликте данных следуй ГАРАНТ, а расхождение с вебом явно отмечай."
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function appendPromptGuards(basePrompt = "") {
  return [
    buildCurrentDatePreamble(),
    buildLegalSourcePriorityInstructions(),
    basePrompt,
  ]
    .filter(Boolean)
    .join("\n\n");
}

module.exports = {
  appendPromptGuards,
  buildCurrentDatePreamble,
  buildLegalSourcePriorityInstructions,
};
