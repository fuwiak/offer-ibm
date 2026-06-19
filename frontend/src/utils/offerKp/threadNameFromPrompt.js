/** Derive a short thread title from the user's first message. */
export function threadNameFromPrompt(prompt = "", maxLength = 60) {
  if (typeof prompt !== "string") return "";
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const sentenceMatch = cleaned.match(/^[\s\S]+?(?:[.!?](?=\s|$)|\n|$)/);
  let name = (sentenceMatch ? sentenceMatch[0] : cleaned).trim();
  if (!name) name = cleaned;

  if (name.length <= maxLength) return name;

  const cut = name.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
  return trimmed ? `${trimmed}…` : name.slice(0, maxLength);
}
