import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ confirmWeeklyPlan: vi.fn(), generateWeeklyPlanProposal: vi.fn() }));

vi.mock("@/app/actions/weekly-plan", () => ({
  confirmWeeklyPlan: mocks.confirmWeeklyPlan,
  generateWeeklyPlanProposal: mocks.generateWeeklyPlanProposal,
}));

import { WeeklyPlanGenerator } from "@/components/meal-planner/weekly-plan-generator";

const generated = {
  plannedFor: "2026-06-16" as const, source: "generated" as const, reviewRequired: true,
  draft: {
    title: "Tomato pasta", servings: 2, estimatedMinutes: 25, rationale: "Simple dinner",
    ingredients: [{ itemName: "Pasta", quantity: 250, unit: "g", notes: null }], instructions: "Cook and serve.",
  },
};

describe("WeeklyPlanGenerator", () => {
  beforeEach(() => {
    mocks.confirmWeeklyPlan.mockReset();
    mocks.generateWeeklyPlanProposal.mockReset();
    mocks.confirmWeeklyPlan.mockResolvedValue({ success: true });
    mocks.generateWeeklyPlanProposal.mockResolvedValue({
      items: [{
        plannedFor: "2026-06-15", source: "saved", recipeId: "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a",
        savedRecipe: { title: "Saved pasta", description: null, servings: 2, instructions: "Cook.", ingredients: [] },
        rationale: "Saved recipe selected for your week", reviewRequired: false,
      }, generated],
      emptySlots: 0, ollama: { status: "ready" },
    });
  });

  test("allows generating a proposal with no weekly goals selected", async () => {
    const user = userEvent.setup();
    render(<WeeklyPlanGenerator recipes={[]} weekStart="2026-06-15" />);

    await user.click(screen.getByRole("button", { name: "Generate dinner proposal" }));

    await screen.findByText("Review your proposal before anything is saved.");
    expect(mocks.generateWeeklyPlanProposal).toHaveBeenCalledWith(expect.objectContaining({
      goals: [],
      dietaryExclusions: [],
      likesDislikes: null,
    }));
  });

  test("keeps all proposal changes local until explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<WeeklyPlanGenerator recipes={[
      { id: "53b1c22e-0ac9-44d7-b4f4-39ee7c4b176a", title: "Saved pasta", favorite: false },
      { id: "c5568d22-0ac9-44d7-b4f4-39ee7c4b176a", title: "Fallback soup", favorite: true },
    ]} weekStart="2026-06-15" />);

    await user.click(screen.getByLabelText("Simple meals"));
    await user.click(screen.getByRole("button", { name: "Generate dinner proposal" }));
    expect(await screen.findByText("Review your proposal before anything is saved.")).toBeInTheDocument();
    expect(mocks.confirmWeeklyPlan).not.toHaveBeenCalled();

    const generatedCard = screen.getByRole("heading", { name: "Tomato pasta" }).closest("article")!;
    await user.clear(within(generatedCard).getByLabelText("Recipe title"));
    await user.type(within(generatedCard).getByLabelText("Recipe title"), "Edited pasta");
    await user.click(within(generatedCard).getAllByRole("button", { name: "Remove" }).at(-1)!);
    expect(mocks.confirmWeeklyPlan).not.toHaveBeenCalled();

    const savedCard = screen.getByRole("heading", { name: "Saved pasta" }).closest("article")!;
    await user.selectOptions(within(savedCard).getByLabelText("Replace Saved pasta"), "c5568d22-0ac9-44d7-b4f4-39ee7c4b176a");
    expect(screen.getByRole("heading", { name: "Fallback soup" })).toBeInTheDocument();
    expect(mocks.confirmWeeklyPlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm and save 1 dinner" }));
    expect(mocks.confirmWeeklyPlan).toHaveBeenCalledWith(expect.objectContaining({
      weekStart: "2026-06-15",
      items: [expect.objectContaining({ plannedFor: "2026-06-15", source: "saved", recipeId: "c5568d22-0ac9-44d7-b4f4-39ee7c4b176a" })],
    }));
  });

  test("renders failed-generation slots as editable draft fields", async () => {
    const user = userEvent.setup();
    mocks.generateWeeklyPlanProposal.mockResolvedValue({
      items: [{
        plannedFor: "2026-06-15", source: "empty", reviewRequired: true,
        reason: "The local model is unavailable.",
        draft: { title: "", servings: 1, estimatedMinutes: null, rationale: "", ingredients: [{ itemName: "", quantity: null, unit: null, notes: null }], instructions: "" },
      }],
      emptySlots: 1,
      ollama: { status: "unavailable", message: "Start Ollama locally." },
    });
    render(<WeeklyPlanGenerator recipes={[]} weekStart="2026-06-15" />);

    await user.click(screen.getByRole("button", { name: "Generate dinner proposal" }));
    const card = (await screen.findByRole("heading", { name: "Empty dinner slot" })).closest("article")!;
    await user.type(within(card).getByLabelText("Recipe title"), "Manual dinner");
    await user.type(within(card).getByLabelText("Why this recipe fits"), "A manually completed dinner.");
    await user.type(within(card).getByLabelText("Ingredient 1 name"), "Pasta");
    await user.type(within(card).getByLabelText("Method"), "Cook and serve.");

    expect(screen.getByRole("heading", { name: "Manual dinner" })).toBeInTheDocument();
    await user.click(within(card).getByRole("checkbox", { name: "Accept this dinner" }));
    await user.click(screen.getByRole("button", { name: "Confirm and save 1 dinner" }));
    expect(mocks.confirmWeeklyPlan).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ source: "generated", plannedFor: "2026-06-15" })],
    }));
  });
});
