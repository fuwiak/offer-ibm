import { describe, it, expect } from "vitest";
import {
  threadHistoryKey,
  shouldReplayDraft,
  buildDraftNavigateState,
  threadPath,
} from "../conversationNavCore";

describe("threadHistoryKey", () => {
  it("builds stable slug:thread key", () => {
    expect(threadHistoryKey("ws-a", "thread-1")).toBe("ws-a:thread-1");
    expect(threadHistoryKey("ws-a", null)).toBe("ws-a:default");
    expect(threadHistoryKey(null, null)).toBe(":default");
  });
});

describe("shouldReplayDraft", () => {
  it("returns true when newConversation and draft message present", () => {
    expect(
      shouldReplayDraft({
        locationState: {
          newConversation: true,
          draft: { message: "hello", attachments: [] },
        },
      })
    ).toBe(true);
  });

  it("returns false when opening existing thread without state", () => {
    expect(shouldReplayDraft({ locationState: null })).toBe(false);
    expect(shouldReplayDraft({ locationState: {} })).toBe(false);
  });

  it("returns false when draft message is empty", () => {
    expect(
      shouldReplayDraft({
        locationState: {
          newConversation: true,
          draft: { message: "   ", attachments: [] },
        },
      })
    ).toBe(false);
  });
});

describe("threadPath", () => {
  it("returns workspace thread URL", () => {
    expect(threadPath("my-ws", "abc-123")).toBe("/workspace/my-ws/t/abc-123");
  });
});

describe("buildDraftNavigateState", () => {
  it("wraps draft for router location state", () => {
    expect(
      buildDraftNavigateState({
        message: "Hi",
        attachments: [{ name: "a.pdf" }],
      })
    ).toEqual({
      newConversation: true,
      draft: { message: "Hi", attachments: [{ name: "a.pdf" }] },
    });
  });
});
