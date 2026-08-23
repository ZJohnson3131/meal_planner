"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type {
  GeneratedRecipeDraft,
  WeeklyPlanEmptySlot,
  WeeklyPlanExistingEntry,
  WeeklyPlanGoal,
  WeeklyPlanProposal,
  WeeklyPlanProposalItem,
  WeeklyPlanPreferences,
} from "@/lib/domain/weekly-plan-types";
import { calendarDateToNeutralDate, calendarWeekDates } from "@/lib/domain/calendar";
import { SUPPORTED_COOKING_UNITS } from "@/lib/domain/units";

type SavedRecipe = { id: string; title: string; favorite: boolean };
type WeeklyPlanGeneratorProps = {
  recipes: SavedRecipe[];
  weekStart: string;
  existingEntries: WeeklyPlanExistingEntry[];
  confirmWeeklyPlan: (input: unknown) => Promise<{ success: true }>;
  generateWeeklyPlanProposal: (input: unknown) => Promise<WeeklyPlanProposal>;
};

const GOALS = [
  ["simple", "Simple meals"],
  ["high_protein", "High protein"],
  ["budget_friendly", "Budget-friendly"],
  ["family_friendly", "Family-friendly"],
  ["vegetarian", "Vegetarian"],
  ["pantry_friendly", "Pantry-friendly"],
] as const satisfies ReadonlyArray<readonly [WeeklyPlanGoal, string]>;
const DIETARY_OPTIONS = [
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["gluten", "Gluten-free"],
  ["dairy", "Dairy-free"],
] as const;
const EFFORT_OPTIONS = [
  ["quick", "Quick", "Up to 30 minutes"],
  ["balanced", "Balanced", "Comfortable weeknight cooking"],
  ["project", "Cooking project", "More time for something special"],
] as const;
const STEPS = [
  ["household", "Household", "How many people are you feeding?"],
  ["meals", "Meals", "How many dinners should we plan?"],
  ["dates", "Nights", "Which nights work for you?"],
  ["goals", "Goals", "What would make this week feel good?"],
  ["effort", "Effort", "How much cooking energy do you have?"],
  ["dietary", "Dietary", "Anything you would like to leave out?"],
  ["tuning", "Fine-tune", "Any final preferences?"],
  ["review", "Review", "Check every proposed dinner"],
] as const;
const HOUSEHOLD_MIN = 1;
const HOUSEHOLD_MAX = 8;

type Step = (typeof STEPS)[number][0];
type Effort = (typeof EFFORT_OPTIONS)[number][0];
type PreferenceState = {
  householdSize: number;
  cookingEffort: Effort;
  goals: WeeklyPlanGoal[];
  dietaryExclusions: string[];
  likesDislikes: string;
  maxCookingMinutes: number | null;
  preferFavorites: boolean;
};
type DraftIngredient = GeneratedRecipeDraft["ingredients"][number];
type ProposalItem = WeeklyPlanProposalItem | WeeklyPlanEmptySlot;
type ReviewItem = ProposalItem & { decision: "use" | "keep" | "leave" };

