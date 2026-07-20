import {
  canShowAdminThreadContextPanel,
  canShowThreadFilesPanel,
} from "../threadPanelAccess";

describe("threadPanelAccess", () => {
  it("shows admin context panel only for admin workspace", () => {
    expect(
      canShowAdminThreadContextPanel({
        workspace: { slug: "offer-kp-admin" },
        userRole: "default",
      })
    ).toBe(true);
    expect(
      canShowAdminThreadContextPanel({
        workspace: { slug: "offer-kp-partner" },
        userRole: "default",
      })
    ).toBe(false);
  });

  it("shows thread files for partner and sales, not public", () => {
    expect(
      canShowThreadFilesPanel({
        workspace: { slug: "offer-kp-partner" },
        userRole: "default",
      })
    ).toBe(true);
    expect(
      canShowThreadFilesPanel({
        workspace: { slug: "offer-kp-sales" },
        userRole: "default",
      })
    ).toBe(true);
    expect(
      canShowThreadFilesPanel({
        workspace: { slug: "offer-kp-public" },
        userRole: "default",
      })
    ).toBe(false);
  });
});
