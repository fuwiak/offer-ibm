const { BaseBlock } = require("../BaseBlock");
const {
  allAntiHallucinationGuidelines,
} = require("../../../config/offerKp.harnessAntiHallucination");

const DEFAULT_MAX_CONTEXT_CHARS = 120_000;

/**
 * Context manager: layers document context and optional guidelines before each LLM turn.
 */
class ContextManagerBlock extends BaseBlock {
  constructor({ maxContextChars = DEFAULT_MAX_CONTEXT_CHARS } = {}) {
    super("context-manager");
    this.maxContextChars = maxContextChars;
  }

  async install(harness) {
    const existing = harness.state.get("contextGuidelines") || [];
    const contract = allAntiHallucinationGuidelines();
    harness.state.set("contextGuidelines", [
      ...existing,
      ...contract.filter((g) => !existing.includes(g)),
    ]);

    const aibitat = harness.aibitat;
    const previous = aibitat.fetchParsedFileContext;
    const maxChars =
      harness.state.get("maxContextChars") ||
      harness.ctx.modelPreset?.maxContextChars?.() ||
      this.maxContextChars;

    aibitat.fetchParsedFileContext = async () => {
      const baseContext =
        typeof previous === "function" ? await previous() : "";
      const merged = await harness.runPipeline("context", { baseContext });
      return this.#trimContext(String(merged ?? baseContext), maxChars);
    };
  }

  async buildContext({ baseContext = "" }, harness) {
    const guidelines = harness.state.get("contextGuidelines") || [];
    if (!guidelines.length) {
      return { context: baseContext };
    }

    const block =
      "\n\n<harness_guidelines>\n" +
      guidelines.map((g) => `- ${g}`).join("\n") +
      "\n</harness_guidelines>";

    return { context: `${baseContext}${block}` };
  }

  #trimContext(text, maxContextChars = this.maxContextChars) {
    if (text.length <= maxContextChars) return text;
    const head = text.slice(0, Math.floor(maxContextChars * 0.7));
    const tail = text.slice(-Math.floor(maxContextChars * 0.25));
    return `${head}\n\n[... context truncated by harness ...]\n\n${tail}`;
  }
}

module.exports = { ContextManagerBlock };
