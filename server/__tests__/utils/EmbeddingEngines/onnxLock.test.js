"use strict";

const { withOnnxLock } = require("../../../utils/EmbeddingEngines/native/onnxLock");

describe("withOnnxLock", () => {
  test("runs callers strictly sequentially", async () => {
    const order = [];
    const a = withOnnxLock(async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("a-end");
      return 1;
    });
    const b = withOnnxLock(async () => {
      order.push("b-start");
      order.push("b-end");
      return 2;
    });
    const results = await Promise.all([a, b]);
    expect(results).toEqual([1, 2]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  test("keeps chain after rejection", async () => {
    await expect(
      withOnnxLock(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(withOnnxLock(async () => "ok")).resolves.toBe("ok");
  });
});