const DEFAULT_PREFERENCES: PreferenceState = {
  householdSize: 2,
  cookingEffort: "balanced",
  goals: [],
  dietaryExclusions: [],
  likesDislikes: "",
  maxCookingMinutes: null,
  preferFavorites: false,
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(calendarDateToNeutralDate(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(calendarDateToNeutralDate(value));
}

function emptyIngredient(): DraftIngredient {
  return { itemName: "", quantity: null, unit: null, notes: null };
}

function statusLabel(status: WeeklyPlanExistingEntry["status"]) {
  return status === "planned" ? "Planned" : status === "skipped" ? "Skipped" : "Settled";
}

function initialDecision(item: ProposalItem): ReviewItem["decision"] {
  return item.source === "empty" ? "leave" : item.current ? "keep" : "use";
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Progressive flow; answers and drafts remain local until confirmation. */
export function WeeklyPlanGeneratorClient({
  recipes,
  weekStart,
  existingEntries,
  confirmWeeklyPlan,
  generateWeeklyPlanProposal,
}: WeeklyPlanGeneratorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const weekDates = useMemo(() => calendarWeekDates(weekStart), [weekStart]);
  const completedDates = useMemo(
    () => new Set(existingEntries.filter((entry) => entry.status === "completed").map((entry) => entry.plannedFor)),
    [existingEntries],
  );
  const entryByDate = useMemo(
    () => new Map(existingEntries.map((entry) => [entry.plannedFor, entry])),
    [existingEntries],
  );
  const eligibleDates = useMemo(
    () => weekDates.filter((date) => !completedDates.has(date)),
    [completedDates, weekDates],
  );
  const openDates = useMemo(
    () => eligibleDates.filter((date) => !entryByDate.has(date)),
    [eligibleDates, entryByDate],
  );
  const maxMealCount = Math.max(1, eligibleDates.length);
  const defaultMealCount = Math.min(Math.max(openDates.length, 1), maxMealCount);
  const defaultSelectedDates = openDates.slice(0, defaultMealCount);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("household");
  const [mealCount, setMealCount] = useState(defaultMealCount);
  const [selectedDates, setSelectedDates] = useState<string[]>(defaultSelectedDates);
  const [preferences, setPreferences] = useState<PreferenceState>(DEFAULT_PREFERENCES);
  const [proposal, setProposal] = useState<WeeklyPlanProposal | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isConfirming, startConfirming] = useTransition();

  const currentStepIndex = STEPS.findIndex(([value]) => value === step);
  const approvedItems = reviewItems.filter((item) => item.decision === "use");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      window.setTimeout(() => {
        dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();
      }, 0);
    } else if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isOpen]);

  function clearMessage() {
    setError(null);
    setSuccess(null);
  }

  function openModal() {
    setSuccess(null);
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
  }

  function navigateTo(nextStep: Step) {
    if (nextStep === "review" && !proposal) return;
    clearMessage();
    setStep(nextStep);
  }

  function toggleDate(date: string) {
    if (completedDates.has(date)) return;
    setSelectedDates((current) => {
      if (current.includes(date)) return current.filter((value) => value !== date);
      if (current.length >= mealCount) return current;
      return [...current, date].sort();
    });
    setError(null);
  }

  function changeMealCount(nextValue: number) {
    const nextCount = clamp(nextValue, 1, maxMealCount);
    setMealCount(nextCount);
    setSelectedDates((current) => current.filter((date) => eligibleDates.some((eligibleDate) => eligibleDate === date)).slice(0, nextCount));
    setError(null);
  }

  function toggleArrayValue(key: "goals" | "dietaryExclusions", value: string) {
    setPreferences((current) => {
      const values = current[key] as string[];
      return {
        ...current,
        [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      };
    });
  }

  function clearArrayValue(key: "goals" | "dietaryExclusions") {
    setPreferences((current) => ({ ...current, [key]: [] }));
  }

  function generate() {
    if (selectedDates.length !== mealCount) {
      setError(`Choose exactly ${mealCount} night${mealCount === 1 ? "" : "s"} before generating.`);
      setStep("dates");
      return;
    }

    const input: WeeklyPlanPreferences = {
      weekStart,
      selectedDates,
      householdSize: preferences.householdSize,
      cookingEffort: preferences.cookingEffort,
      goals: preferences.goals,
      maxCookingMinutes: preferences.maxCookingMinutes,
      dietaryExclusions: preferences.dietaryExclusions,
      likesDislikes: preferences.likesDislikes.trim() || null,
      preferFavorites: preferences.preferFavorites,
    };

    clearMessage();
    startGenerating(async () => {
      try {
        const nextProposal = await generateWeeklyPlanProposal(input);
        setProposal(nextProposal);
        setReviewItems(nextProposal.items.map((item) => ({ ...item, decision: initialDecision(item) })));
        setStep("review");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We could not generate a weekly proposal. Please try again.");
      }
    });
  }

  function updateReview(index: number, patch: Partial<ReviewItem>) {
    setReviewItems((current) => current.map((item, itemIndex) => itemIndex === index ? ({ ...item, ...patch } as ReviewItem) : item));
  }

  function replaceWithSaved(index: number, recipeId: string) {
    const savedRecipe = recipes.find((recipe) => recipe.id === recipeId);
    if (!savedRecipe) return;
    const item = reviewItems[index];
    setReviewItems((current) => current.map((value, itemIndex) => itemIndex === index
      ? {
          plannedFor: item.plannedFor,
          source: "saved",
          current: item.current,
          recipeId: savedRecipe.id,
          savedRecipe: { title: savedRecipe.title, description: null, servings: null, instructions: "", ingredients: [] },
          rationale: `Replaced with saved recipe: ${savedRecipe.title}.`,
          reviewRequired: false,
          decision: item.decision,
        }
      : value));
  }

  function confirm() {
    if (approvedItems.length === 0) return;
    clearMessage();
    startConfirming(async () => {
      try {
        await confirmWeeklyPlan({ weekStart, items: approvedItems });
        setSuccess(`${approvedItems.length} dinner${approvedItems.length === 1 ? "" : "s"} saved to your plan.`);
        setProposal(null);
        setReviewItems([]);
        setStep("household");
        setMealCount(defaultMealCount);
        setSelectedDates(defaultSelectedDates);
        closeModal();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Your plan was not finalised. Review it and try again.");
      }
    });
  }

  function startOver() {
    setStep("household");
    setMealCount(defaultMealCount);
    setSelectedDates(defaultSelectedDates);
    setPreferences(DEFAULT_PREFERENCES);
    setProposal(null);
    setReviewItems([]);
    clearMessage();
  }

  const weekLabel = `${shortDate(weekDates[0])} – ${shortDate(weekDates[weekDates.length - 1])}`;

  return (
    <section aria-labelledby="plan-my-week-heading" className="rounded-2xl border border-soft-border bg-cream p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-terracotta">Weekly guide</p>
          <h2 className="mt-2 text-2xl font-semibold text-espresso" id="plan-my-week-heading">Plan my week</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-espresso/75">A few warm-up questions, then a clear review of every dinner before anything is saved.</p>
        </div>
        <button className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" data-autofocus="true" onClick={openModal} type="button">Open weekly guide</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-espresso/75"><span>{weekLabel}</span><span>{mealCount} dinner{mealCount === 1 ? "" : "s"} ready to plan</span></div>
      {success ? <p aria-live="polite" className="mt-4 text-sm font-semibold text-sage" role="status">{success}</p> : null}

      <dialog aria-labelledby="weekly-guide-title" aria-modal="true" className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-6xl overflow-hidden rounded-2xl border border-soft-border bg-parchment p-0 text-espresso shadow-2xl backdrop:bg-espresso/65 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)]" onCancel={(event) => { event.preventDefault(); closeModal(); }} onClose={() => setIsOpen(false)} ref={dialogRef}>
        <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[calc(100dvh-2rem)]">
          <header className="flex items-start justify-between gap-4 border-b border-soft-border bg-cream px-5 py-4 sm:px-7">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-terracotta">Warm weekly guide</p><h2 className="mt-1 text-xl font-semibold text-espresso sm:text-2xl" id="weekly-guide-title">Build a week that fits real life</h2><p className="mt-1 text-sm text-espresso/70">{weekLabel} · nothing is saved until you confirm.</p></div>
            <button aria-label="Close weekly guide" className="rounded-lg border border-soft-border bg-cream px-3 py-2 text-xl leading-none text-espresso/75 hover:border-terracotta hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" data-dialog-autofocus="true" onClick={closeModal} type="button">×</button>
          </header>
          <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <div className="mb-5 lg:hidden"><ProgressSummary currentStep={step} mealCount={mealCount} selectedDates={selectedDates} /></div>
            <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <OverviewRail currentStep={step} currentStepIndex={currentStepIndex} mealCount={mealCount} preferences={preferences} selectedDates={selectedDates} weekLabel={weekLabel} onEdit={navigateTo} />
              <main aria-label="Weekly guide step" className="min-w-0">
                <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-saffron">Step {currentStepIndex + 1} of {STEPS.length}</p><h3 className="mt-1 text-xl font-semibold text-espresso">{STEPS[currentStepIndex][2]}</h3></div>{step !== "review" ? <span className="rounded-full bg-sage-soft px-3 py-1 text-xs font-semibold text-sage">Local Ollama only</span> : null}</div>
                {step === "household" ? <HouseholdStep value={preferences.householdSize} onChange={(value) => setPreferences((current) => ({ ...current, householdSize: value }))} onNext={() => navigateTo("meals")} /> : null}
                {step === "meals" ? <MealCountStep eligibleCount={eligibleDates.length} value={mealCount} onBack={() => navigateTo("household")} onChange={changeMealCount} onNext={() => navigateTo("dates")} /> : null}
                {step === "dates" ? <DateStep completedDates={completedDates} entryByDate={entryByDate} mealCount={mealCount} selectedDates={selectedDates} weekDates={weekDates} onBack={() => navigateTo("meals")} onContinue={() => selectedDates.length === mealCount ? navigateTo("goals") : setError(`Choose exactly ${mealCount} night${mealCount === 1 ? "" : "s"} to continue.`)} onToggle={toggleDate} /> : null}
                {step === "goals" ? <GoalsStep preferences={preferences} onBack={() => navigateTo("dates")} onNext={() => navigateTo("effort")} onNoPreference={() => clearArrayValue("goals")} onToggle={(value) => toggleArrayValue("goals", value)} /> : null}
                {step === "effort" ? <EffortStep preferences={preferences} onBack={() => navigateTo("goals")} onNext={() => navigateTo("dietary")} onChange={(value) => setPreferences((current) => ({ ...current, cookingEffort: value }))} /> : null}
                {step === "dietary" ? <DietaryStep preferences={preferences} onBack={() => navigateTo("effort")} onNext={() => navigateTo("tuning")} onNoPreference={() => clearArrayValue("dietaryExclusions")} onToggle={(value) => toggleArrayValue("dietaryExclusions", value)} /> : null}
                {step === "tuning" ? <TuningStep isGenerating={isGenerating} preferences={preferences} onBack={() => navigateTo("dietary")} onChange={setPreferences} onGenerate={generate} onSkip={generate} /> : null}
                {step === "review" && proposal ? <ReviewPanel isConfirming={isConfirming} items={reviewItems} onBack={() => navigateTo("tuning")} onChange={updateReview} onConfirm={confirm} onReplace={replaceWithSaved} onRetry={() => { setProposal(null); setReviewItems([]); navigateTo("tuning"); }} onStartOver={startOver} proposal={proposal} recipes={recipes} /> : null}
                {error ? <p aria-live="assertive" className="mt-5 rounded-xl border border-berry/30 bg-berry/10 p-3 text-sm font-medium text-berry" role="alert">{error}</p> : null}
              </main>
            </div>
          </div>
        </div>
      </dialog>
    </section>
  );
}

