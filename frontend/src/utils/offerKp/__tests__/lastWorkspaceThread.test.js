import { describe, it, expect, beforeEach } from "vitest";
import {
  rememberWorkspaceThread,
  getRememberedThreadSlug,
  getRememberedThreadAt,
  pickNewestThread,
  resolveThreadSlugFromList,
  LAST_THREAD_BY_WORKSPACE,
} from "@/utils/offerKp/lastWorkspaceThreadCore";

describe("lastWorkspaceThread", () => {
  beforeEach(() => {
    localStorage.removeItem(LAST_THREAD_BY_WORKSPACE);
  });

  it("remembers and reads last thread per workspace", () => {
    rememberWorkspaceThread("ws-a", "thread-1");
    rememberWorkspaceThread("ws-b", "thread-9");
    expect(getRememberedThreadSlug("ws-a")).toBe("thread-1");
    expect(getRememberedThreadSlug("ws-b")).toBe("thread-9");
    expect(getRememberedThreadSlug("missing")).toBeNull();
  });

  it("stores remember timestamp", () => {
    const before = Date.now();
    rememberWorkspaceThread("ws-a", "thread-1");
    const at = getRememberedThreadAt("ws-a");
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("ignores empty slugs", () => {
    rememberWorkspaceThread("", "t");
    rememberWorkspaceThread("ws", "");
    expect(getRememberedThreadSlug("ws")).toBeNull();
  });

  it("pickNewestThread prefers lastUpdatedAt over older createdAt", () => {
    const newest = pickNewestThread([
      {
        slug: "old-kp",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUpdatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        slug: "fresh-qa",
        createdAt: "2026-06-01T00:00:00.000Z",
        lastUpdatedAt: "2026-07-30T00:00:00.000Z",
      },
    ]);
    expect(newest.slug).toBe("fresh-qa");
  });

  it("resolve prefers newer thread created after remember timestamp", () => {
    const rememberedAt = Date.parse("2026-07-01T00:00:00.000Z");
    const slug = resolveThreadSlugFromList(
      [
        {
          slug: "old-kp",
          createdAt: "2026-01-01T00:00:00.000Z",
          lastUpdatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          slug: "fresh-qa",
          createdAt: "2026-07-15T00:00:00.000Z",
          lastUpdatedAt: "2026-07-15T00:00:00.000Z",
        },
      ],
      "old-kp",
      rememberedAt
    );
    expect(slug).toBe("fresh-qa");
  });

  it("resolve keeps remembered when it is still the newest activity", () => {
    const rememberedAt = Date.now();
    const slug = resolveThreadSlugFromList(
      [
        {
          slug: "old-kp",
          createdAt: "2026-01-01T00:00:00.000Z",
          lastUpdatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          slug: "current",
          createdAt: "2026-06-01T00:00:00.000Z",
          lastUpdatedAt: "2026-07-30T00:00:00.000Z",
        },
      ],
      "current",
      rememberedAt
    );
    expect(slug).toBe("current");
  });
});
