import {
  rememberWorkspaceThread,
  getRememberedThreadSlug,
  LAST_THREAD_BY_WORKSPACE,
} from "@/utils/offerKp/lastWorkspaceThread";

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

  it("ignores empty slugs", () => {
    rememberWorkspaceThread("", "t");
    rememberWorkspaceThread("ws", "");
    expect(getRememberedThreadSlug("ws")).toBeNull();
  });
});
