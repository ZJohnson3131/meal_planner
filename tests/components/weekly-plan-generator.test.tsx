import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ confirmWeeklyPlan: vi.fn(), generateWeeklyPlanProposal: vi.fn() }));

vi.mock("@/app/actions/weekly-plan", () => ({
  confirmWeeklyPlan: mocks.confirmWeeklyPlan,
  generateWeeklyPlanProposal: mocks.generateWeeklyPlanProposal,
}));

import { WeeklyPlanGenerator } from "@/components/meal-planner/weekly-plan-generator";

const recipeId = "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a";
const replacementId = "c5568d22-0ac9-44d7-b4f4-39ee7c4b176a";
const existingEntries = [
  { plannedFor: "2026-06-15", recipeId, recipeTitle: "Monday curry", status: "planned" as const },
  { plannedFor: "2026-06-16", recipeId, recipeTitle: "Tuesday curry", status: "skipped" as const },
  { plannedFor: "2026-06-17", recipeId, recipeTitle: "Settled curry", status: "completed" as const },
];
const draft = {
  plannedFor: "2026-06-19", source: "generated" as const, current: null, reviewRequired: true,
  draft: { title: "Tomato pasta", servings: 2, estimatedMinutes: 25, rationale: "Simple dinner", ingredients: [{ itemName: "Pasta", quantity: 250, unit: "g", notes: null }], instructions: "Cook and serve." },
};

function renderGenerator() {
  return render(<WeeklyPlanGenerator existingEntries={existingEntries} recipes={[{ id: replacementId, title: "Saved pasta", favorite: true }]} weekStart="2026-06-15" />);
}

async function openGuide(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open weekly guide" }));
  return screen.getByRole("dialog", { name: "Build a week that fits real life" });
}

async function reachGoals(user: ReturnType<typeof userEvent.setup>) {
  await openGuide(user);
  await user.click(screen.getByRole("button", { name: "Next: number of meals" }));
  await user.click(screen.getByRole("button", { name: "Next: choose nights" }));
  await user.click(screen.getByRole("button", { name: "Next: meal goals" }));
}

async function reachTuning(user: ReturnType<typeof userEvent.setup>) {
  await reachGoals(user);
  await user.click(screen.getByRole("button", { name: "Next: cooking effort" }));
  await user.click(screen.getByRole("button", { name: "Next: dietary exclusions" }));
  await user.click(screen.getByRole("button", { name: "Next: fine-tune" }));
}

