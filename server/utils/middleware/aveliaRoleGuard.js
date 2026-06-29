const { userFromSession } = require("../http");

const SUPPLIER_HIDDEN = [
  "resalePrice",
  "partnerName",
  "partnerId",
  "userId",
  "subtotal",
  "total",
  "preview",
  "previewJson",
  "margin",
  "commission",
  "pricingTier",
];

function stripSupplierFields(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.map(stripSupplierFields);
  const next = { ...payload };
  for (const key of SUPPLIER_HIDDEN) delete next[key];
  if (next.lines) next.lines = stripSupplierFields(next.lines);
  if (next.preview) next.preview = stripSupplierFields(next.preview);
  return next;
}

function offerKpRoleGuard({ requireAuth = false } = {}) {
  return async (request, response, next) => {
    const user = await userFromSession(request, response);
    response.locals.offerKpUser = user;

    if (requireAuth && !user) {
      return response.status(401).json({ error: "Authentication required." });
    }

    response.locals.sanitizeOfferKpQuote = (quote) => {
      if (!quote) return quote;
      if (user?.role === "supplier") return stripSupplierFields(quote);
      if (
        user?.role === "partner" &&
        quote.userId &&
        quote.userId !== user.id
      ) {
        return null;
      }
      return quote;
    };

    next();
  };
}

module.exports = { offerKpRoleGuard, stripSupplierFields };
