const prisma = require("../utils/prisma");
const {
  calculateQuote,
  generateQuoteReference,
} = require("../utils/offerKpApp/pricing");

/** Fields never returned to supplier role — enforced at query/format, not only in LLM prompt */
const SUPPLIER_QUOTE_SELECT = {
  id: true,
  reference: true,
  status: true,
  shipping: true,
  createdAt: true,
  lastUpdatedAt: true,
  lines: {
    select: {
      id: true,
      productId: true,
      lengthMm: true,
      heightMm: true,
      quantity: true,
      surfaceM2: true,
      surchargeMultiplier: true,
    },
  },
};

const OfferKpQuote = {
  async create({ userId = null, partnerId = null, lines = [], shipping = 0 }) {
    const preview = calculateQuote(lines, { shipping });
    const reference = generateQuoteReference();
    const quote = await prisma.offerKp_quotes.create({
      data: {
        reference,
        userId,
        partnerId,
        status: "draft",
        subtotal: preview.subtotal,
        shipping: preview.shipping,
        total: preview.total,
        previewJson: JSON.stringify(preview),
        lines: {
          create: preview.lines.map((line) => ({
            productId: line.productId,
            lengthMm: line.lengthMm,
            heightMm: line.heightMm,
            quantity: line.quantity,
            surfaceM2: line.surfaceM2,
            surchargeMultiplier: line.surchargeMultiplier,
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });
    return { ...quote, preview };
  },

  async getByReference(reference) {
    return prisma.offerKp_quotes.findUnique({
      where: { reference },
      include: { lines: true, shareLinks: true },
    });
  },

  async getById(id) {
    return prisma.offerKp_quotes.findUnique({
      where: { id: Number(id) },
      include: { lines: true, shareLinks: true },
    });
  },

  async listForUser(userId, role) {
    if (role === "supplier") {
      return prisma.offerKp_quotes.findMany({
        where: { status: { not: "draft" } },
        select: SUPPLIER_QUOTE_SELECT,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }

    const where = role === "admin" ? {} : { userId: Number(userId) };

    return prisma.offerKp_quotes.findMany({
      where,
      include: { lines: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async getByReferenceForRole(reference, role) {
    if (role === "supplier") {
      return prisma.offerKp_quotes.findFirst({
        where: { reference, status: { not: "draft" } },
        select: SUPPLIER_QUOTE_SELECT,
      });
    }
    return this.getByReference(reference);
  },

  async duplicate(id, { lines, shipping, userId }) {
    const original = await this.getById(id);
    if (!original) return null;

    const newLines =
      lines ??
      original.lines.map((l) => ({
        productId: l.productId,
        lengthMm: l.lengthMm,
        heightMm: l.heightMm,
        quantity: l.quantity,
      }));

    return this.create({
      userId: userId ?? original.userId,
      partnerId: original.partnerId,
      lines: newLines,
      shipping: shipping ?? original.shipping,
    });
  },

  formatForClient(quote, sanitizer = (q) => q, { role } = {}) {
    if (!quote) return null;

    const isSupplierView = role === "supplier";

    let preview = null;
    if (!isSupplierView) {
      preview = quote.previewJson
        ? JSON.parse(quote.previewJson)
        : calculateQuote(
            (quote.lines || []).map((l) => ({
              productId: l.productId,
              lengthMm: l.lengthMm,
              heightMm: l.heightMm,
              quantity: l.quantity,
            })),
            { shipping: quote.shipping ?? 0 }
          );
    }

    const payload = isSupplierView
      ? {
          id: quote.id,
          reference: quote.reference,
          status: quote.status,
          shipping: quote.shipping,
          lines: quote.lines,
          createdAt: quote.createdAt,
          lastUpdatedAt: quote.lastUpdatedAt,
        }
      : {
          id: quote.id,
          reference: quote.reference,
          userId: quote.userId,
          partnerId: quote.partnerId,
          status: quote.status,
          subtotal: quote.subtotal,
          shipping: quote.shipping,
          total: quote.total,
          preview,
          lines: quote.lines,
          createdAt: quote.createdAt,
        };

    return sanitizer(payload);
  },
};

module.exports = { OfferKpQuote };
