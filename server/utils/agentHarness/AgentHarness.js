const { BaseBlock } = require("./BaseBlock");
const { harnessLog } = require("./harnessLog");

const PIPELINE_HOOKS = {
  toolApproval: "beforeToolApproval",
  context: "buildContext",
  turnStart: "beforeTurn",
  turnEnd: "afterTurn",
};

/**
 * Composable harness around AIbitat: blocks add tools policy, context, memory, orchestration.
 */
class AgentHarness {
  /**
   * @param {{ aibitat: object, ctx?: object }} options
   */
  constructor({ aibitat, ctx = {} }) {
    this.aibitat = aibitat;
    this.ctx = ctx;
    /** @type {BaseBlock[]} */
    this.blocks = [];
    /** @type {Map<string, unknown>} */
    this.state = new Map();
  }

  /** @param {BaseBlock} block */
  use(block) {
    if (!(block instanceof BaseBlock)) {
      throw new TypeError("AgentHarness.use() expects a BaseBlock instance");
    }
    this.blocks.push(block);
    return this;
  }

  listBlocks() {
    return this.blocks.map((b) => b.name);
  }

  log(message, meta = null) {
    harnessLog("info", message, meta);
    const fn = this.ctx.log;
    if (typeof fn === "function") {
      fn(`[AgentHarness] ${message}`, meta);
    }
  }

  /**
   * Run a named pipeline across blocks.
   * @param {"toolApproval"|"context"|"turnStart"|"turnEnd"} kind
   * @param {object} payload
   */
  async runPipeline(kind, payload = {}) {
    const hookName = PIPELINE_HOOKS[kind];
    if (!hookName) return null;

    harnessLog("info", `pipeline.${kind}`, {
      skillName: payload.skillName || null,
      blockCount: this.blocks.length,
    });

    if (kind === "context") {
      let baseContext = payload.baseContext ?? "";
      for (const block of this.blocks) {
        const fn = block[hookName];
        if (typeof fn !== "function") continue;
        // .call(block, …): хук должен видеть this === block (иначе падают
        // приватные методы, например this.#evaluate в inquiry-quality).
        const result = await fn.call(block, { baseContext }, this);
        if (result?.context !== undefined) {
          baseContext = result.context;
        }
      }
      return baseContext;
    }

    for (const block of this.blocks) {
      const fn = block[hookName];
      if (typeof fn !== "function") continue;
      const result = await fn.call(block, payload, this);
      if (kind === "toolApproval" && result?.handled) {
        return result;
      }
    }
    return null;
  }

  async resolveToolApproval(params) {
    const decision = await this.runPipeline("toolApproval", params);
    if (!decision?.handled) return null;
    return {
      approved: Boolean(decision.approved),
      message: decision.message || "Handled by agent harness.",
    };
  }

  /**
   * Финальный текст агента в чат: цены только из ShopDB.
   * Есть черновик заявки → выдуманная таблица заменяется на
   * buildQuoteMarkdownFromDraft (та же политика, что для create-docx/pdf).
   * Черновика нет → выдуманные цены переписываются в «под заказ».
   * @param {string} content
   * @returns {string}
   */
  sanitizeOutgoingChat(content) {
    const text = typeof content === "string" ? content : "";
    if (!text.includes("|")) return content;

    try {
      const {
        validateQuotePricesFromDb,
        sanitizeQuotePricesToShopDb,
      } = require("../offerKp/quoteDbPriceGate");
      const {
        collectCatalogBlocksFromHarness,
      } = require("../offerKp/harnessEvidence");

      const draft = this.state.get("inquiryDbDraft") || null;
      const catalogBlocks = collectCatalogBlocksFromHarness(this);

      if (draft?.lines?.length) {
        const check = validateQuotePricesFromDb(text, { draft, catalogBlocks });
        if (check.ok) return text;

        const {
          buildQuoteMarkdownFromDraft,
        } = require("../offerKp/inquiryDraftPrompt");
        const forced = buildQuoteMarkdownFromDraft(draft);
        if (!forced) return text;

        harnessLog("warn", "outgoingChat.forcedDraftMarkdown", {
          violations: check.violations.map((v) => v.id),
          draftLines: draft.lines.length,
        });
        return forced;
      }

      const sanitized = sanitizeQuotePricesToShopDb(text, {
        draft: null,
        catalogBlocks,
      });
      if (sanitized.changed) {
        harnessLog("warn", "outgoingChat.sanitizedInventedPrices", {
          replaced: sanitized.replaced,
        });
        return sanitized.content;
      }
    } catch (error) {
      harnessLog("warn", "outgoingChat.sanitizeFailed", {
        error: error?.message || String(error),
      });
    }

    return content;
  }

  async install() {
    harnessLog("info", "harness.install.start", {
      blocks: this.blocks.map((b) => b.name),
      workspaceId: this.ctx.workspace?.id ?? null,
    });

    for (const block of this.blocks) {
      await block.install(this);
      this.log(`block installed: ${block.name}`);
    }
    this.aibitat.harness = this;
    this.state.set("installedAt", Date.now());

    harnessLog("info", "harness.install.done", {
      blocks: this.listBlocks(),
      sessionId: this.state.get("sessionId") || null,
    });
    return this;
  }
}

module.exports = { AgentHarness };
