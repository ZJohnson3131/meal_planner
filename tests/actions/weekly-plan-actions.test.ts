import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateWithOllama: vi.fn(),
  getOllamaReadiness: vi.fn(),
  revalidatePath: vi.fn(),
  requireHousehold: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/ollama/client", () => ({
  generateWithOllama: mocks.generateWithOllama,
  getOllamaReadiness: mocks.getOllamaReadiness,
  OllamaGenerationError: class OllamaGenerationError extends Error {},
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const recipeId = "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a";
const weekStart = "2026-06-15";

const generated = {
  title: "Tomato pasta", servings: 2, estimatedMinutes: 25, rationale: "Simple dinner",
  ingredients: [{ itemName: "Pasta", quantity: 250, unit: "g", notes: null }], instructions: "Cook and serve.",
};

function preferences() {
  return {
    weekStart, householdSize: 2, dinnerCount: 2, goals: ["simple"], maxCookingMinutes: null,
    dietaryExclusions: [], likesDislikes: null, preferFavorites: false,
  };
}

function savedRecipeQuery() {
  return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ id: recipeId, title: "Saved pasta", description: null, favorite: false, servings: 2, instructions: "Cook.", recipe_ingredients: [] }], error: null }) }) }) }),
  };
}

function emptySavedRecipeQuery() {
  return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
  };
}

function pantryQuery() {
  return {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }),
  };
}

describe("weekly-plan actions", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.getOllamaReadiness.mockResolvedValue({ status: "ready" });
    mocks.generateWithOllama.mockResolvedValue(JSON.stringify({ drafts: [generated] }));
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => table === "recipes" ? savedRecipeQuery() : pantryQuery()),
      rpc: mocks.rpc,
    });
  });

  test("keeps proposal generation read-only, including after one invalid-output retry", async () => {
    mocks.generateWithOllama
      .mockResolvedValueOnce("not-json")
      .mockResolvedValueOnce(JSON.stringify({ drafts: [generated] }));
    const { generateWeeklyPlanProposal } = await import("@/app/actions/weekly-plan");

    const proposal = await generateWeeklyPlanProposal(preferences());

    expect(proposal.items).toHaveLength(2);
    expect(mocks.generateWithOllama).toHaveBeenCalledTimes(2);
    expect(mocks.generateWithOllama.mock.calls[0][0]).toContain("No cooking-time limit was provided.");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  test("generates missing dinners as bounded one-draft requests and excludes prior drafts", async () => {
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => table === "recipes" ? emptySavedRecipeQuery() : pantryQuery()),
      rpc: mocks.rpc,
    });
    mocks.generateWithOllama.mockResolvedValue(JSON.stringify({ drafts: [generated] }));
    const { generateWeeklyPlanProposal } = await import("@/app/actions/weekly-plan");

    const proposal = await generateWeeklyPlanProposal(preferences());

    expect(proposal.items).toHaveLength(2);
    expect(mocks.generateWithOllama).toHaveBeenCalledTimes(2);
    expect(mocks.generateWithOllama.mock.calls[0][0]).toContain("Create exactly 1 distinct dinner recipe draft");
    expect(mocks.generateWithOllama.mock.calls[1][0]).toContain("Do not duplicate these selected meals: Tomato pasta.");
  });

  test("uses an explicit no-goals prompt when meal preferences are omitted", async () => {
    const { generateWeeklyPlanProposal } = await import("@/app/actions/weekly-plan");

    await generateWeeklyPlanProposal({ ...preferences(), goals: [] });

    expect(mocks.generateWithOllama.mock.calls[0][0]).toContain("No weekly goals were provided.");
  });

  test("persists only confirmed reviewed items through the household-scoped atomic RPC", async () => {
    const { confirmWeeklyPlan } = await import("@/app/actions/weekly-plan");

    await expect(confirmWeeklyPlan({
      weekStart,
      items: [
        { plannedFor: "2026-06-15", source: "saved", recipeId },
        { plannedFor: "2026-06-16", source: "generated", draft: generated },
      ],
    })).resolves.toEqual({ success: true });

    expect(mocks.rpc).toHaveBeenCalledWith("confirm_weekly_dinner_plan", {
      p_household_id: "household-123",
      p_week_start: weekStart,
      p_assignments: [
        { plannedFor: "2026-06-15", recipeId, generatedRecipe: null },
        {
          plannedFor: "2026-06-16", recipeId: null,
          generatedRecipe: {
            recipe: { title: "Tomato pasta", description: "Simple dinner", sourceUrl: null, favorite: false, servings: 2, instructions: "Cook and serve.", ingestionStatus: "needs_review" },
            ingredients: [{ itemName: "Pasta", quantity: 250, unit: "g", notes: null }],
          },
        },
      ],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/planner");
  });

  test("does not claim a plan was finalised when the atomic RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("rejected") });
    const { confirmWeeklyPlan } = await import("@/app/actions/weekly-plan");

    await expect(confirmWeeklyPlan({ weekStart, items: [{ plannedFor: weekStart, source: "saved", recipeId }] }))
      .rejects.toThrow("No changes were saved");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
