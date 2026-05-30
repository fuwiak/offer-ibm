/** Escape for use inside Markdown [text](url): bracket in text, parens in url. */
function mdLinkTitle(t) {
  return (t || "").replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function mapLinkLines(items, defaultTitle) {
  return items.map((s) => {
    const url = (s.chunkSource || "").replace(/^link:\/\//, "") || "";
    const title = s.title || defaultTitle;
    if (!url) return `- ${title}`;
    return `- [${mdLinkTitle(title)}](${url})`;
  });
}

/**
 * Блок со ссылками на внешние источники (ГАРАНТ, Яндекс, Google) в конце ответа.
 * @param {object[]} sources
 * @returns {string}
 */
function buildExternalLinksSection(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  const garantSources = arr.filter((s) => s.docSource === "ГАРАНТ");
  const yandexSources = arr.filter((s) => s.docSource === "Яндекс");
  const googleSources = arr.filter(
    (s) => s.docSource === "Google" || s.docSource === "Google (изображения)"
  );
  const parts = [];
  if (garantSources.length > 0) {
    parts.push(
      "---\n**Источники ГАРАНТ:**\n" +
        mapLinkLines(garantSources, "Источник ГАРАНТ").join("\n")
    );
  }
  if (yandexSources.length > 0) {
    parts.push(
      "---\n**Источники Яндекс:**\n" +
        mapLinkLines(yandexSources, "Источник Яндекс").join("\n")
    );
  }
  if (googleSources.length > 0) {
    parts.push(
      "---\n**Источники Google:**\n" +
        mapLinkLines(googleSources, "Источник Google").join("\n")
    );
  }
  if (parts.length === 0) return "";
  return "\n\n" + parts.join("\n\n");
}

/** Только внешние источники для блока цитирования в UI. */
function sourcesForResponse(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (s) =>
      s.docSource === "ГАРАНТ" ||
      s.docSource === "Яндекс" ||
      s.docSource === "Google" ||
      s.docSource === "Google (изображения)"
  );
}

module.exports = {
  mdLinkTitle,
  buildExternalLinksSection,
  sourcesForResponse,
};
