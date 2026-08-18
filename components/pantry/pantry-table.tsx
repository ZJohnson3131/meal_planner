"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { deletePantryItem, updatePantryItem } from "@/app/actions/pantry";

export type PantryTableItem = {
  id: string;
  item_name: string;
  quantity: number | string;
  unit: string;
  category: string | null;
  expiry_date: string | null;
};

type PantryTableProps = {
  items: PantryTableItem[];
};

type RowState = { error: string | null };
const rowInitialState: RowState = { error: null };

async function submitUpdate(_previousState: RowState, formData: FormData): Promise<RowState> {
  try {
    await updatePantryItem(formData);
    return rowInitialState;
  } catch {
    return { error: "We could not save this pantry item. Try again." };
  }
}

async function submitDelete(_previousState: RowState, formData: FormData): Promise<RowState> {
  try {
    await deletePantryItem(formData);
    return rowInitialState;
  } catch {
    return { error: "We could not delete this pantry item. Try again." };
  }
}

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
  const [updateState, updateAction] = useActionState(submitUpdate, rowInitialState);
  const [deleteState, deleteAction] = useActionState(submitDelete, rowInitialState);

  return (
    <tr className="border-b border-slate-200 last:border-0">
      <td className="p-3 align-top">
        <input aria-label={`Item name for ${item.item_name}`} className="w-full rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.item_name} form={`pantry-update-${item.id}`} name="itemName" required />
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Quantity for ${item.item_name}`} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={String(item.quantity)} form={`pantry-update-${item.id}`} min="0" name="quantity" required step="any" type="number" />
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Unit for ${item.item_name}`} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.unit} form={`pantry-update-${item.id}`} name="unit" required />
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Category for ${item.item_name}`} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.category ?? ""} form={`pantry-update-${item.id}`} name="category" placeholder="None" />
      </td>
      <td className="p-3 align-top">
        <input aria-label={`Expiry date for ${item.item_name}`} className="w-36 rounded-md border border-slate-300 px-2 py-1.5 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={item.expiry_date ?? ""} form={`pantry-update-${item.id}`} name="expiryDate" type="date" />
      </td>
      <td className="p-3 align-top">
        <div className="flex flex-wrap gap-2">
          <form action={updateAction} id={`pantry-update-${item.id}`}>
            <input name="id" type="hidden" value={item.id} />
            <SaveButton />
          </form>
          <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete ${item.item_name} from the pantry?`)) event.preventDefault(); }}>
            <input name="id" type="hidden" value={item.id} />
            <DeleteButton itemName={item.item_name} />
          </form>
        </div>
        {updateState.error ? <p className="mt-2 text-sm text-red-700" role="alert">{updateState.error}</p> : null}
        {deleteState.error ? <p className="mt-2 text-sm text-red-700" role="alert">{deleteState.error}</p> : null}
      </td>
    </tr>
  );
}

/** Displays and permits in-place editing or deletion of current pantry inventory. */
export function PantryTable({ items }: PantryTableProps) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-600">Your pantry is empty. Add an item above to start tracking what you have.</p>;
  }

  return (
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
        <tbody>{items.map((item) => <PantryRow item={item} key={item.id} />)}</tbody>
      </table>
    </div>
  );
}
