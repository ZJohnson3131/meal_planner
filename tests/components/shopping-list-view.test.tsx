import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateShoppingList: vi.fn(), setShoppingItemStatus: vi.fn() }));
const clipboardWriteText = vi.fn();

vi.mock("@/app/actions/shopping", () => ({
  generateShoppingList: mocks.generateShoppingList,
  setShoppingItemStatus: mocks.setShoppingItemStatus,
}));

import { ShoppingListView } from "@/components/shopping/shopping-list-view";

describe("ShoppingListView", () => {
  beforeEach(() => {
    mocks.generateShoppingList.mockReset();
    mocks.setShoppingItemStatus.mockReset();
    mocks.setShoppingItemStatus.mockImplementation(async (_state, formData: FormData) => ({
      error: null,
      status: formData.get("status"),
      success: true,
    }));
    clipboardWriteText.mockReset();
    clipboardWriteText.mockResolvedValue(undefined);
  });

  test("renders accessible generation controls and the empty-list guidance", () => {
    render(<ShoppingListView items={[]} shoppingList={null} />);

    expect(screen.getByRole("heading", { name: "Generate from your dinner plan" })).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("End date")).toHaveAttribute("type", "date");
    expect(screen.getByRole("button", { name: "Generate shopping list" })).toHaveAttribute("type", "submit");
    expect(screen.getByText(/Generate a list after planning dinners/)).toBeInTheDocument();
  });

  test("shows needed and review items, allows local check-off, and exports plain text", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });
    render(
      <ShoppingListView
        shoppingList={{
          id: "list-1", name: "Shopping list 2026-06-15 to 2026-06-21",
          start_date: "2026-06-15", end_date: "2026-06-21", status: "active",
        }}
        items={[
          {
            id: "rice", item_name: "rice", delta_quantity: 750, unit: "g", status: "needed",
            review_required: false, review_reason: null,
          },
          {
            id: "herbs", item_name: "herbs", delta_quantity: null, unit: null, status: "needed",
            review_required: true, review_reason: "Ingredient requires review",
          },
          {
            id: "ignored", item_name: "ignored", delta_quantity: 1, unit: "each", status: "dismissed",
            review_required: false, review_reason: null,
          },
        ]}
      />,
    );

    expect(screen.getByRole("list", { name: "Shopping list items" })).toBeInTheDocument();
    expect(screen.getByText("750 g")).toBeInTheDocument();
    expect(screen.getByText("Quantity needs review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review before buying" })).toBeInTheDocument();
    expect(screen.getByText("ignored")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore ignored" })).toBeInTheDocument();

    const riceCheckbox = screen.getByRole("checkbox", { name: "Mark rice as checked" });
    await user.click(riceCheckbox);
    expect(mocks.setShoppingItemStatus).toHaveBeenCalledOnce();
    const submittedStatus = mocks.setShoppingItemStatus.mock.calls[0][1] as FormData;
    expect(submittedStatus.get("itemId")).toBe("rice");
    expect(submittedStatus.get("status")).toBe("checked");

    await user.click(screen.getByRole("button", { name: "Copy plain text" }));
    expect(clipboardWriteText).toHaveBeenCalledWith("- rice: 750 g\n- herbs [review]");
    expect(screen.getByText("Shopping list copied.")).toBeInTheDocument();

    const download = screen.getByRole("link", { name: "Download plain text" });
    expect(download).toHaveAttribute("download", "shopping-list.txt");
    expect(decodeURIComponent(download.getAttribute("href") ?? "")).toContain("- rice: 750 g");
    expect(decodeURIComponent(download.getAttribute("href") ?? "")).not.toContain("ignored");
  });
});
