/* eslint-env jest, node */

const {
  parseSuggestionsFromLlmText,
  threadFollowUpSuggestionsEnabled,
} = require("../../../utils/chats/threadFollowUpSuggestions");

describe("threadFollowUpSuggestions", () => {
  it("parses JSON array from LLM output", () => {
    const raw =
      '["Какие аналоги есть для DIN 933 M8?","Сформировать КП по этим позициям","Проверить наличие на складе"]';
    expect(parseSuggestionsFromLlmText(raw)).toEqual([
      "Какие аналоги есть для DIN 933 M8?",
      "Сформировать КП по этим позициям",
      "Проверить наличие на складе",
    ]);
  });

  it("extracts array from markdown-wrapped JSON", () => {
    const raw =
      'Here are ideas:\n```json\n["Question one","Question two"]\n```';
    expect(parseSuggestionsFromLlmText(raw)).toEqual([
      "Question one",
      "Question two",
    ]);
  });

  it("deduplicates and limits suggestions", () => {
    const raw = JSON.stringify([
      "Same question",
      "same question",
      "Another one",
      "Third",
      "Fourth",
    ]);
    expect(parseSuggestionsFromLlmText(raw)).toEqual([
      "Same question",
      "Another one",
      "Third",
    ]);
  });

  it("can be disabled via env", () => {
    const prev = process.env.THREAD_FOLLOW_UP_SUGGESTIONS_DISABLED;
    process.env.THREAD_FOLLOW_UP_SUGGESTIONS_DISABLED = "true";
    expect(threadFollowUpSuggestionsEnabled()).toBe(false);
    process.env.THREAD_FOLLOW_UP_SUGGESTIONS_DISABLED = prev;
  });
});
