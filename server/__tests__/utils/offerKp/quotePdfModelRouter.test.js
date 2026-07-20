/* eslint-env jest, node */

const {
  isQuoteRelatedMessage,
  parsedTextHasQuoteSignals,
  modelMatchesWeakList,
  pickQuotePdfFallbackModel,
  responseMissesParsedQuote,
  resolveQuotePdfModelSwitch,
} = require("../../../utils/offerKp/quotePdfModelRouter");

describe("quotePdfModelRouter", () => {
  const workspace = {
    slug: "test-ws",
    chatProvider: "lmstudio",
    chatModel: "openai/gpt-oss-20b",
  };

  const pdfFile = { title: "zayavka.pdf", pageContent: "" };
  const inquiryText =
    "1. Болт DIN 933 M8x40 — 500 шт.\n2. Гайка DIN 934 M8 — 500 шт.\nЦена 12.50 руб";

  const prevTeacher = process.env.OFFER_KP_TEACHER_LLM;
  const prevOrKey = process.env.OPENROUTER_API_KEY;
  const prevOrToken = process.env.OPEN_ROUTER_TOKEN;

  beforeEach(() => {
    // Local VRAM model hop only applies when teacher OpenRouter is off.
    process.env.OFFER_KP_TEACHER_LLM = "0";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPEN_ROUTER_TOKEN;
  });

  afterEach(() => {
    if (prevTeacher === undefined) delete process.env.OFFER_KP_TEACHER_LLM;
    else process.env.OFFER_KP_TEACHER_LLM = prevTeacher;
    if (prevOrKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevOrKey;
    if (prevOrToken === undefined) delete process.env.OPEN_ROUTER_TOKEN;
    else process.env.OPEN_ROUTER_TOKEN = prevOrToken;
  });

  it("detects quote-related messages", () => {
    expect(isQuoteRelatedMessage("сделай кп по заявке")).toBe(true);
    expect(isQuoteRelatedMessage("какая погода")).toBe(false);
  });

  it("detects product/price signals in parsed PDF text", () => {
    expect(parsedTextHasQuoteSignals(inquiryText)).toBe(true);
    expect(parsedTextHasQuoteSignals("короткий текст")).toBe(false);
  });

  it("marks gpt-oss as weak and picks gemma fallback", () => {
    expect(modelMatchesWeakList("openai/gpt-oss-20b")).toBe(true);
    expect(pickQuotePdfFallbackModel("openai/gpt-oss-20b")).toBe(
      "google/gemma-4-12b"
    );
  });

  it("switches model when quote + PDF with line items and fallback is loaded", () => {
    const result = resolveQuotePdfModelSwitch({
      message: "сформируй КП по прикреплённому PDF",
      workspace,
      parsedFiles: [{ ...pdfFile, pageContent: inquiryText }],
      parsedFileTexts: [inquiryText],
      availableModels: ["openai/gpt-oss-20b", "google/gemma-4-12b"],
    });

    expect(result).toEqual({
      from: "openai/gpt-oss-20b",
      model: "google/gemma-4-12b",
      provider: "lmstudio",
      reason: "quote_pdf_document",
    });
  });

  it("does not switch to unloaded fallback model", () => {
    expect(
      resolveQuotePdfModelSwitch({
        message: "сформируй КП по прикреплённому PDF",
        workspace,
        parsedFiles: [{ ...pdfFile, pageContent: inquiryText }],
        parsedFileTexts: [inquiryText],
        availableModels: ["openai/gpt-oss-20b"],
      })
    ).toBeNull();
  });

  it("does not switch without quote intent", () => {
    expect(
      resolveQuotePdfModelSwitch({
        message: "привет",
        workspace,
        parsedFiles: [{ ...pdfFile, pageContent: inquiryText }],
        parsedFileTexts: [inquiryText],
      })
    ).toBeNull();
  });

  it("does not switch when user picked non-weak model in chat picker", () => {
    expect(
      resolveQuotePdfModelSwitch({
        message: "сформируй КП по прикреплённому PDF",
        workspace: {
          slug: "test-ws",
          chatProvider: "lmstudio",
          chatModel: "deepseek/deepseek-r1-0528-qwen3-8b",
          agentModel: "openai/gpt-oss-20b",
        },
        parsedFiles: [{ ...pdfFile, pageContent: inquiryText }],
        parsedFileTexts: [inquiryText],
      })
    ).toBeNull();
  });
});
