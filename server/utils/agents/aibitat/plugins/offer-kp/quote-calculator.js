const {
  multiplyLineTotal,
  evaluateSafeExpression,
  computeQuoteLines,
} = require("../../../../offerKp/quoteCalculator");

const QuoteCalculator = {
  name: "quote-calculator",
  plugin() {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Calculate commercial quote line totals (quantity × unit price) and subtotals. " +
            "Use before create-docx-file / create-pdf-file so the Sum column contains numbers like 850.80, never spreadsheet formulas like =40*21.27.",
          examples: [
            {
              prompt: "Calculate line total for 40 pcs at 21.27 RUB",
              call: JSON.stringify({ quantity: 40, unitPrice: 21.27 }),
            },
            {
              prompt: "Calculate totals for a quote table",
              call: JSON.stringify({
                lines: [
                  {
                    label: "Bolt DIN 931 M10x100 10.9",
                    quantity: 40,
                    unitPrice: 21.27,
                  },
                  {
                    label: "Bolt DIN 931 M10x100 12.9",
                    quantity: 10,
                    unitPrice: 33.04,
                  },
                ],
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              quantity: {
                type: ["number", "string"],
                description: "Line quantity (pcs, kg, m, etc.).",
              },
              unitPrice: {
                type: ["number", "string"],
                description: "Unit price from catalog (RUB).",
              },
              expression: {
                type: "string",
                description:
                  "Optional math expression, e.g. 40*21.27. Prefer quantity + unitPrice.",
              },
              lines: {
                type: "array",
                description: "Batch mode: multiple quote lines to total.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    quantity: { type: ["number", "string"] },
                    unitPrice: { type: ["number", "string"] },
                  },
                },
              },
            },
            additionalProperties: false,
          },
          handler: async function ({
            quantity = null,
            unitPrice = null,
            expression = "",
            lines = [],
          }) {
            try {
              if (Array.isArray(lines) && lines.length > 0) {
                const result = computeQuoteLines(lines);
                if (!result.ok) {
                  return JSON.stringify({ ok: false, error: result.error });
                }
                return JSON.stringify(result);
              }

              let lineTotal = null;
              if (quantity !== null && unitPrice !== null) {
                lineTotal = multiplyLineTotal(quantity, unitPrice);
              } else if (expression) {
                lineTotal = evaluateSafeExpression(expression);
              }

              if (lineTotal === null) {
                return JSON.stringify({
                  ok: false,
                  error:
                    "Provide lines[], or quantity + unitPrice, or a simple expression like 40*21.27",
                });
              }

              return JSON.stringify({
                ok: true,
                quantity: quantity !== null ? Number(quantity) : null,
                unitPrice: unitPrice !== null ? Number(unitPrice) : null,
                lineTotal,
              });
            } catch (error) {
              return JSON.stringify({
                ok: false,
                error: error?.message || String(error),
              });
            }
          },
        });
      },
    };
  },
};

module.exports = { QuoteCalculator };