function OverviewRail({ currentStep, currentStepIndex, mealCount, preferences, selectedDates, weekLabel, onEdit }: { currentStep: Step; currentStepIndex: number; mealCount: number; preferences: PreferenceState; selectedDates: string[]; weekLabel: string; onEdit: (step: Step) => void }) {
  return <aside aria-label="Weekly guide overview" className="hidden rounded-2xl border border-soft-border bg-cream p-4 lg:block"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta">Your week</p><p className="mt-2 text-sm font-semibold text-espresso">{weekLabel}</p><div className="mt-4 space-y-2 border-b border-soft-border pb-4 text-sm text-espresso/75"><p><span className="font-semibold text-espresso">{mealCount}</span> dinners</p><p><span className="font-semibold text-espresso">{selectedDates.length}/{mealCount}</span> nights selected</p></div><ol aria-label="Completed answers" className="mt-4 space-y-1">{STEPS.slice(0, -1).map(([value, label], index) => <li key={value}><button aria-current={currentStep === value ? "step" : undefined} className={`w-full rounded-lg px-2 py-2 text-left text-xs transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terracotta ${currentStep === value ? "bg-saffron/15 text-espresso" : "text-espresso/70 hover:bg-parchment"}`} disabled={index > currentStepIndex} onClick={() => onEdit(value)} type="button"><span className="flex items-center justify-between gap-2"><span>{index < currentStepIndex ? "✓ " : ""}{label}</span><span className="text-right font-medium">{answerSummary(value, preferences, mealCount, selectedDates)}</span></span></button></li>)}</ol>{currentStep === "review" ? <p className="mt-4 rounded-lg bg-violet/10 px-3 py-2 text-xs font-semibold text-violet">Proposal ready to review</p> : null}</aside>;
}

