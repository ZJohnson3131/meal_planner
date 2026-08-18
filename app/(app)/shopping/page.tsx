import { ShoppingListView } from "@/components/shopping/shopping-list-view";
import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

export default async function ShoppingPage() {
  const { householdId } = await requireHousehold();
  const supabase = await createClient();

  // Lists are snapshots; show the most recently generated list for this
  // household, while keeping its item query independently household-scoped.
  const { data: shoppingList, error: shoppingListError } = await supabase
    .from("shopping_lists")
    .select("id, name, start_date, end_date, status")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shoppingListError) {
    throw new Error("Failed to load the shopping list");
  }

  let items: Array<{
    id: string;
    item_name: string;
    required_quantity: number | null;
    pantry_quantity: number | null;
    delta_quantity: number | null;
    unit: string | null;
    status: "needed" | "checked" | "dismissed";
    review_required: boolean;
    review_reason: string | null;
  }> = [];

  if (shoppingList) {
    const { data, error } = await supabase
      .from("shopping_list_items")
      .select(
        "id, item_name, required_quantity, pantry_quantity, delta_quantity, unit, status, review_required, review_reason",
      )
      .eq("shopping_list_id", shoppingList.id)
      .order("item_name", { ascending: true });
    if (error) {
      throw new Error("Failed to load shopping-list items");
    }
    items = data ?? [];
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Shopping list</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Generate a household shopping list from planned dinners after accounting for what is in your pantry.
        </p>
      </div>

      <ShoppingListView items={items} shoppingList={shoppingList} />
    </div>
  );
}
