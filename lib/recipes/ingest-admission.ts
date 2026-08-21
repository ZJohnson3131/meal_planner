const MILLISECONDS_PER_MINUTE = 60_000;
const ADMISSION_STATE_IDLE_MINUTES = 5;

export const RECIPE_INGEST_ADMISSION_LIMITS = Object.freeze({
  concurrentImportsPerPrincipal: 1,
  importsPerWindow: 5,
  stateIdleMilliseconds:
    ADMISSION_STATE_IDLE_MINUTES * MILLISECONDS_PER_MINUTE,
  windowMilliseconds: MILLISECONDS_PER_MINUTE,
});

type AdmissionState = {
  activeImports: number;
  importsInWindow: number;
  lastSeenAt: number;
  windowStartedAt: number;
};

export type RecipeIngestAdmission = Readonly<{
  release: () => void;
}>;

/*
 * This deliberately small admission controller is for the single-instance,
 * local MVP. Multi-instance deployment must replace it with shared durable
 * coordination; process memory cannot enforce a fleet-wide limit.
 */
const admissionByPrincipal = new Map<string, AdmissionState>();

function principalKey(userId: string, householdId: string): string {
  return JSON.stringify([userId, householdId]);
}

function pruneIdleState(now: number): void {
  for (const [key, state] of admissionByPrincipal) {
    if (
      state.activeImports === 0
      && now - state.lastSeenAt >= RECIPE_INGEST_ADMISSION_LIMITS.stateIdleMilliseconds
    ) {
      admissionByPrincipal.delete(key);
    }
  }
}

/**
 * Admits a bounded import attempt for one authenticated user and household.
 * A null result intentionally does not reveal whether rate or concurrency was
 * the limiting factor.
 */
export function acquireRecipeIngestAdmission(
  userId: string,
  householdId: string,
): RecipeIngestAdmission | null {
  const now = Date.now();
  pruneIdleState(now);

  const key = principalKey(userId, householdId);
  const state = admissionByPrincipal.get(key) ?? {
    activeImports: 0,
    importsInWindow: 0,
    lastSeenAt: now,
    windowStartedAt: now,
  };

  if (now - state.windowStartedAt >= RECIPE_INGEST_ADMISSION_LIMITS.windowMilliseconds) {
    state.importsInWindow = 0;
    state.windowStartedAt = now;
  }
  state.lastSeenAt = now;
  admissionByPrincipal.set(key, state);

  if (
    state.activeImports >= RECIPE_INGEST_ADMISSION_LIMITS.concurrentImportsPerPrincipal
    || state.importsInWindow >= RECIPE_INGEST_ADMISSION_LIMITS.importsPerWindow
  ) {
    return null;
  }

  state.activeImports += 1;
  state.importsInWindow += 1;

  let released = false;
  return Object.freeze({
    release() {
      if (released) return;
      released = true;
      state.activeImports = Math.max(0, state.activeImports - 1);
      state.lastSeenAt = Date.now();
    },
  });
}
