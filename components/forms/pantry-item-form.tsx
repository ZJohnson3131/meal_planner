"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { createPantryItem, type PantryItemFormState } from "@/app/actions/pantry";
import { SUPPORTED_COOKING_UNITS } from "@/lib/domain/units";

const initialState: PantryItemFormState = { error: null, success: false };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Adding item…" : "Add to pantry"}
    </button>
  );
}

/** Collects a new household pantry item using the pantry server action. */
export function PantryItemForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, formAction] = useActionState(createPantryItem, initialState);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5" ref={formRef}>
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Add pantry item</h2>
        <p className="mt-1 text-sm text-slate-600">Record what you have on hand so shopping lists can account for it.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-800" htmlFor="pantry-item-name">
            Item name
          </label>
          <input
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            id="pantry-item-name"
            name="itemName"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="pantry-quantity">
            Quantity
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            id="pantry-quantity"
            min="0"
            name="quantity"
            required
            step="any"
            type="number"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="pantry-unit">
            Unit
          </label>
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            id="pantry-unit"
            name="unit"
            required
          >
            <option value="">Choose a unit</option>
            {SUPPORTED_COOKING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="pantry-category">
            Category <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            id="pantry-category"
            name="category"
            placeholder="Dry goods"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="pantry-expiry-date">
            Expiry date <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            id="pantry-expiry-date"
            name="expiryDate"
            type="date"
          />
        </div>
      </div>

      <div aria-live="polite">
        {state.error ? <p className="text-sm text-red-700" role="alert">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-800">Pantry item added.</p> : null}
      </div>
      <SubmitButton />
    </form>
  );
}
