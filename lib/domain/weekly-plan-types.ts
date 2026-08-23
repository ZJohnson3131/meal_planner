/**
 * Serializable weekly-planning contracts shared by the client review UI and
 * the server action. Keep this module free of server-only imports.
 */
import type {
  GeneratedRecipeDraft,
  WeeklyPlanProposalItem,
} from "@/lib/validation/weekly-plan";

export type {
  GeneratedRecipeDraft,
  WeeklyPlanGoal,
  WeeklyPlanPreferences,
  WeeklyPlanProposalItem,
} from "@/lib/validation/weekly-plan";

export type WeeklyPlanExistingEntry = {
  plannedFor: string;
  recipeId: string;
  recipeTitle: string;
  status: "planned" | "completed" | "skipped";
};

export type WeeklyPlanEmptySlot = {
  plannedFor: string;
  source: "empty";
  current: WeeklyPlanExistingEntry | null;
  draft: GeneratedRecipeDraft;
  reason: string;
  reviewRequired: true;
};

export type WeeklyPlanOllamaStatus =
  | { status: "ready" }
  | { status: "unavailable"; message: string }
  | { status: "model_missing"; message: string }
  | { status: "failed"; message: string };

export type WeeklyPlanProposal = {
  items: Array<WeeklyPlanProposalItem | WeeklyPlanEmptySlot>;
  emptySlots: number;
  ollama: WeeklyPlanOllamaStatus;
};
