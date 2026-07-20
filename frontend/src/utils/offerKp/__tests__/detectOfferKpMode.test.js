import { describe, expect, it } from "vitest";
import { shouldRequireOfferKpFirstRun } from "../detectOfferKpMode";

describe("shouldRequireOfferKpFirstRun", () => {
  it("does not enter first-run when an admin already exists", () => {
    expect(
      shouldRequireOfferKpFirstRun({
        onboardingComplete: false,
        hasUsers: true,
        multiUserMode: true,
        requiresAuth: false,
      })
    ).toBe(false);
  });

  it("does not enter first-run when multi-user mode is on without HasUsers flag", () => {
    expect(
      shouldRequireOfferKpFirstRun({
        onboardingComplete: false,
        hasUsers: undefined,
        multiUserMode: true,
        requiresAuth: false,
      })
    ).toBe(false);
  });

  it("enters first-run when onboarding is incomplete and no users exist", () => {
    expect(
      shouldRequireOfferKpFirstRun({
        onboardingComplete: false,
        hasUsers: false,
        multiUserMode: false,
        requiresAuth: false,
      })
    ).toBe(true);
  });

  it("does not re-enter first-run once onboarding is marked complete", () => {
    expect(
      shouldRequireOfferKpFirstRun({
        onboardingComplete: true,
        hasUsers: false,
        multiUserMode: false,
        requiresAuth: false,
      })
    ).toBe(false);
  });

  it("enters first-run for passwordless single-user when onboarding flag is missing", () => {
    expect(
      shouldRequireOfferKpFirstRun({
        onboardingComplete: undefined,
        hasUsers: false,
        multiUserMode: false,
        requiresAuth: false,
      })
    ).toBe(true);
  });
});
