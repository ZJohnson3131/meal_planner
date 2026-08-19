import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/pantry", () => ({
  createPantryItem: vi.fn(),
  deletePantryItem: vi.fn(),
  updatePantryItem: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { PantryItemForm } from "@/components/forms/pantry-item-form";
import { PantryTable } from "@/components/pantry/pantry-table";

describe("PantryItemForm", () => {
  test("collects the required and optional pantry item details accessibly", () => {
    render(<PantryItemForm />);

    expect(screen.getByRole("heading", { name: "Add pantry item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Item name")).toBeRequired();
    expect(screen.getByLabelText("Quantity")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Quantity")).toHaveAttribute("min", "0");
    expect(screen.getByLabelText("Unit")).toBeRequired();
    expect(screen.getByLabelText(/Category/)).not.toBeRequired();
    expect(screen.getByLabelText(/Expiry date/)).toHaveAttribute("type", "date");
    expect(screen.getByRole("button", { name: "Add to pantry" })).toHaveAttribute("type", "submit");
  });
});

describe("PantryTable", () => {
  test("renders an empty state when the household has no pantry inventory", () => {
    render(<PantryTable items={[]} />);

    expect(screen.getByText(/Your pantry is empty/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("renders editable inventory fields and clearly-labelled item actions", () => {
    render(
      <PantryTable
        items={[
          {
            id: "9f11fef8-1b56-4a82-b5d6-a7a01a3055bb",
            item_name: "Rice",
            quantity: 1.5,
            unit: "kg",
            category: "Dry goods",
            expiry_date: "2026-12-01",
          },
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Pantry inventory" });
    expect(within(table).getByRole("columnheader", { name: "Item" })).toBeInTheDocument();
    expect(within(table).getByLabelText("Item name for Rice")).toHaveValue("Rice");
    expect(within(table).getByLabelText("Quantity for Rice")).toHaveValue(1.5);
    expect(within(table).getByLabelText("Unit for Rice")).toHaveValue("kg");
    expect(within(table).getByLabelText("Category for Rice")).toHaveValue("Dry goods");
    expect(within(table).getByLabelText("Expiry date for Rice")).toHaveValue("2026-12-01");
    expect(within(table).getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
    expect(within(table).getByRole("button", { name: "Delete Rice" })).toHaveAttribute("type", "submit");
  });
});
