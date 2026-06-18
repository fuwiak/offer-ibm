const prisma = require("../utils/prisma");

const OfferKpCorrectionLog = {
  async log({
    userId = null,
    threadSlug = null,
    quoteReference = null,
    lineIndex = null,
    field = null,
    oldValue = null,
    newValue = null,
    aiSuggestion = null,
    inquiryRaw = null,
  }) {
    return prisma.offerKp_line_corrections.create({
      data: {
        userId: userId ? Number(userId) : null,
        threadSlug: threadSlug || null,
        quoteReference: quoteReference || null,
        lineIndex: lineIndex != null ? Number(lineIndex) : null,
        field: field || "unknown",
        oldValue: oldValue != null ? String(oldValue) : null,
        newValue: newValue != null ? String(newValue) : null,
        aiSuggestion: aiSuggestion != null ? String(aiSuggestion) : null,
        inquiryRaw: inquiryRaw || null,
      },
    });
  },

  async logBatch(userId, corrections = []) {
    const results = [];
    for (const c of corrections) {
      results.push(await this.log({ userId, ...c }));
    }
    return results;
  },

  async listForTraining({ limit = 500, since = null } = {}) {
    const where = since ? { createdAt: { gte: new Date(since) } } : {};
    return prisma.offerKp_line_corrections.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 2000),
    });
  },

  async exportTrainingJson() {
    const rows = await this.listForTraining({ limit: 2000 });
    return rows.map((r) => ({
      inquiry: r.inquiryRaw,
      field: r.field,
      ai_value: r.aiSuggestion || r.oldValue,
      operator_value: r.newValue,
      thread: r.threadSlug,
      quote: r.quoteReference,
      at: r.createdAt,
    }));
  },
};

module.exports = { OfferKpCorrectionLog };
