"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { deletePantryItem, updatePantryItem } from "@/app/actions/pantry";
import { SUPPORTED_COOKING_UNITS } from "@/lib/domain/units";

export type PantryTableItem = {
  id: string;
  item_name: string;
  quantity: number | string;
  unit: string;
  category: string | null;
  expiry_date: string | null;
  version?: number | string;
};

type PantryTableProps = {
  items: PantryTableItem[];
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function DeleteButton({ itemName }: { itemName: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
      {pending ? "Deleting…" : `Delete ${itemName}`}
    </button>
  );
}

function PantryRow({ item }: { item: PantryTableItem }) {
  const isEmpty = Number(item.quantity) === 0;
  return (
    <tr className="border-b border-slate-200 last:border-0">
      <td className="p-3 align-top">
        <input aria-label={`Item name for ${item.item_name}`} className="w-full rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.item_name} form={`pantry-update-${item.id}`} name="itemName" required />
        {isEmpty ? <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Empty</span> : null}
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Quantity for ${item.item_name}`} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={String(item.quantity)} form={`pantry-update-${item.id}`} min="0" name="quantity" required step="any" type="number" />
      </td>
      <td className="p-3 align-top">
        <select aria-label={`Unit for ${item.item_name}`} className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.unit} form={`pantry-update-${item.id}`} name="unit" required>
          {SUPPORTED_COOKING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Category for ${item.item_name}`} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.category ?? ""} form={`pantry-update-${item.id}`} name="category" placeholder="None" />
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Expiry date for ${item.item_name}`} className="w-36 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.expiry_date ?? ""} form={`pantry-update-${item.id}`} name="expiryDate" type="date" />
      </td>
      <td className="p-3 align-top">
        <div className="flex flex-wrap gap-2">
          <form action={updatePantryItem} id={`pantry-update-${item.id}`}>
            <input name="id" type="hidden" value={item.id} />
            <input name="version" type="hidden" value={item.version ?? ""} />
            <SaveButton />
          </form>
          <form action={deletePantryItem} onSubmit={(event) => { if (!window.confirm(`Delete ${item.item_name} from the pantry?`)) event.preventDefault(); }}>
            <input name="id" type="hidden" value={item.id} />
            <input name="version" type="hidden" value={item.version ?? ""} />
            <DeleteButton itemName={item.item_name} />
          </form>
        </div>
      </td>
    </tr>
  );
}

/** Displays and permits in-place editing or deletion of current pantry inventory. */
export function PantryTable({ items }: PantryTableProps) {
  const [showEmpty, setShowEmpty] = useState(true);
  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-600">Your pantry is empty. Add an item above to start tracking what you have.</p>;
  }

  const visibleItems = showEmpty ? items : items.filter((item) => Number(item.quantity) !== 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Empty items are retained so a completed meal can be reversed safely.</p>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input checked={showEmpty} onChange={(event) => setShowEmpty(event.target.checked)} type="checkbox" />
          Show empty items
        </label>
      </div>
      {visibleItems.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-slate-600">All pantry items are currently hidden because their quantity is zero.</p> : (
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[55rem] text-left text-sm">
        <caption className="sr-only">Pantry inventory</caption>
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th className="p-3 font-semibold" scope="col">Item</th>
            <th className="p-3 font-semibold" scope="col">Quantity</th>
            <th className="p-3 font-semibold" scope="col">Unit</th>
            <th className="p-3 font-semibold" scope="col">Category</th>
            <th className="p-3 font-semibold" scope="col">Expiry date</th>
            <th className="p-3 font-semibold" scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
          <tbody>{visibleItems.map((item) => <PantryRow item={item} key={item.id} />)}</tbody>
        </table>
      </div>
      )}
    </div>
  );
}
