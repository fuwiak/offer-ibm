import { calculateQuote, generateQuoteReference } from "./pricing";

export const QUOTE_STEPS = [
  "product",
  "dimensions",
  "calculation",
  "preview",
  "validate",
  "share",
];

export const INITIAL_QUOTE_DRAFT = {
  step: 0,
  reference: null,
  lines: [{ productId: "one-8-3", lengthMm: 1000, heightMm: 1000, quantity: 1 }],
  shipping: 0,
  preview: null,
};

export function quoteStepKey(stepIndex) {
  return QUOTE_STEPS[stepIndex] ?? "product";
}

export function advanceQuoteDraft(draft) {
  const nextStep = Math.min(draft.step + 1, QUOTE_STEPS.length - 1);
  let preview = draft.preview;
  if (quoteStepKey(nextStep) === "calculation" || quoteStepKey(nextStep) === "preview") {
    preview = calculateQuote(draft.lines, { shipping: draft.shipping });
  }
  if (quoteStepKey(nextStep) === "validate" && !draft.reference) {
    return {
      ...draft,
      step: nextStep,
      reference: generateQuoteReference(),
      preview: preview ?? calculateQuote(draft.lines, { shipping: draft.shipping }),
    };
  }
  return { ...draft, step: nextStep, preview };
}

export function updateQuoteLines(draft, lines) {
  const preview =
    draft.step >= 2 ? calculateQuote(lines, { shipping: draft.shipping }) : null;
  return { ...draft, lines, preview };
}
