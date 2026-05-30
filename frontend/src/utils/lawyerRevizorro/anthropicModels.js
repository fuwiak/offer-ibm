/** Fallback when Anthropic /models API is unavailable. */
export const LAWYER_REVIZORRO_ANTHROPIC_FALLBACK_MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
];

export const LAWYER_REVIZORRO_DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-6";
