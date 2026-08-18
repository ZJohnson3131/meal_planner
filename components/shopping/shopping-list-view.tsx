"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { generateShoppingList } from "@/app/actions/shopping";
import { exportShoppingListText } from "@/lib/domain/shopping-export";

export type ShoppingListItem = {
  id: string;
  item_name: string;
  delta_quantity: number | string | null;
  unit: string | null;
  status: "needed" | "checked" | "dismissed";
  review_required: boolean;
  review_reason: string | null;
};

export type ShoppingList = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "draft" | "active" | "archived";
};

type ShoppingListViewProps = {
  shoppingList: ShoppingList | null;
  items: ShoppingListItem[];
};

type GenerateState = { error: string | null };

const initialGenerateState: GenerateState = { error: null };

function dateFromIso(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function formatDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(dateFromIso(startDate))} – ${formatter.format(dateFromIso(endDate))}`;
}

function defaultWeekRange() {
  const today = new Date();
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - mondayOffset));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function submitGenerate(_previousState: GenerateState, formData: FormData): Promise<GenerateState> {
  try {
    await generateShoppingList(formData);
    return initialGenerateState;
  } catch {
    return { error: "We could not generate a shopping list. Please try again." };
  }
}

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Generating…" : "Generate shopping list"}
    </button>
  );
}

function Quantity({ item }: { item: ShoppingListItem }) {
  if (item.delta_quantity === null) {
    return <span className="text-slate-600">Quantity needs review</span>;
  }

  return <span className="font-medium text-slate-950">{item.delta_quantity}{item.unit ? ` ${item.unit}` : ""}</span>;
}

function ReviewFlag({ item }: { item: ShoppingListItem }) {
  if (!item.review_required) return null;

  return (
    <p className="mt-1 text-xs text-amber-800">
      Review needed{item.review_reason ? `: ${item.review_reason}` : "."}
    </p>
  );
}

/** Generates, reviews, exports, and locally checks off the latest shopping list. */
export function ShoppingListView({ shoppingList, items }: ShoppingListViewProps) {
  const defaults = useMemo(() => defaultWeekRange(), []);
  const [generateState, generateAction] = useActionState(submitGenerate, initialGenerateState);
  const [checkedItemIds, setCheckedItemIds] = useState(() => new Set(
    items.filter((item) => item.status === "checked").map((item) => item.id),
  ));
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const exportText = shoppingList
    ? exportShoppingListText(items.map((item) => ({
      itemName: item.item_name,
      deltaQuantity: item.delta_quantity === null ? null : Number(item.delta_quantity),
      unit: item.unit,
      reviewRequired: item.review_required,
    })))
    : "";
  const neededItems = shoppingList ? items.filter((item) => item.status !== "dismissed") : [];
  const reviewItems = neededItems.filter((item) => item.review_required);

  async function copyList() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function toggleChecked(itemId: string) {
    setCheckedItemIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <section aria-labelledby="shopping-list-heading" className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Generate from your dinner plan</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Choose the date range to compare planned recipe ingredients against your pantry.</p>
        <form action={generateAction} className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium text-slate-800" htmlFor="shopping-start-date">
            Start date
            <input className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={defaults.startDate} id="shopping-start-date" name="startDate" required type="date" />
          </label>
          <label className="text-sm font-medium text-slate-800" htmlFor="shopping-end-date">
            End date
            <input className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" defaultValue={defaults.endDate} id="shopping-end-date" name="endDate" required type="date" />
          </label>
          <GenerateButton />
        </form>
        {generateState.error ? <p className="mt-3 text-sm text-red-700" role="alert">{generateState.error}</p> : null}
      </div>

      {!shoppingList ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">Generate a list after planning dinners to see what your household still needs.</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950" id="shopping-list-heading">{shoppingList.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{formatDateRange(shoppingList.start_date, shoppingList.end_date)}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{shoppingList.status}</span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="font-semibold text-slate-950">Needed items</h3>
              <p className="mt-1 text-sm text-slate-600">Check off items as you shop. Checkmarks stay in this browser until a future update saves them.</p>
            </div>
            {neededItems.length === 0 ? <p className="p-5 text-sm text-slate-600">Your pantry covers every planned ingredient in this list.</p> : (
              <ul className="divide-y divide-slate-200" aria-label="Shopping list items">
                {neededItems.map((item) => {
                  const checked = checkedItemIds.has(item.id);
                  return (
                    <li className="flex gap-3 px-5 py-4" key={item.id}>
                      <input aria-label={`Mark ${item.item_name} as checked`} checked={checked} className="mt-1 h-4 w-4 rounded border-slate-400 text-emerald-700 focus:ring-emerald-700" id={`shopping-item-${item.id}`} onChange={() => toggleChecked(item.id)} type="checkbox" />
                      <label className="min-w-0 flex-1 cursor-pointer" htmlFor={`shopping-item-${item.id}`}>
                        <span className={`block font-medium ${checked ? "text-slate-500 line-through" : "text-slate-950"}`}>{item.item_name}</span>
                        <ReviewFlag item={item} />
                      </label>
                      <Quantity item={item} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {reviewItems.length > 0 ? (
            <aside aria-labelledby="shopping-review-heading" className="rounded-lg border border-amber-200 bg-amber-50 p-5">
              <h3 className="font-semibold text-amber-950" id="shopping-review-heading">Review before buying</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {reviewItems.map((item) => <li key={item.id}>{item.item_name}{item.review_reason ? ` — ${item.review_reason}` : ""}</li>)}
              </ul>
            </aside>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={copyList} type="button">Copy plain text</button>
            <a className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" download="shopping-list.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(exportText)}`}>Download plain text</a>
            <p aria-live="polite" className="self-center text-sm text-slate-600">{copyStatus === "copied" ? "Shopping list copied." : copyStatus === "failed" ? "Could not copy the list. Use the download link instead." : ""}</p>
          </div>
        </div>
      )}
    </section>
  );
}
