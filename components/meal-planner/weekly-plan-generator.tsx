import {
  confirmWeeklyPlan,
  generateWeeklyPlanProposal,
} from "@/app/actions/weekly-plan";
import { WeeklyPlanGeneratorClient } from "@/components/meal-planner/weekly-plan-generator-client";

type WeeklyPlanGeneratorProps = {
  recipes: Array<{ id: string; title: string; favorite: boolean }>;
  weekStart: string;
};

/** Server boundary that passes Server Actions to the interactive review UI. */
export function WeeklyPlanGenerator({ recipes, weekStart }: WeeklyPlanGeneratorProps) {
  return (
    <WeeklyPlanGeneratorClient
      confirmWeeklyPlan={confirmWeeklyPlan}
      generateWeeklyPlanProposal={generateWeeklyPlanProposal}
      recipes={recipes}
      weekStart={weekStart}
    />
  );
}
