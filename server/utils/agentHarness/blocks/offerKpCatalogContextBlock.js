const { BaseBlock } = require("../BaseBlock");
const {
  enrichUserPromptWithShopCatalog,
  hasCatalogBlocks,
  extractCatalogBlocksFromText,
  stripCatalogSection,
} = require("../../offerKp/catalogPrompt");
const { layerGuidelines } = require("../../../config/offerKp.harnessAntiHallucination");
const {
  gradeCatalogEvidence,
  shouldAbstainFromEvidence,
  ensurePdfInquiryEvidence,
} = require("../../offerKp/harnessEvidence");

function isUserChatMessage(message) {
  const from = String(message?.from || message?.role || "")
    .trim()
    .toUpperCase();
  return from === "USER" || from === "HUMAN";
}

/**
 * Гарантирует, что агент видит каталог в user prompt и не отрицает его наличие.
 */
class OfferKpCatalogContextBlock extends BaseBlock {
  constructor() {
    super("offerKp-catalog-context");
  }

  #catalogOptions(harness) {
    const invocation = harness.ctx.invocation || {};
    return {
      workspace: harness.ctx.workspace,
      userId: invocation.user_id ?? null,
      threadId: invocation.thread_id ?? null,
      maxDocs: harness.state.get("catalogMaxDocs") || 5,
      agentMode: true,
    };
  }

  #recordEvidenceGrade(harness, blocks, question, pdfInquiry = false) {
    const gradeResult = gradeCatalogEvidence(blocks, { question, pdfInquiry });
    harness.state.set("evidenceGrade", gradeResult.grade);
    harness.state.set("evidenceReason", gradeResult.reason);
    harness.state.set("catalogBlockCount", gradeResult.blockCount);

    if (shouldAbstainFromEvidence(gradeResult, undefined, { pdfInquiry })) {
      const existing = harness.state.get("contextGuidelines") || [];
      const abstainRules = layerGuidelines("abstain");
      harness.state.set("contextGuidelines", [
        ...existing,
        ...abstainRules.filter((g) => !existing.includes(g)),
      ]);
      harness.state.set("catalogEvidenceThin", true);
    } else {
      harness.state.delete("catalogEvidenceThin");
    }

    return gradeResult;
  }

  async #enrichPrompt(prompt, harness, { widen = false } = {}) {
    const question = stripCatalogSection(prompt);
    if (!question) return prompt;

    const pdfInquiry = await ensurePdfInquiryEvidence(harness);
    const baseMax = harness.state.get("catalogMaxDocs") || 5;
    const hops = harness.state.get("cragHops") || 0;
    const maxDocs = widen ? Math.min(baseMax + hops * 3, 12) : baseMax;

    const enriched = await enrichUserPromptWithShopCatalog(
      question,
      { ...this.#catalogOptions(harness), maxDocs }
    );
    const blocks = extractCatalogBlocksFromText(enriched);
    if (hasCatalogBlocks(blocks) && enriched !== prompt) {
      harness.state.set("catalogInjected", true);
      this.#recordEvidenceGrade(harness, blocks, question, pdfInquiry);
    } else if (blocks.length || pdfInquiry) {
      this.#recordEvidenceGrade(harness, blocks, question, pdfInquiry);
    }
    return enriched;
  }

  async #enrichLastUserMessage(harness, { widen = false } = {}) {
    const chats = harness.aibitat?._chats;
    if (!Array.isArray(chats) || !chats.length) return false;

    for (let i = chats.length - 1; i >= 0; i--) {
      const entry = chats[i];
      if (!isUserChatMessage(entry)) continue;

      const raw = String(entry.content || "").trim();
      if (!raw) return false;

      const enriched = await this.#enrichPrompt(raw, harness, { widen });
      if (enriched !== raw) {
        entry.content = enriched;
        return true;
      }
      return false;
    }

    return false;
  }

  #ensureCatalogGuideline(harness) {
    const marker =
      "В текущем сообщении пользователя уже есть блоки [Каталог · purolat.com] с ценами и наличием — используй их для КП. Не пиши, что каталог не передан.";
    const retrieveRules = layerGuidelines("retrieve");
    const existing = harness.state.get("contextGuidelines") || [];
    const merged = [...existing];
    for (const rule of [marker, ...retrieveRules]) {
      if (!merged.includes(rule)) merged.push(rule);
    }
    harness.state.set("contextGuidelines", merged);
  }

  async install(harness) {
    const workspace = harness.ctx.workspace;
    if (!workspace?.id) return;

    const invocation = harness.ctx.invocation;
    const prompt = String(invocation?.prompt || "")
      .replace(/^@agent\s*/i, "")
      .trim() ||
      String(harness.aibitat?._chats?.at(-1)?.content || "").trim();

    if (prompt) {
      const enriched = await this.#enrichPrompt(prompt, harness);
      if (hasCatalogBlocks(extractCatalogBlocksFromText(enriched))) {
        this.#ensureCatalogGuideline(harness);
        harness.log("catalog context confirmed for agent", {
          promptLen: enriched.length,
        });
      }
    }

    const aibitat = harness.aibitat;
    if (!aibitat || typeof aibitat.reply !== "function") return;

    const originalReply = aibitat.reply.bind(aibitat);
    aibitat.reply = async (route) => {
      const thresholds = harness.state.get("antiHallucinationThresholds");
      const needsRefine = harness.state.get("cragNeedsRefine");
      const hops = harness.state.get("cragHops") || 0;
      const widen =
        Boolean(needsRefine) &&
        thresholds &&
        hops < thresholds.maxCragHops;

      if (widen) {
        harness.state.set("cragHops", hops + 1);
        harness.log("CRAG refine: widening catalog retrieval", { hop: hops + 1 });
      }

      const injected = await this.#enrichLastUserMessage(harness, { widen });
      if (injected) {
        this.#ensureCatalogGuideline(harness);
        harness.log("catalog injected before agent reply", {
          cragHop: harness.state.get("cragHops") || 0,
          evidenceGrade: harness.state.get("evidenceGrade"),
        });
      }
      return originalReply(route);
    };
  }
}

module.exports = { OfferKpCatalogContextBlock };