describe("WeeklyPlanGenerator", () => {
  beforeEach(() => {
    mocks.confirmWeeklyPlan.mockReset().mockResolvedValue({ success: true });
    mocks.generateWeeklyPlanProposal.mockReset().mockResolvedValue({
      items: [{ plannedFor: "2026-06-15", source: "saved", current: existingEntries[0], recipeId: replacementId, savedRecipe: { title: "Saved pasta", description: null, servings: 2, instructions: "Cook.", ingredients: [] }, rationale: "A fresh saved recipe", reviewRequired: false }, draft],
      emptySlots: 0, ollama: { status: "ready" },
    });
  });

  test("opens a native dialog, closes without losing progress, and exposes labelled controls", async () => {
    const user = userEvent.setup();
    renderGenerator();
    const dialog = await openGuide(user);

    expect(dialog).toHaveAttribute("aria-labelledby", "weekly-guide-title");
    expect(screen.getByRole("button", { name: "Decrease household size" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Decrease household size" }));
    expect(screen.getByRole("button", { name: "Decrease household size" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Increase household size" }));
    await user.click(screen.getByRole("button", { name: "Increase household size" }));
    expect(screen.getByText("3", { selector: "output" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close weekly guide" }));
    expect(dialog).not.toHaveAttribute("open");
    await openGuide(user);
    expect(screen.getByText("3", { selector: "output" })).toBeInTheDocument();
  });

  test("enforces household and meal stepper limits and carries the exact meal count to dates", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await openGuide(user);
    await user.click(screen.getByRole("button", { name: "Increase household size" }));
    await user.click(screen.getByRole("button", { name: "Next: number of meals" }));
    expect(screen.getByRole("button", { name: "Decrease number of meals" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Decrease number of meals" }));
    expect(screen.getByText("3", { selector: "output" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next: choose nights" }));
    expect(screen.getByText("3 of 3 nights selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next: meal goals" })).toBeEnabled();
  });

  test("selects open nights by default, protects completed dates, and permits planned replacements at the exact count", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await openGuide(user);
    await user.click(screen.getByRole("button", { name: "Next: number of meals" }));
    await user.click(screen.getByRole("button", { name: "Increase number of meals" }));
    await user.click(screen.getByRole("button", { name: "Next: choose nights" }));

    const settled = screen.getByRole("button", { name: /Wed, 17 Jun.*Settled.*protected/i });
    expect(settled).toBeDisabled();
    expect(screen.getByText("4 of 5 nights selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mon, 15 Jun.*Planned/i }));
    expect(screen.getByText("5 of 5 nights selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next: meal goals" })).toBeEnabled();
  });

  test("covers goals, effort, dietary exclusions, optional tuning, and compatible generation payload", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await reachGoals(user);

    for (const name of ["Simple meals", "High protein", "Budget-friendly", "Family-friendly", "Vegetarian", "Pantry-friendly"]) {
      await user.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    await user.click(screen.getByRole("button", { name: "No preference" }));
    expect(screen.getByRole("button", { name: "Simple meals" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Next: cooking effort" }));
    await user.click(screen.getByRole("button", { name: /Quick/ }));
    await user.click(screen.getByRole("button", { name: "Next: dietary exclusions" }));
    for (const name of ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    await user.click(screen.getByRole("button", { name: "No preference" }));
    await user.click(screen.getByRole("button", { name: "Next: fine-tune" }));
    await user.clear(screen.getByLabelText(/Maximum cooking time/));
    await user.type(screen.getByLabelText(/Maximum cooking time/), "35");
    await user.type(screen.getByLabelText(/Likes and dislikes/), "likes spicy food");
    await user.click(screen.getByRole("checkbox", { name: /Prefer favourite/ }));
    await user.click(screen.getByRole("button", { name: "See proposed dinners" }));

    expect(mocks.generateWeeklyPlanProposal).toHaveBeenCalledWith(expect.objectContaining({
      selectedDates: ["2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"],
      householdSize: 2,
      cookingEffort: "quick",
      goals: [],
      dietaryExclusions: [],
      maxCookingMinutes: 35,
      likesDislikes: "likes spicy food",
      preferFavorites: true,
    }));
  });

  test("supports back/edit navigation and the explicit no-preference and skip actions", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await reachTuning(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "No preference" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next: fine-tune" }));
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(await screen.findByText("Review your proposed changes.")).toBeInTheDocument();
  });

  test("keeps review-first behavior for replacements, leave-empty, retry, and confirmation", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await reachTuning(user);
    await user.click(screen.getByRole("button", { name: "See proposed dinners" }));
    expect(screen.getByRole("button", { name: "Keep current" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getAllByRole("button", { name: "Use suggestion" })[0]);
    await user.selectOptions(screen.getByLabelText(/Replace Tomato pasta/), replacementId);
    await user.click(screen.getAllByRole("button", { name: "Leave empty" })[0]);
    await user.click(screen.getByRole("button", { name: "Save 1 approved dinner" }));
    expect(mocks.confirmWeeklyPlan).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ plannedFor: "2026-06-15", source: "saved" })] }));
  });

  test("renders an Ollama failure as editable leave-empty review and allows retry", async () => {
    const user = userEvent.setup();
    mocks.generateWeeklyPlanProposal.mockResolvedValue({ items: [{ plannedFor: "2026-06-18", source: "empty", current: null, reviewRequired: true, reason: "Start Ollama locally.", draft: { title: "", servings: 1, estimatedMinutes: null, rationale: "Unavailable", ingredients: [{ itemName: "Placeholder", quantity: null, unit: null, notes: null }], instructions: "Add a recipe." } }], emptySlots: 1, ollama: { status: "unavailable", message: "Start Ollama locally." } });
    renderGenerator();
    await reachTuning(user);
    await user.click(screen.getByRole("button", { name: "See proposed dinners" }));
    expect(screen.getAllByText(/Start Ollama locally/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save 0 approved dinners" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "See proposed dinners" })).toBeInTheDocument();
  });
});
