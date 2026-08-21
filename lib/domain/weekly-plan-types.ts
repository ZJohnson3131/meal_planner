/**
 * Serializable weekly-planning contracts shared by the client review UI and
 * the server action. Keep this module free of server-only imports.
 */
import type {
  GeneratedRecipeDraft,
  WeeklyPlanPreferences,
  WeeklyPlanProposalItem,
} from "@/lib/validation/weekly-plan";

export type {
  GeneratedRecipeDraft,
  WeeklyPlanGoal,
  WeeklyPlanPreferences,
  WeeklyPlanProposalItem,
} from "@/lib/validation/weekly-plan";

export type WeeklyPlanOllamaStatus =
  | { status: "ready" }
  | { status: "unavailable"; message: string }
  | { status: "model_missing"; message: string }
  | { status: "failed"; message: string };

export type WeeklyPlanProposal = {
  items: WeeklyPlanProposalItem[];
  emptySlots: number;
  ollama: WeeklyPlanOllamaStatus;
};
