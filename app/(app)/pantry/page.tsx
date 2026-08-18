import { PantryItemForm } from "@/components/forms/pantry-item-form";
import { PantryTable } from "@/components/pantry/pantry-table";
import { requireHousehold } from "@/lib/auth/household";
import { createClient } from "@/lib/supabase/server";

export default async function PantryPage() {
  const { householdId } = await requireHousehold();
  const supabase = await createClient();
  const { data: pantryItems, error } = await supabase
    .from("pantry_items")
    .select("id, item_name, quantity, unit, category, expiry_date")
    .eq("household_id", householdId)
    .order("item_name", { ascending: true });

  if (error) {
    throw new Error("Failed to load pantry items");
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Pantry</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Track the ingredients you have on hand so shopping lists reflect what your household still needs.
        </p>
      </div>

      <PantryItemForm />
      <PantryTable items={pantryItems ?? []} />
    </div>
  );
}