function ProgressSummary({ currentStep, mealCount, selectedDates }: { currentStep: Step; mealCount: number; selectedDates: string[] }) { const index = STEPS.findIndex(([value]) => value === currentStep); return <div className="flex items-center justify-between gap-3 rounded-xl border border-soft-border bg-cream px-3 py-3 text-sm"><span className="font-semibold text-espresso">{STEPS[index][1]}</span><span className="text-espresso/70">{selectedDates.length}/{mealCount} nights · {index + 1}/{STEPS.length}</span></div>; }

function answerSummary(step: Step, preferences: PreferenceState, mealCount: number, selectedDates: string[]) {
  if (step === "household") return `${preferences.householdSize} ${preferences.householdSize === 1 ? "person" : "people"}`;
  if (step === "meals") return `${mealCount}`;
  if (step === "dates") return `${selectedDates.length}/${mealCount}`;
  if (step === "goals") return preferences.goals.length ? `${preferences.goals.length} chosen` : "No preference";
  if (step === "effort") return EFFORT_OPTIONS.find(([value]) => value === preferences.cookingEffort)?.[1] ?? "Balanced";
  if (step === "dietary") return preferences.dietaryExclusions.length ? `${preferences.dietaryExclusions.length} excluded` : "No preference";
  if (step === "review") return "Ready";
  return preferences.likesDislikes || preferences.maxCookingMinutes || preferences.preferFavorites ? "Custom" : "Skipped";
}

function StepActions({ nextLabel, onBack, onNext, nextDisabled = false }: { nextLabel: string; onBack?: () => void; onNext: () => void; nextDisabled?: boolean }) { return <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-soft-border pt-5"><span>{onBack ? <button className="rounded-xl border border-soft-border bg-cream px-4 py-2.5 text-sm font-semibold text-espresso hover:border-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={onBack} type="button">Back</button> : null}</span><button className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-50" disabled={nextDisabled} onClick={onNext} type="button">{nextLabel}</button></div>; }

