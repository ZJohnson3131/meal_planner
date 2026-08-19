"use client";

import { useFormStatus } from "react-dom";

import {
  assignDinner,
  markMealPlanned,
  markMealSkipped,
  reverseCompletedMeal,
} from "@/app/actions/meal-plans";
import { CompletionDialog } from "@/components/meal-planner/completion-dialog";

export type PlannerRecipe = {
  id: string;
  title: string;
  favorite: boolean;
};

export type PlannerMealEntry = {
  id: string;
  planned_for: string;
  recipe_id: string;
  status: "planned" | "completed" | "skipped";
  recipe: { title: string } | null;
};

type WeeklyDinnerPlannerProps = {
  entries: PlannerMealEntry[];
  recipes: PlannerRecipe[];
  weekStart: string;
};

function dateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDateFromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekDays(weekStart: string) {
  const start = dateFromIso(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      isoDate: isoDateFromUtcDate(date),
      label: new Intl.DateTimeFormat("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(date),
    };
  });
}

function formatWeekRange(weekStart: string) {
  const start = dateFromIso(weekStart);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function SubmitButton({ children, pendingText, tone = "primary" }: { children: string; pendingText: string; tone?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  const toneClass = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline-emerald-700",
    secondary: "border border-slate-300 text-slate-800 hover:bg-slate-50 focus-visible:outline-emerald-700",
    danger: "border border-amber-300 text-amber-900 hover:bg-amber-50 focus-visible:outline-amber-700",
  }[tone];

  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingText : children}
    </button>
  );
}

function StatusBadge({ status }: { status: PlannerMealEntry["status"] }) {
  const copy = {
    planned: "Planned",
    completed: "Completed",
    skipped: "Skipped",
  }[status];
  const className = {
    planned: "bg-emerald-100 text-emerald-900",
    completed: "bg-sky-100 text-sky-900",
    skipped: "bg-slate-200 text-slate-700",
  }[status];

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{copy}</span>;
}

function DinnerDay({ day, entry, recipes }: { day: { isoDate: string; label: string }; entry: PlannerMealEntry | undefined; recipes: PlannerRecipe[] }) {
  const selectId = `dinner-${day.isoDate}`;
  const status = entry?.status ?? "planned";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">{day.label}</h3>
          <p className="mt-1 text-sm text-slate-600">Dinner</p>
        </div>
        {entry ? <StatusBadge status={entry.status} /> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Unplanned</span>}
      </div>

      <form action={assignDinner} className="mt-4 space-y-3">
        <input name="plannedFor" type="hidden" value={day.isoDate} />
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor={selectId}>Recipe</label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            defaultValue={entry?.recipe_id ?? ""}
            disabled={status === "completed" || recipes.length === 0}
            id={selectId}
            name="recipeId"
            required
          >
            <option disabled value="">{recipes.length === 0 ? "Add a recipe first" : "Choose a recipe"}</option>
            {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.favorite ? "★ " : ""}{recipe.title}</option>)}
          </select>
        </div>
        {entry?.status === "completed" ? <p className="text-sm text-slate-600">This dinner is completed. Reverse it before changing its recipe.</p> : <SubmitButton pendingText="Saving…">{entry ? "Update dinner" : "Plan dinner"}</SubmitButton>}
      </form>

      {entry && entry.status !== "completed" ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {entry.status === "skipped" ? (
            <form action={markMealPlanned}>
              <input name="entryId" type="hidden" value={entry.id} />
              <SubmitButton pendingText="Restoring…" tone="secondary">Restore to planned</SubmitButton>
            </form>
          ) : (
            <form action={markMealSkipped}>
              <input name="entryId" type="hidden" value={entry.id} />
              <SubmitButton pendingText="Skipping…" tone="danger">Skip dinner</SubmitButton>
            </form>
          )}
        </div>
      ) : null}

      {entry?.status === "planned" ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <CompletionDialog entryId={entry.id} recipeTitle={entry.recipe?.title ?? "this dinner"} />
        </div>
      ) : null}

      {entry?.status === "completed" ? (
        <form action={reverseCompletedMeal} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <input name="entryId" type="hidden" value={entry.id} />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input className="mt-1 size-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" name="confirmReversal" required type="checkbox" value="true" />
            <span>I understand this restores the recorded pantry deductions where possible.</span>
          </label>
          <SubmitButton pendingText="Reversing…" tone="secondary">Reverse completion</SubmitButton>
        </form>
      ) : null}
    </article>
  );
}

/** Renders one editable Dinner meal slot for each day in a selected seven-day week. */
export function WeeklyDinnerPlanner({ entries, recipes, weekStart }: WeeklyDinnerPlannerProps) {
  const entriesByDate = new Map(entries.map((entry) => [entry.planned_for, entry]));
  const weekDays = getWeekDays(weekStart);

  return (
    <section aria-labelledby="weekly-dinner-planner-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950" id="weekly-dinner-planner-heading">Weekly dinner planner</h1>
          <p className="mt-1 text-slate-600">{formatWeekRange(weekStart)} · One dinner per day</p>
        </div>
        <form action="/planner" className="flex items-end gap-2">
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="week-start">Week starting</label>
            <input className="mt-1 rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={weekStart} id="week-start" name="weekStart" required type="date" />
          </div>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" type="submit">View week</button>
        </form>
      </div>

      {recipes.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">Add a recipe to your library before planning dinners.</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {weekDays.map((day) => <DinnerDay day={day} entry={entriesByDate.get(day.isoDate)} key={day.isoDate} recipes={recipes} />)}
      </div>
    </section>
  );
}
