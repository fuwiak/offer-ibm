/** Escape for Markdown [text](url). */
function mdLinkTitle(t) {
  return (t || "").replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function sourceUrl(source) {
  if (source?.url) return source.url;
  return String(source?.chunkSource || "").replace(/^link:\/\//, "");
}

function mapLinkLines(items, defaultTitle) {
  return items.map((s) => {
    const url = sourceUrl(s);
    const title = s.title || defaultTitle;
    if (!url) return `- ${title}`;
    return `- [${mdLinkTitle(title)}](${url})`;
  });
}

/**
 * Блок ссылок на внешние источники (ГАРАНТ, Яндекс, Google) в конце ответа.
 * @param {object[]} sources
 * @returns {string}
 */
function buildExternalLinksSection(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  const eliSources = arr.filter((s) => s.docSource === "ELI");
  const garantSources = arr.filter((s) => s.docSource === "ГАРАНТ");
  const yandexSources = arr.filter((s) => s.docSource === "Яндекс");
  const googleSources = arr.filter(
    (s) => s.docSource === "Google" || s.docSource === "Google (изображения)"
  );
  const searxngSources = arr.filter((s) => s.docSource === "SearXNG");
  const catalogSources = arr.filter((s) => s.docSource === "Каталог");
  const parts = [];
  // Sekcja ELI (polskie akty prawne — Dziennik Ustaw / Monitor Polski).
  if (eliSources.length > 0) {
    parts.push(
      "---\n**Źródła (ELI · api.sejm.gov.pl):**\n" +
        mapLinkLines(eliSources, "Akt prawny ELI").join("\n")
    );
  }
  if (catalogSources.length > 0) {
    const tableSet = new Set();
    for (const s of catalogSources) {
      for (const t of s.shopDbTables || []) tableSet.add(t);
    }
    const tablesNote =
      tableSet.size > 0
        ? `\n_Таблицы БД: ${[...tableSet].sort().join(", ")}._`
        : "";
    parts.push(
      "---\n**Источники каталога (MySQL):**\n" +
        mapLinkLines(catalogSources, "Товар каталога").join("\n") +
        tablesNote
    );
  }
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
  if (searxngSources.length > 0) {
    parts.push(
      "---\n**Веб-источники (SearXNG, резерв):**\n" +
        mapLinkLines(searxngSources, "Веб-источник").join("\n")
    );
  }
  if (parts.length === 0) return "";
  return "\n\n" + parts.join("\n\n");
}

module.exports = {
  buildExternalLinksSection,
  sourceUrl,
};
