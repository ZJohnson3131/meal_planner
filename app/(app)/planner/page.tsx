import { WeeklyDinnerPlanner } from "@/components/meal-planner/weekly-dinner-planner";
import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

function currentWeekStart(date = new Date()): string {
  const start = new Date(date);
  const day = start.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);

  return start.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function selectedWeekStart(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return currentWeekStart();
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isCalendarDate ? currentWeekStart(date) : currentWeekStart();
}

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ weekStart?: string | string[] }>;
}) {
  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const weekStart = selectedWeekStart((await searchParams).weekStart);
  const weekEnd = addDays(weekStart, 6);

  const [recipesResult, entriesResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, title, favorite")
      .eq("household_id", householdId)
      .order("favorite", { ascending: false })
      .order("title", { ascending: true }),
    supabase
      .from("meal_plan_entries")
      .select("id, planned_for, recipe_id, status, recipe:recipes(title)")
      .eq("household_id", householdId)
      .gte("planned_for", weekStart)
      .lte("planned_for", weekEnd)
      .order("planned_for", { ascending: true }),
  ]);

  if (recipesResult.error || entriesResult.error) {
    throw new Error("Failed to load the weekly dinner planner");
  }

  const entries = (entriesResult.data ?? []).map((entry) => ({
    ...entry,
    recipe: Array.isArray(entry.recipe) ? (entry.recipe[0] ?? null) : entry.recipe,
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Dinner planner</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Assign a recipe to each dinner this week. Skipped dinners remain visible so your plan stays accurate.
        </p>
      </div>

      <WeeklyDinnerPlanner entries={entries} recipes={recipesResult.data ?? []} weekStart={weekStart} />
    </div>
  );
}