function HouseholdStep({ value, onChange, onNext }: { value: number; onChange: (value: number) => void; onNext: () => void }) { return <section aria-labelledby="household-step-title" className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">This helps us suggest portions and make the week feel doable.</p><div className="mt-8 flex items-center justify-center gap-5"><StepperButton label="Decrease household size" disabled={value <= HOUSEHOLD_MIN} onClick={() => onChange(value - 1)}>−</StepperButton><output aria-live="polite" className="min-w-28 text-center text-5xl font-semibold text-terracotta">{value}<span className="mt-1 block text-sm font-medium text-espresso/65">{value === 1 ? "person" : "people"}</span></output><StepperButton label="Increase household size" disabled={value >= HOUSEHOLD_MAX} onClick={() => onChange(value + 1)}>+</StepperButton></div><p className="mt-5 text-center text-xs text-espresso/60">Choose between {HOUSEHOLD_MIN} and {HOUSEHOLD_MAX} people.</p><StepActions nextLabel="Next: number of meals" onNext={onNext} /></section>; }

function MealCountStep({ eligibleCount, value, onBack, onChange, onNext }: { eligibleCount: number; value: number; onBack: () => void; onChange: (value: number) => void; onNext: () => void }) { const max = Math.max(1, eligibleCount); return <section aria-labelledby="meals-step-title" className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">You can fine-tune the exact nights next. Completed dinners are protected, while planned and skipped dinners can be replaced.</p><div className="mt-8 flex items-center justify-center gap-5"><StepperButton label="Decrease number of meals" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</StepperButton><output aria-live="polite" className="min-w-36 text-center text-5xl font-semibold text-terracotta">{value}<span className="mt-1 block text-sm font-medium text-espresso/65">dinner{value === 1 ? "" : "s"}</span></output><StepperButton label="Increase number of meals" disabled={value >= max} onClick={() => onChange(value + 1)}>+</StepperButton></div><p className="mt-5 text-center text-xs text-espresso/60">Up to {eligibleCount} eligible night{eligibleCount === 1 ? "" : "s"} this week.</p><StepActions nextLabel="Next: choose nights" onBack={onBack} onNext={onNext} /></section>; }

function StepperButton({ label, children, disabled, onClick }: { label: string; children: ReactNode; disabled: boolean; onClick: () => void }) { return <button aria-label={label} className="grid size-12 place-items-center rounded-full border-2 border-terracotta bg-cream text-2xl font-semibold text-terracotta hover:bg-terracotta hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:border-soft-border disabled:text-espresso/30" disabled={disabled} onClick={onClick} type="button">{children}</button>; }

function DateStep({ weekDates, selectedDates, entryByDate, completedDates, mealCount, onToggle, onContinue, onBack }: { weekDates: readonly string[]; selectedDates: string[]; entryByDate: Map<string, WeeklyPlanExistingEntry>; completedDates: Set<string>; mealCount: number; onToggle: (date: string) => void; onContinue: () => void; onBack: () => void }) { return <section className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">Select exactly {mealCount} eligible night{mealCount === 1 ? "" : "s"}. Open nights start selected; planned and skipped dinners are available for replacement.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{weekDates.map((date) => { const entry = entryByDate.get(date); const completed = completedDates.has(date); const selected = selectedDates.includes(date); const atLimit = !selected && selectedDates.length >= mealCount; return <button aria-disabled={completed || atLimit} aria-pressed={selected} className={`rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${completed ? "cursor-not-allowed border-soft-border bg-parchment text-espresso/45" : selected ? "border-sage bg-sage-soft text-espresso shadow-sm" : atLimit ? "cursor-not-allowed border-soft-border bg-parchment text-espresso/45" : "border-soft-border bg-cream text-espresso/75 hover:border-terracotta"}`} disabled={completed || atLimit} key={date} onClick={() => onToggle(date)} type="button"><span className="block text-sm font-semibold">{shortDate(date)}</span><span className="mt-2 block text-xs">{completed ? "Settled — protected" : entry ? `${statusLabel(entry.status)} · ${entry.recipeTitle}` : "Open night"}</span><span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${selected ? "bg-sage text-white" : "bg-parchment text-espresso/60"}`}>{completed ? "Protected" : selected ? "Selected" : atLimit ? "At meal limit" : "Available"}</span></button>; })}</div><p aria-live="polite" className="mt-4 text-sm font-semibold text-espresso">{selectedDates.length} of {mealCount} nights selected</p><StepActions nextLabel="Next: meal goals" onBack={onBack} onNext={onContinue} nextDisabled={selectedDates.length !== mealCount} /></section>; }

function GoalsStep({ preferences, onToggle, onNoPreference, onBack, onNext }: { preferences: PreferenceState; onToggle: (value: WeeklyPlanGoal) => void; onNoPreference: () => void; onBack: () => void; onNext: () => void }) { return <section className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">Choose as many as you like, or leave the week open-ended.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{GOALS.map(([value, label]) => <ChoiceTile active={preferences.goals.includes(value)} key={value} onClick={() => onToggle(value)}>{label}</ChoiceTile>)}<ChoiceTile active={preferences.goals.length === 0} onClick={onNoPreference}>No preference</ChoiceTile></div><StepActions nextLabel="Next: cooking effort" onBack={onBack} onNext={onNext} /></section>; }

function EffortStep({ preferences, onChange, onBack, onNext }: { preferences: PreferenceState; onChange: (value: Effort) => void; onBack: () => void; onNext: () => void }) { return <section className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">Pick the overall pace. You can still add a precise time limit later.</p><div className="mt-5 grid gap-3">{EFFORT_OPTIONS.map(([value, label, description]) => <ChoiceTile active={preferences.cookingEffort === value} description={description} key={value} onClick={() => onChange(value)}>{label}</ChoiceTile>)}</div><StepActions nextLabel="Next: dietary exclusions" onBack={onBack} onNext={onNext} /></section>; }

function DietaryStep({ preferences, onToggle, onNoPreference, onBack, onNext }: { preferences: PreferenceState; onToggle: (value: string) => void; onNoPreference: () => void; onBack: () => void; onNext: () => void }) { return <section className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">These are exclusions for suggestions, not medical or allergy advice. Review each recipe yourself.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{DIETARY_OPTIONS.map(([value, label]) => <ChoiceTile active={preferences.dietaryExclusions.includes(value)} key={value} onClick={() => onToggle(value)}>{label}</ChoiceTile>)}<ChoiceTile active={preferences.dietaryExclusions.length === 0} onClick={onNoPreference}>No preference</ChoiceTile></div><StepActions nextLabel="Next: fine-tune" onBack={onBack} onNext={onNext} /></section>; }

function TuningStep({ preferences, isGenerating, onChange, onBack, onGenerate, onSkip }: { preferences: PreferenceState; isGenerating: boolean; onChange: Dispatch<SetStateAction<PreferenceState>>; onBack: () => void; onGenerate: () => void; onSkip: () => void }) { return <section className="rounded-2xl border border-soft-border bg-cream p-5 sm:p-7"><p className="text-sm leading-6 text-espresso/75">Everything here is optional. Skip for now if you would rather see the first proposal.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-espresso" htmlFor="weekly-plan-custom-time">Maximum cooking time <span className="font-normal text-espresso/60">(optional)</span><div className="mt-2 flex"><input className="w-full rounded-l-xl border border-soft-border bg-parchment px-3 py-2 text-espresso" id="weekly-plan-custom-time" min="1" onChange={(event) => onChange((current) => ({ ...current, maxCookingMinutes: event.target.value ? Number(event.target.value) : null }))} type="number" value={preferences.maxCookingMinutes ?? ""} /><span className="inline-flex items-center rounded-r-xl border border-l-0 border-soft-border bg-parchment px-3 text-sm text-espresso/60">min</span></div></label><label className="text-sm font-semibold text-espresso" htmlFor="weekly-plan-likes">Likes and dislikes <span className="font-normal text-espresso/60">(optional)</span><input className="mt-2 block w-full rounded-xl border border-soft-border bg-parchment px-3 py-2 font-normal text-espresso" id="weekly-plan-likes" onChange={(event) => onChange((current) => ({ ...current, likesDislikes: event.target.value }))} placeholder="e.g. likes spicy food, avoids mushrooms" value={preferences.likesDislikes} /></label><label className="flex items-start gap-3 text-sm text-espresso sm:col-span-2"><input checked={preferences.preferFavorites} className="mt-1 size-4 accent-terracotta" onChange={(event) => onChange((current) => ({ ...current, preferFavorites: event.target.checked }))} type="checkbox" /><span><span className="font-semibold">Prefer favourite saved recipes</span><br /><span className="text-espresso/65">Give favourites a ranking boost when they fit.</span></span></label></div><div className="mt-5 rounded-xl border border-saffron/35 bg-saffron/10 p-3 text-sm leading-6 text-espresso"><strong>Review dietary and allergen suitability yourself.</strong> Suggestions are not nutrition, allergy, or medical advice.</div><div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-soft-border pt-5"><button className="rounded-xl border border-soft-border bg-cream px-4 py-2.5 text-sm font-semibold text-espresso hover:border-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={onBack} type="button">Back</button><div className="flex flex-wrap gap-3"><button className="rounded-xl border border-sage px-4 py-2.5 text-sm font-semibold text-sage hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage" disabled={isGenerating} onClick={onSkip} type="button">Skip for now</button><button className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-semibold text-white hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-50" disabled={isGenerating} onClick={onGenerate} type="button">{isGenerating ? "Generating…" : "See proposed dinners"}</button></div></div></section>; }

function ChoiceTile({ active, children, description, onClick }: { active: boolean; children: ReactNode; description?: string; onClick: () => void }) { return <button aria-pressed={active} className={`rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${active ? "border-sage bg-sage-soft text-espresso shadow-sm" : "border-soft-border bg-cream text-espresso/75 hover:border-terracotta"}`} onClick={onClick} type="button"><span className="block font-semibold">{children}</span>{description ? <span className="mt-1 block text-xs text-espresso/65">{description}</span> : null}</button>; }

function ReviewPanel({ proposal, items, recipes, isConfirming, onChange, onReplace, onBack, onRetry, onStartOver, onConfirm }: { proposal: WeeklyPlanProposal; items: ReviewItem[]; recipes: SavedRecipe[]; isConfirming: boolean; onChange: (index: number, patch: Partial<ReviewItem>) => void; onReplace: (index: number, recipeId: string) => void; onBack: () => void; onRetry: () => void; onStartOver: () => void; onConfirm: () => void }) { const approvedCount = items.filter((item) => item.decision === "use").length; return <section className="space-y-5"><div aria-live="polite" className="rounded-xl border border-violet/25 bg-violet/10 p-4 text-sm text-espresso/80"><p className="font-semibold text-violet">Review your proposed changes.</p><p className="mt-1">Only dinners marked “Use suggestion” will be saved. Current planned and skipped dinners stay unchanged unless you approve a replacement. {proposal.ollama.status !== "ready" ? `Local model status: ${proposal.ollama.status.replace("_", " ")}${proposal.ollama.message ? ` — ${proposal.ollama.message}` : ""}.` : "Generated drafts remain editable."}</p></div><div className="space-y-3">{items.map((item, index) => <ReviewRow item={item} index={index} key={`${item.plannedFor}-${index}`} onChange={(patch) => onChange(index, patch)} onReplace={(recipeId) => onReplace(index, recipeId)} recipes={recipes} />)}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft-border pt-5"><div className="flex flex-wrap gap-3"><button className="rounded-xl border border-soft-border bg-cream px-4 py-2.5 text-sm font-semibold text-espresso hover:border-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={onBack} type="button">Edit answers</button>{proposal.ollama.status !== "ready" ? <button className="rounded-xl border border-saffron bg-saffron/10 px-4 py-2.5 text-sm font-semibold text-espresso hover:bg-saffron/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron" onClick={onRetry} type="button">Try again</button> : null}<button className="rounded-xl border border-berry/40 px-4 py-2.5 text-sm font-semibold text-berry hover:bg-berry/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry" onClick={onStartOver} type="button">Start over</button></div><button className="rounded-xl bg-terracotta px-4 py-2.5 text-sm font-semibold text-white hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-50" disabled={isConfirming || approvedCount === 0} onClick={onConfirm} type="button">{isConfirming ? "Saving…" : `Save ${approvedCount} approved dinner${approvedCount === 1 ? "" : "s"}`}</button></div></section>; }

function ReviewRow({ item, index, recipes, onChange, onReplace }: { item: ReviewItem; index: number; recipes: SavedRecipe[]; onChange: (patch: Partial<ReviewItem>) => void; onReplace: (recipeId: string) => void }) { const title = item.source === "saved" ? item.savedRecipe.title : item.source === "generated" && item.draft.title ? item.draft.title : "Empty dinner slot"; const draft = item.source === "generated" || item.source === "empty" ? item.draft : null; const rationale = item.source === "generated" ? item.draft.rationale : item.source === "saved" ? item.rationale : item.reason; return <article className="rounded-2xl border border-soft-border bg-cream p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-espresso/65">{displayDate(item.plannedFor)}</p><h4 className="mt-1 text-lg font-semibold text-espresso">{title}</h4></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.source === "generated" ? "bg-violet/15 text-violet" : item.source === "saved" ? "bg-sage-soft text-sage" : "bg-saffron/15 text-espresso"}`}>{item.source === "generated" ? "Generated draft" : item.source === "saved" ? "Saved recipe" : "Needs a recipe"}</span></div>{item.current ? <div className="mt-3 grid gap-2 rounded-xl bg-parchment p-3 text-sm sm:grid-cols-2"><div><p className="font-semibold text-espresso">Current dinner</p><p className="mt-1 text-espresso/80">{item.current.recipeTitle}</p><p className="text-xs text-espresso/60">{statusLabel(item.current.status)}</p></div><div><p className="font-semibold text-espresso">Proposed replacement</p><p className="mt-1 text-espresso/80">{title}</p></div></div> : null}<p className="mt-3 text-sm leading-6 text-espresso/75"><span className="font-semibold text-espresso">Why it fits:</span> {rationale}</p>{draft ? <DraftEditor draft={draft} onChange={(patch) => onChange(item.source === "empty" ? { ...promoteEmpty(item), draft: { ...item.draft, ...patch } } : updateDraft(item, patch))} /> : item.source === "saved" ? <SavedRecipeDetails recipe={item.savedRecipe} /> : null}<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-soft-border pt-3">{item.current ? <><button aria-pressed={item.decision === "keep"} className={`rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-terracotta ${item.decision === "keep" ? "bg-parchment text-espresso" : "border border-soft-border text-espresso/70"}`} onClick={() => onChange({ decision: "keep" })} type="button">Keep current</button><button aria-pressed={item.decision === "use"} className={`rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-terracotta ${item.decision === "use" ? "bg-terracotta text-white" : "border border-terracotta text-terracotta"}`} onClick={() => onChange({ decision: "use" })} type="button">Use suggestion</button></> : item.source === "empty" ? <><button aria-pressed={item.decision === "use"} className="rounded-xl border border-terracotta px-3 py-2 text-sm font-semibold text-terracotta focus-visible:outline-2 focus-visible:outline-terracotta" onClick={() => onChange({ decision: "use" })} type="button">Use suggestion</button><button aria-pressed={item.decision === "leave"} className="rounded-xl border border-soft-border px-3 py-2 text-sm font-semibold text-espresso/70 focus-visible:outline-2 focus-visible:outline-terracotta" onClick={() => onChange({ decision: "leave" })} type="button">Leave empty</button></> : <><button aria-pressed={item.decision === "use"} className="rounded-xl bg-terracotta px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-terracotta" onClick={() => onChange({ decision: "use" })} type="button">Use suggestion</button><button aria-pressed={item.decision === "leave"} className="rounded-xl border border-soft-border px-3 py-2 text-sm font-semibold text-espresso/70 focus-visible:outline-2 focus-visible:outline-terracotta" onClick={() => onChange({ decision: "leave" })} type="button">Leave empty</button></>}<label className="text-sm text-espresso/75" htmlFor={`replace-${index}`}><span className="sr-only">Replace {title}</span><select className="rounded-xl border border-soft-border bg-parchment px-2 py-1.5 text-espresso" defaultValue="" id={`replace-${index}`} onChange={(event) => { if (event.target.value) onReplace(event.target.value); }}><option value="">Replace with saved recipe…</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.favorite ? "★ " : ""}{recipe.title}</option>)}</select></label></div></article>; }

function promoteEmpty(item: Extract<ProposalItem, { source: "empty" }>): Extract<WeeklyPlanProposalItem, { source: "generated" }> { return { plannedFor: item.plannedFor, current: item.current, source: "generated", draft: item.draft, reviewRequired: true }; }
function updateDraft(item: ReviewItem, patch: Partial<GeneratedRecipeDraft>): ReviewItem { return item.source === "generated" ? { ...item, draft: { ...item.draft, ...patch } } : item; }
function SavedRecipeDetails({ recipe }: { recipe: Extract<WeeklyPlanProposalItem, { source: "saved" }>["savedRecipe"] }) { return <div className="mt-3 rounded-xl bg-parchment p-3 text-sm text-espresso/75"><p>{recipe.servings ? `${recipe.servings} servings` : "Servings not recorded"}{recipe.description ? ` · ${recipe.description}` : ""}</p>{recipe.ingredients.length > 0 ? <p className="mt-2"><span className="font-semibold text-espresso">Ingredients:</span> {recipe.ingredients.map((ingredient) => ingredient.itemName).join(", ")}</p> : null}{recipe.instructions ? <p className="mt-2 line-clamp-3"><span className="font-semibold text-espresso">Method:</span> {recipe.instructions}</p> : null}</div>; }
function DraftEditor({ draft, onChange }: { draft: GeneratedRecipeDraft; onChange: (patch: Partial<GeneratedRecipeDraft>) => void }) { const updateIngredient = (index: number, patch: Partial<DraftIngredient>) => onChange({ ingredients: draft.ingredients.map((ingredient, ingredientIndex) => ingredientIndex === index ? { ...ingredient, ...patch } : ingredient) }); return <div className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-espresso">Recipe title<input className="mt-1 block w-full rounded-xl border border-soft-border bg-parchment px-3 py-2 font-normal text-espresso" onChange={(event) => onChange({ title: event.target.value })} value={draft.title} /></label><label className="text-sm font-semibold text-espresso">Servings<input className="mt-1 block w-full rounded-xl border border-soft-border bg-parchment px-3 py-2 font-normal text-espresso" min="1" onChange={(event) => onChange({ servings: Number(event.target.value) })} type="number" value={draft.servings} /></label><label className="text-sm font-semibold text-espresso">Cooking time <span className="font-normal text-espresso/60">(minutes)</span><input className="mt-1 block w-full rounded-xl border border-soft-border bg-parchment px-3 py-2 font-normal text-espresso" min="1" onChange={(event) => onChange({ estimatedMinutes: event.target.value ? Number(event.target.value) : null })} type="number" value={draft.estimatedMinutes ?? ""} /></label><label className="text-sm font-semibold text-espresso">Why this recipe fits<input className="mt-1 block w-full rounded-xl border border-soft-border bg-parchment px-3 py-2 font-normal text-espresso" onChange={(event) => onChange({ rationale: event.target.value })} value={draft.rationale} /></label></div><fieldset><legend className="text-sm font-semibold text-espresso">Ingredients</legend><div className="mt-2 space-y-2">{draft.ingredients.map((ingredient, index) => <div className="grid gap-2 rounded-xl border border-soft-border p-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]" key={index}><label><span className="sr-only">Ingredient {index + 1} name</span><input className="w-full rounded-lg border border-soft-border bg-parchment px-2 py-1.5 text-sm text-espresso" onChange={(event) => updateIngredient(index, { itemName: event.target.value })} value={ingredient.itemName} /></label><label><span className="sr-only">Ingredient {index + 1} quantity</span><input className="w-full rounded-lg border border-soft-border bg-parchment px-2 py-1.5 text-sm text-espresso" min="0" onChange={(event) => updateIngredient(index, { quantity: event.target.value ? Number(event.target.value) : null })} placeholder="Qty" type="number" value={ingredient.quantity ?? ""} /></label><label><span className="sr-only">Ingredient {index + 1} unit</span><select className="w-full rounded-lg border border-soft-border bg-parchment px-2 py-1.5 text-sm text-espresso" onChange={(event) => updateIngredient(index, { unit: (event.target.value || null) as DraftIngredient["unit"] })} value={ingredient.unit ?? ""}><option value="">Unit</option>{SUPPORTED_COOKING_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label><button className="text-sm font-semibold text-berry underline focus-visible:outline-2 focus-visible:outline-berry" onClick={() => onChange({ ingredients: draft.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index) })} type="button">Remove</button></div>)}</div><button className="mt-2 text-sm font-semibold text-terracotta underline focus-visible:outline-2 focus-visible:outline-terracotta" onClick={() => onChange({ ingredients: [...draft.ingredients, emptyIngredient()] })} type="button">Add ingredient</button></fieldset><label className="block text-sm font-semibold text-espresso">Method<textarea className="mt-1 min-h-28 w-full rounded-xl border border-soft-border bg-parchment px-3 py-2 font-normal text-espresso" onChange={(event) => onChange({ instructions: event.target.value })} value={draft.instructions} /></label></div>; }
