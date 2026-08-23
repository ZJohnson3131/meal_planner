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
  return render(<WeeklyPlanGenerator existingEntries={existingEntries} recipes={[{ id: replacementId, title: "Saved pasta", favorite: false }]} weekStart="2026-06-15" />);
}

describe("WeeklyPlanGenerator", () => {
  beforeEach(() => {
    mocks.confirmWeeklyPlan.mockReset().mockResolvedValue({ success: true });
    mocks.generateWeeklyPlanProposal.mockReset().mockResolvedValue({
      items: [{ plannedFor: "2026-06-15", source: "saved", current: existingEntries[0], recipeId: replacementId, savedRecipe: { title: "Saved pasta", description: null, servings: 2, instructions: "Cook.", ingredients: [] }, rationale: "A fresh saved recipe", reviewRequired: false }, draft],
      emptySlots: 0, ollama: { status: "ready" },
    });
  });

  test("selects open nights by default and protects completed dinners", async () => {
    const user = userEvent.setup();
    renderGenerator();
    expect(screen.getByRole("button", { name: /Wed, 17 June.*Settled/ })).toBeDisabled();
    expect(screen.getByText("4 nights selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mon, 15 June.*Planned/ }));
    expect(screen.getByText("5 nights selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to preferences" }));
    expect(screen.getByRole("heading", { name: "What sounds right this week?" })).toBeInTheDocument();
  });

  test("preserves preferences through Back and sends selected dates", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await user.click(screen.getByRole("button", { name: "Continue to preferences" }));
    await user.click(screen.getByRole("button", { name: "3 people" }));
    await user.click(screen.getByRole("button", { name: /Quick/ }));
    await user.click(screen.getByRole("button", { name: "Simple meals" }));
    await user.click(screen.getByRole("button", { name: "More preferences" }));
    await user.type(screen.getByLabelText(/Likes and dislikes/), "likes spicy food");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Continue to preferences" }));
    expect(screen.getByRole("button", { name: "3 people" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "See proposed dinners" }));
    expect(mocks.generateWeeklyPlanProposal).toHaveBeenCalledWith(expect.objectContaining({ selectedDates: ["2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"], householdSize: 3, cookingEffort: "quick", goals: ["simple"], likesDislikes: "likes spicy food" }));
  });

  test("defaults replacements to keep current and confirms only approved changes", async () => {
    const user = userEvent.setup();
    renderGenerator();
    await user.click(screen.getByRole("button", { name: "Continue to preferences" }));
    await user.click(screen.getByRole("button", { name: "See proposed dinners" }));
    expect(screen.getByRole("button", { name: "Keep current" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Save 1 approved dinner" }));
    expect(mocks.confirmWeeklyPlan).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ plannedFor: "2026-06-19", source: "generated" })] }));
  });

  test("shows an Ollama failure as an editable leave-empty review", async () => {
    const user = userEvent.setup();
    mocks.generateWeeklyPlanProposal.mockResolvedValue({ items: [{ plannedFor: "2026-06-18", source: "empty", current: null, reviewRequired: true, reason: "Start Ollama locally.", draft: { title: "", servings: 1, estimatedMinutes: null, rationale: "", ingredients: [{ itemName: "", quantity: null, unit: null, notes: null }], instructions: "" } }], emptySlots: 1, ollama: { status: "unavailable", message: "Start Ollama locally." } });
    renderGenerator();
    await user.click(screen.getByRole("button", { name: "Continue to preferences" }));
    await user.click(screen.getByRole("button", { name: "See proposed dinners" }));
    expect(screen.getAllByText(/Start Ollama locally/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save 0 approved dinners" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "See proposed dinners" })).toBeInTheDocument();
  });
});
