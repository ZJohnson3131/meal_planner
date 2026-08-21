"use client";

import { useActionState, useOptimistic, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

import {
  generateShoppingList,
  setShoppingItemStatus,
  type ShoppingItemFormState,
} from "@/app/actions/shopping";
import {
  calendarDateToNeutralDate,
  calendarWeekRange,
  isIsoCalendarDate,
  localCalendarDate,
} from "@/lib/domain/calendar";
import { exportShoppingListText } from "@/lib/domain/shopping-export";

type ShoppingItemStatus = "needed" | "checked" | "dismissed";

export type ShoppingListItem = {
  id: string;
  item_name: string;
  delta_quantity: number | string | null;
  unit: string | null;
  status: ShoppingItemStatus;
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
  initialCalendarDate?: string;
  shoppingList: ShoppingList | null;
  items: ShoppingListItem[];
};

const initialStatusState: ShoppingItemFormState = { error: null, success: false };

function formatDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(calendarDateToNeutralDate(startDate))} – ${formatter.format(calendarDateToNeutralDate(endDate))}`;
}

function GenerateButton() {
  const { pending } = useFormStatus();

  return (
    <button className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
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

  return <p className="mt-1 text-xs text-amber-800">Review needed{item.review_reason ? `: ${item.review_reason}` : "."}</p>;
}

function ShoppingItemRow({ item }: { item: ShoppingListItem }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(item.status);
  const [state, submitStatus, pending] = useActionState(async (previousState: ShoppingItemFormState, formData: FormData) => {
    const requestedStatus = formData.get("status");
    if (requestedStatus === "needed" || requestedStatus === "checked" || requestedStatus === "dismissed") {
      setOptimisticStatus(requestedStatus);
    }
    return setShoppingItemStatus(previousState, formData);
  }, initialStatusState);
  const checked = optimisticStatus === "checked";

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <form action={submitStatus}>
          <input name="itemId" type="hidden" value={item.id} />
          <input name="status" type="hidden" value={checked ? "needed" : "checked"} />
          <input
            aria-label={`Mark ${item.item_name} as checked`}
            checked={checked}
            className="mt-1 h-4 w-4 rounded border-slate-400 text-emerald-700 focus:ring-emerald-700 disabled:cursor-wait disabled:opacity-60"
            disabled={pending}
            id={`shopping-item-${item.id}`}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            type="checkbox"
          />
        </form>
        <label className="min-w-0 flex-1 cursor-pointer" htmlFor={`shopping-item-${item.id}`}>
          <span className={`block font-medium ${checked ? "text-slate-500 line-through" : "text-slate-950"}`}>{item.item_name}</span>
          <ReviewFlag item={item} />
        </label>
        <Quantity item={item} />
        <form action={submitStatus}>
          <input name="itemId" type="hidden" value={item.id} />
          <input name="status" type="hidden" value="dismissed" />
          <button className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Saving…" : `Dismiss ${item.item_name}`}
          </button>
        </form>
      </div>
      {state.error ? <p className="mt-2 text-sm text-red-700" role="alert">{state.error}</p> : null}
    </li>
  );
}

function DismissedShoppingItem({ item }: { item: ShoppingListItem }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(item.status);
  const [state, submitStatus, pending] = useActionState(async (previousState: ShoppingItemFormState, formData: FormData) => {
    setOptimisticStatus("needed");
    return setShoppingItemStatus(previousState, formData);
  }, initialStatusState);

  if (optimisticStatus !== "dismissed") return null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="text-sm text-slate-600">{item.item_name}</span>
      <form action={submitStatus}>
        <input name="itemId" type="hidden" value={item.id} />
        <input name="status" type="hidden" value="needed" />
        <button className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Restoring…" : `Restore ${item.item_name}`}
        </button>
      </form>
      {state.error ? <p className="basis-full text-sm text-red-700" role="alert">{state.error}</p> : null}
    </li>
  );
}

/** Generates, reviews, exports, and persists item state for the latest shopping list. */
export function ShoppingListView({ initialCalendarDate, shoppingList, items }: ShoppingListViewProps) {
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [selectedRange, setSelectedRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const browserDate = initialCalendarDate && isIsoCalendarDate(initialCalendarDate)
    ? initialCalendarDate
    : hydrated
      ? localCalendarDate(new Date())
      : null;
  const range = selectedRange ?? (browserDate
    ? calendarWeekRange(browserDate)
    : { startDate: "", endDate: "" });

  const exportableItems = shoppingList
    ? items.filter((item) => item.status === "needed" || item.status === "checked")
    : [];
  const dismissedItems = shoppingList ? items.filter((item) => item.status === "dismissed") : [];
  const reviewItems = exportableItems.filter((item) => item.review_required);
  const exportText = shoppingList
    ? exportShoppingListText(exportableItems.map((item) => ({
      itemName: item.item_name,
      deltaQuantity: item.delta_quantity === null ? null : Number(item.delta_quantity),
      unit: item.unit,
      reviewRequired: item.review_required,
    })))
    : "";

  async function copyList() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section aria-labelledby="shopping-list-heading" className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Generate from your dinner plan</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Choose the date range to compare planned recipe ingredients against your pantry.</p>
        <form action={generateShoppingList} className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium text-slate-800" htmlFor="shopping-start-date">
            Start date
            <input className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" id="shopping-start-date" name="startDate" onChange={(event) => setSelectedRange({ ...range, startDate: event.target.value })} required type="date" value={range.startDate} />
          </label>
          <label className="text-sm font-medium text-slate-800" htmlFor="shopping-end-date">
            End date
            <input className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-slate-950 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100" id="shopping-end-date" name="endDate" onChange={(event) => setSelectedRange({ ...range, endDate: event.target.value })} required type="date" value={range.endDate} />
          </label>
          <GenerateButton />
        </form>
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
              <p className="mt-1 text-sm text-slate-600">Checked and dismissed states are saved for your household.</p>
            </div>
            {exportableItems.length === 0 ? <p className="p-5 text-sm text-slate-600">Your pantry covers every planned ingredient in this list.</p> : (
              <ul aria-label="Shopping list items" className="divide-y divide-slate-200">
                {exportableItems.map((item) => <ShoppingItemRow item={item} key={item.id} />)}
              </ul>
            )}
          </div>

          {dismissedItems.length > 0 ? (
            <details className="rounded-lg border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-800">Dismissed items ({dismissedItems.length})</summary>
              <ul aria-label="Dismissed shopping list items" className="divide-y divide-slate-200 border-t border-slate-200">
                {dismissedItems.map((item) => <DismissedShoppingItem item={item} key={item.id} />)}
              </ul>
            </details>
          ) : null}

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
