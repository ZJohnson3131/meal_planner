"use client";

import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { completeMeal, getMealCompletionPreview } from "@/app/actions/meal-plans";
import type { DeductionPlanItem } from "@/lib/domain/pantry-deductions";

type CompletionPreview = {
  clean: DeductionPlanItem[];
  review: DeductionPlanItem[];
};

function quantityLabel(item: DeductionPlanItem) {
  if (item.quantity === null || !item.unit) return "Quantity needs review";
  return `${item.quantity} ${item.unit}`;
}

function CompleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "Completing…" : "Confirm completion"}
    </button>
  );
}

function PreviewList({ items, tone }: { items: DeductionPlanItem[]; tone: "clean" | "review" }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-600">None.</p>;
  }

  return (
    <ul className="space-y-2" role="list">
      {items.map((item) => (
        <li className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" key={item.recipeIngredientId}>
          <span className="font-medium text-slate-950">{item.itemName}</span>
          <span>{` — ${quantityLabel(item)}`}</span>
          {tone === "review" && item.reviewReason ? (
            <p className="mt-1 text-xs text-amber-800">Review needed: {item.reviewReason}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Opens an accessible pre-completion review of the pantry deductions for one dinner. */
export function CompletionDialog({ entryId, recipeTitle }: { entryId: string; recipeTitle: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<CompletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewPending, startPreviewTransition] = useTransition();

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
    setPreview(null);
    setPreviewError(null);
    startPreviewTransition(async () => {
      try {
        setPreview(await getMealCompletionPreview(entryId));
      } catch {
        setPreviewError("We could not prepare the pantry review. Please try again.");
      }
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        onClick={openDialog}
        type="button"
      >
        Complete dinner
      </button>

      <dialog
        aria-labelledby={`completion-title-${entryId}`}
        className="w-[calc(100%-2rem)] max-w-xl rounded-lg border border-slate-200 p-0 text-slate-950 shadow-xl backdrop:bg-slate-950/40"
        onCancel={closeDialog}
        ref={dialogRef}
      >
        <div className="space-y-5 p-5">
          <div>
            <h2 className="text-xl font-semibold" id={`completion-title-${entryId}`}>Complete {recipeTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Review pantry changes before completing this dinner. Review-required ingredients will be recorded without changing pantry stock.</p>
          </div>

          {isPreviewPending ? <p className="text-sm text-slate-600" role="status">Preparing pantry review…</p> : null}
          {previewError ? <p className="text-sm text-red-700" role="alert">{previewError}</p> : null}
          {preview ? (
            <div className="space-y-5">
              <section aria-labelledby={`clean-deductions-${entryId}`}>
                <h3 className="text-sm font-semibold text-slate-950" id={`clean-deductions-${entryId}`}>Pantry deductions</h3>
                <div className="mt-2"><PreviewList items={preview.clean} tone="clean" /></div>
              </section>
              <section aria-labelledby={`review-deductions-${entryId}`}>
                <h3 className="text-sm font-semibold text-amber-900" id={`review-deductions-${entryId}`}>Items needing review</h3>
                <div className="mt-2"><PreviewList items={preview.review} tone="review" /></div>
              </section>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={closeDialog} type="button">Cancel</button>
            <form action={completeMeal}>
              <input name="entryId" type="hidden" value={entryId} />
              <CompleteButton disabled={preview === null || isPreviewPending || previewError !== null} />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
