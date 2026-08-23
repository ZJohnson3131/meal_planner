import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireHousehold: vi.fn(),
  weeklyDinnerPlanner: vi.fn(() => null),
}));

vi.mock("@/lib/auth/household", () => ({ requireHousehold: mocks.requireHousehold }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("server-only", () => ({}));
vi.mock("@/components/meal-planner/weekly-dinner-planner", () => ({
  WeeklyDinnerPlanner: mocks.weeklyDinnerPlanner,
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
});
