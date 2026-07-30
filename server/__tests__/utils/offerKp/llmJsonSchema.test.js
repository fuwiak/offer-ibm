/* eslint-env jest, node */

const {
  RESPONSE_FORMATS,
  productSelectionResponseFormat,
  parseProductSelectionPayload,
} = require("../../../utils/offerKp/llmJsonSchema");

describe("productSelectionResponseFormat", () => {
  it("constrains decoding to the presented candidate ids", () => {
    const format = productSelectionResponseFormat([12, "34", 12]);
    const items = format.json_schema.schema.properties.product_ids.items;
    expect(items.enum).toEqual([12, 34]);
    expect(format.json_schema.strict).toBe(true);
  });

  it("caps the answer at the candidate count", () => {
    const format = productSelectionResponseFormat([7]);
    expect(format.json_schema.schema.properties.product_ids.maxItems).toBe(1);
  });

  it("falls back to the open schema without candidates", () => {
    expect(productSelectionResponseFormat([])).toBe(
      RESPONSE_FORMATS.productSelection
    );
    expect(productSelectionResponseFormat(null)).toBe(
      RESPONSE_FORMATS.productSelection
    );
  });

  it("falls back when the enum would be too large for a grammar", () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    expect(productSelectionResponseFormat(ids)).toBe(
      RESPONSE_FORMATS.productSelection
    );
  });
});

describe("parseProductSelectionPayload", () => {
  it("accepts the constrained object shape", () => {
    expect(parseProductSelectionPayload({ product_ids: [3, "4"] })).toEqual([
      3, 4,
    ]);
  });
});
