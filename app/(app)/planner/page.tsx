import { z } from "zod";

import { WeeklyDinnerPlanner } from "@/components/meal-planner/weekly-dinner-planner";
import { WeeklyPlanGenerator } from "@/components/meal-planner/weekly-plan-generator";
import type { WeeklyPlanExistingEntry } from "@/lib/domain/weekly-plan-types";
import { requireHousehold } from "@/lib/auth/household";
import { calendarWeekRange, isIsoCalendarDate } from "@/lib/domain/calendar";
import { createClient } from "@/lib/supabase/server";

const plannerQuerySchema = z.object({
  weekStart: z.string().refine(isIsoCalendarDate),
});

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ weekStart?: string | string[] }>;
}) {
  const parsedQuery = plannerQuerySchema.safeParse(await searchParams);
  if (!parsedQuery.success) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Dinner planner</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Choose a local calendar date to open its Monday-to-Sunday dinner plan.
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-5" method="get">
          <label className="text-sm font-medium text-slate-800">
            Date in the week
            <input className="mt-1 block rounded-md border border-slate-300 px-3 py-2" name="weekStart" required type="date" />
          </label>
          <button className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white" type="submit">
            View week
          </button>
        </form>
      </div>
    );
  }

  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { endDate: weekEnd, startDate: weekStart } = calendarWeekRange(
    parsedQuery.data.weekStart,
  );

  const [recipesResult, dinnerSlotResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, title, favorite")
      .eq("household_id", householdId)
      .order("favorite", { ascending: false })
      .order("title", { ascending: true }),
    supabase
      .from("meal_slots")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", "Dinner")
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  if (recipesResult.error || dinnerSlotResult.error || !dinnerSlotResult.data) {
    throw new Error("Failed to load the weekly dinner planner");
  }

  const entriesResult = await supabase
    .from("meal_plan_entries")
    .select("id, planned_for, recipe_id, status, recipe:recipes(title)")
    .eq("household_id", householdId)
    .eq("meal_slot_id", dinnerSlotResult.data.id)
    .gte("planned_for", weekStart)
    .lte("planned_for", weekEnd)
    .order("planned_for", { ascending: true });

  if (entriesResult.error) {
    throw new Error("Failed to load the weekly dinner planner");
  }

  const entries = (entriesResult.data ?? []).map((entry) => ({
    ...entry,
    recipe: Array.isArray(entry.recipe) ? (entry.recipe[0] ?? null) : entry.recipe,
  }));
  const existingEntries: WeeklyPlanExistingEntry[] = entries.map((entry) => ({
    plannedFor: entry.planned_for,
    recipeId: entry.recipe_id,
    recipeTitle: entry.recipe?.title ?? "Untitled dinner",
    status: entry.status,
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Dinner planner</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Assign a recipe to each dinner this week. Skipped dinners remain visible so your plan stays accurate.
        </p>
      </div>

      <WeeklyPlanGenerator existingEntries={existingEntries} recipes={recipesResult.data ?? []} weekStart={weekStart} />
      <WeeklyDinnerPlanner entries={entries} recipes={recipesResult.data ?? []} weekStart={weekStart} />
    </div>
  );
}
