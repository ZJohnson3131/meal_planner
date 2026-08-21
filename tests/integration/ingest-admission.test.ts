import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("recipe ingest admission", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("allows one concurrent import per user and household and releases capacity idempotently", async () => {
    const { acquireRecipeIngestAdmission } = await import("@/lib/recipes/ingest-admission");

    const first = acquireRecipeIngestAdmission("user-1", "household-1");
    expect(first).not.toBeNull();
    expect(acquireRecipeIngestAdmission("user-1", "household-1")).toBeNull();
    const otherUser = acquireRecipeIngestAdmission("user-2", "household-1");
    const otherHousehold = acquireRecipeIngestAdmission("user-1", "household-2");
    expect(otherUser).not.toBeNull();
    expect(otherHousehold).not.toBeNull();

    first?.release();
    first?.release();
    const reacquired = acquireRecipeIngestAdmission("user-1", "household-1");
    expect(reacquired).not.toBeNull();

    reacquired?.release();
    otherUser?.release();
    otherHousehold?.release();
  });

  test("admits five attempts per minute and resets the principal window at its boundary", async () => {
    const {
      acquireRecipeIngestAdmission,
      RECIPE_INGEST_ADMISSION_LIMITS,
    } = await import("@/lib/recipes/ingest-admission");

    for (let attempt = 0; attempt < RECIPE_INGEST_ADMISSION_LIMITS.importsPerWindow; attempt += 1) {
      const admission = acquireRecipeIngestAdmission("user-1", "household-1");
      expect(admission).not.toBeNull();
      admission?.release();
    }
    expect(acquireRecipeIngestAdmission("user-1", "household-1")).toBeNull();

    vi.advanceTimersByTime(RECIPE_INGEST_ADMISSION_LIMITS.windowMilliseconds);
    const nextWindow = acquireRecipeIngestAdmission("user-1", "household-1");
    expect(nextWindow).not.toBeNull();
    nextWindow?.release();
  });
});
