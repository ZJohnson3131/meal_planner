import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeMeal: vi.fn(),
  getMealCompletionPreview: vi.fn(),
}));

vi.mock("@/app/actions/meal-plans", () => ({
  completeMeal: mocks.completeMeal,
  getMealCompletionPreview: mocks.getMealCompletionPreview,
}));

import { CompletionDialog } from "@/components/meal-planner/completion-dialog";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

describe("CompletionDialog", () => {
  test("loads and displays clean deductions and review-required items before confirmation", async () => {
    const user = userEvent.setup();
    mocks.getMealCompletionPreview.mockResolvedValue({
      clean: [{ recipeIngredientId: "ingredient-1", pantryItemId: "pantry-1", itemName: "Rice", quantity: 100, unit: "g", reviewRequired: false }],
      review: [{ recipeIngredientId: "ingredient-2", pantryItemId: null, itemName: "Oil", quantity: null, unit: null, reviewRequired: true, reviewReason: "No compatible pantry item" }],
    });
    render(<CompletionDialog entryId="entry-1" recipeTitle="Pasta" />);

    await user.click(screen.getByRole("button", { name: "Complete dinner" }));

    expect(await screen.findByRole("heading", { name: "Complete Pasta" })).toBeInTheDocument();
    expect(await screen.findByText("Rice")).toBeInTheDocument();
    expect(screen.getByText(/100 g/)).toBeInTheDocument();
    expect(screen.getByText("Oil")).toBeInTheDocument();
    expect(screen.getByText(/review needed: no compatible pantry item/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm completion" })).toBeEnabled();
    expect(mocks.getMealCompletionPreview).toHaveBeenCalledWith("entry-1");
  });

  test("does not enable completion when the pantry preview cannot be prepared", async () => {
    const user = userEvent.setup();
    mocks.getMealCompletionPreview.mockRejectedValue(new Error("Unavailable"));
    render(<CompletionDialog entryId="entry-1" recipeTitle="Pasta" />);

    await user.click(screen.getByRole("button", { name: "Complete dinner" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not prepare the pantry review. Please try again.");
    expect(screen.getByRole("button", { name: "Confirm completion" })).toBeDisabled();
  });
});
