import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/meal-plans", () => ({
  assignDinner: vi.fn(),
  completeMeal: vi.fn(),
  getMealCompletionPreview: vi.fn(),
  markMealPlanned: vi.fn(),
  markMealSkipped: vi.fn(),
  reverseCompletedMeal: vi.fn(),
}));

import { WeeklyDinnerPlanner } from "@/components/meal-planner/weekly-dinner-planner";

const recipes = [{ id: "recipe-1", title: "Pasta", favorite: true }];

describe("WeeklyDinnerPlanner", () => {
  test("renders seven dinner days and lets a user plan an unassigned day", () => {
    render(<WeeklyDinnerPlanner entries={[]} recipes={recipes} weekStart="2026-06-15" />);

    expect(screen.getByRole("heading", { name: "Weekly dinner planner" })).toBeInTheDocument();
    expect(screen.getAllByText("Dinner")).toHaveLength(7);
    const monday = screen.getByRole("heading", { name: "Monday 15 June" }).closest("article")!;
    expect(within(monday).getByLabelText("Recipe")).toHaveValue("");
    expect(within(monday).getByRole("button", { name: "Plan dinner" })).toHaveAttribute("type", "submit");
  });

  test("shows planned and skipped dinner controls without losing the selected recipe", () => {
    render(<WeeklyDinnerPlanner entries={[
      { id: "entry-planned", planned_for: "2026-06-15", recipe_id: "recipe-1", status: "planned", recipe: { title: "Pasta" } },
      { id: "entry-skipped", planned_for: "2026-06-16", recipe_id: "recipe-1", status: "skipped", recipe: { title: "Pasta" } },
    ]} recipes={recipes} weekStart="2026-06-15" />);

    const monday = screen.getByRole("heading", { name: "Monday 15 June" }).closest("article")!;
    expect(within(monday).getByText("Planned")).toBeInTheDocument();
    expect(within(monday).getByLabelText("Recipe")).toHaveValue("recipe-1");
    expect(within(monday).getByRole("button", { name: "Skip dinner" })).toHaveAttribute("type", "submit");

    const tuesday = screen.getByRole("heading", { name: "Tuesday 16 June" }).closest("article")!;
    expect(within(tuesday).getByText("Skipped")).toBeInTheDocument();
    expect(within(tuesday).getByRole("button", { name: "Restore to planned" })).toHaveAttribute("type", "submit");
  });

  test("keeps completed dinners visible but prevents their recipe or status from changing", () => {
    render(<WeeklyDinnerPlanner entries={[
      { id: "entry-completed", planned_for: "2026-06-15", recipe_id: "recipe-1", status: "completed", recipe: { title: "Pasta" } },
    ]} recipes={recipes} weekStart="2026-06-15" />);

    const monday = screen.getByRole("heading", { name: "Monday 15 June" }).closest("article")!;
    expect(within(monday).getByText("Completed")).toBeInTheDocument();
    expect(within(monday).getByLabelText("Recipe")).toBeDisabled();
    expect(within(monday).getByText("This dinner is completed. Reverse it before changing its recipe.")).toBeInTheDocument();
    expect(within(monday).queryByRole("button", { name: "Skip dinner" })).not.toBeInTheDocument();
    expect(within(monday).getByRole("checkbox", { name: /i understand this restores/i })).not.toBeChecked();
    expect(within(monday).getByRole("button", { name: "Reverse completion" })).toHaveAttribute("type", "submit");
  });

  test("shows a completion review trigger only for planned dinners", () => {
    render(<WeeklyDinnerPlanner entries={[
      { id: "entry-planned", planned_for: "2026-06-15", recipe_id: "recipe-1", status: "planned", recipe: { title: "Pasta" } },
      { id: "entry-skipped", planned_for: "2026-06-16", recipe_id: "recipe-1", status: "skipped", recipe: { title: "Pasta" } },
    ]} recipes={recipes} weekStart="2026-06-15" />);

    const monday = screen.getByRole("heading", { name: "Monday 15 June" }).closest("article")!;
    const tuesday = screen.getByRole("heading", { name: "Tuesday 16 June" }).closest("article")!;
    expect(within(monday).getByRole("button", { name: "Complete dinner" })).toBeInTheDocument();
    expect(within(tuesday).queryByRole("button", { name: "Complete dinner" })).not.toBeInTheDocument();
  });
});
