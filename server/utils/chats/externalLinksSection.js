"use strict";

/**
 * Builds the external-links markdown block appended after every LLM response.
 * Re-exports the canonical implementation from garant/linksFooter so that
 * all callers can import from one place.
 *
 * Signature:
 *   buildExternalLinksSection(sources: object[]) → string
 *
 * Sources are filtered by `docSource` field:
 *   - "ГАРАНТ"                    → ГАРАНТ block
 *   - "Яндекс"                    → Яндекс block
 *   - "Google" / "Google (изображения)" → Google block
 */
const {
  buildExternalLinksSection,
  sourceUrl,
} = require("../garant/linksFooter");

module.exports = { buildExternalLinksSection, sourceUrl };
