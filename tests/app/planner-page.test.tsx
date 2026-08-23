import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireHousehold: vi.fn(),
  weeklyDinnerPlanner: vi.fn(() => null),
  weeklyPlanGenerator: vi.fn(() => null),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("@/components/meal-planner/weekly-dinner-planner", () => ({
  WeeklyDinnerPlanner: mocks.weeklyDinnerPlanner,
}));
vi.mock("@/components/meal-planner/weekly-plan-generator", () => ({
  WeeklyPlanGenerator: mocks.weeklyPlanGenerator,
}));

function chain(result: unknown) {
  const query = {
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn(),
    select: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe("PlannerPage", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireHousehold.mockResolvedValue({ householdId: "household-123" });
    mocks.weeklyDinnerPlanner.mockReturnValue(null);
    mocks.weeklyPlanGenerator.mockReturnValue(null);
  });

  test("loads only entries from the household's default Dinner slot", async () => {
    const recipesQuery = chain({ data: [], error: null });
    const dinnerSlotQuery = chain({ data: { id: "dinner-slot" }, error: null });
    const entriesQuery = chain({ data: [], error: null });
    mocks.createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesQuery;
        if (table === "meal_slots") return dinnerSlotQuery;
        if (table === "meal_plan_entries") return entriesQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const { default: PlannerPage } = await import("@/app/(app)/planner/page");
    await PlannerPage({ searchParams: Promise.resolve({ weekStart: "2026-06-15" }) });

    expect(dinnerSlotQuery.eq).toHaveBeenNthCalledWith(1, "household_id", "household-123");
    expect(dinnerSlotQuery.eq).toHaveBeenNthCalledWith(2, "name", "Dinner");
    expect(dinnerSlotQuery.eq).toHaveBeenNthCalledWith(3, "is_default", true);
    expect(entriesQuery.eq).toHaveBeenNthCalledWith(1, "household_id", "household-123");
    expect(entriesQuery.eq).toHaveBeenNthCalledWith(2, "meal_slot_id", "dinner-slot");
  });

  test("passes existing entry summaries to the guided planner", async () => {
    const recipesQuery = chain({ data: [], error: null });
    const dinnerSlotQuery = chain({ data: { id: "dinner-slot" }, error: null });
    const entriesQuery = chain({ data: [{ id: "entry-1", planned_for: "2026-06-15", recipe_id: "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a", status: "planned", recipe: { title: "Monday curry" } }], error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => table === "recipes" ? recipesQuery : table === "meal_slots" ? dinnerSlotQuery : entriesQuery) });

    const { default: PlannerPage } = await import("@/app/(app)/planner/page");
    const page = await PlannerPage({ searchParams: Promise.resolve({ weekStart: "2026-06-15" }) });
    const children = (page as unknown as { props: { children: unknown[] } }).props.children;
    const generator = children[1] as { props: Record<string, unknown> };

    expect(generator.props).toEqual(expect.objectContaining({
      existingEntries: [{ plannedFor: "2026-06-15", recipeId: "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a", recipeTitle: "Monday curry", status: "planned" }],
    }));
  });
});
