import "server-only";

import { cache } from "react";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export type HouseholdContext = {
  userId: string;
  householdId: string;
};

const getAuthenticatedHousehold = cache(async (): Promise<HouseholdContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("household_memberships")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("No household membership found for the current user");
  }

  return {
    userId: user.id,
    householdId: data.household_id,
  };
});

/** Returns the authenticated household once per server request. */
export async function requireHousehold(): Promise<HouseholdContext> {
  return getAuthenticatedHousehold();
}
