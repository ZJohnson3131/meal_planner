# Ollama Hybrid Weekly Generator

## Purpose

Add a review-first **Plan my week** experience that combines the household's saved recipes with locally generated recipe drafts. It helps a user fill a week of dinners from goals and household constraints without requiring a paid AI provider.

The feature uses Ollama running on the user's own computer. It does not send recipes, pantry data, preferences, or prompts to a third-party model API.

## Product decisions

- Plan dinners for a user-selected number of people.
- Collect one or more weekly goals: simple meals, high protein, budget-friendly, family-friendly, vegetarian, and pantry-friendly.
- Cooking time is optional. When omitted, it must not be treated as a hidden time limit.
- Collect dietary exclusions and free-text likes/dislikes.
- Let the user choose whether to prefer favourite saved recipes.
- Use a hybrid result:
  1. select suitable saved recipes first;
  2. generate recipe drafts only for remaining dinner slots;
  3. let the user replace, edit, remove, or accept every suggestion;
  4. save recipes and meal-plan entries only after explicit confirmation.

## User flow

1. The user opens **Plan my week** and chooses a week.
2. They enter household size, number of dinners, goals, optional cooking time, dietary exclusions, likes/dislikes, and the **Prefer favourite recipes** setting.
3. The app ranks the household's existing recipes locally. Favourite recipes receive a ranking boost only when the setting is enabled.
4. The app proposes appropriate saved recipes for compatible slots.
5. For remaining slots, the app sends a narrowly scoped planning request to local Ollama and receives structured recipe drafts.
6. The user sees one review card per suggested dinner:
   - recipe title, servings, cooking-time estimate, ingredients, method, and why it fits;
   - an existing-recipe or generated-draft badge;
   - edit, replace, remove, and accept controls.
7. The user confirms the complete plan. The app saves accepted generated drafts as normal household recipes, then assigns every accepted recipe to the selected Dinner slots.
8. Existing shopping-list and pantry-completion flows operate on the accepted recipes exactly as they do today.

## Local Ollama contract

### Runtime

- Ollama runs locally, normally at `http://127.0.0.1:11434`.
- The model name is configuration, not a hard-coded product decision. Use an environment variable such as `OLLAMA_MODEL`.
- The app must detect an unavailable runtime or missing model before generation and show setup guidance rather than a generic error.
- The Ollama endpoint is called only from server-side code. It must never be exposed to browser code as a general-purpose proxy.

### Proposed environment settings

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=choose-during-setup
```

`OLLAMA_BASE_URL` must be validated as a loopback HTTP URL. The first implementation does not support arbitrary remote model endpoints.

### Input sent to the model

Only the minimum planning context is included:

- household size;
- goals and optional maximum cooking time;
- dietary exclusions and likes/dislikes;
- number of missing recipe slots;
- short summaries of recipes already selected, to avoid duplicate meals;
- supported ingredient-unit vocabulary;
- optionally, a bounded list of pantry item names for pantry-friendly ideas.

Do not include account details, Supabase credentials, browser cookies, full database exports, or the service-role key.

### Required structured output

The model must return JSON only. Each generated recipe draft requires:

```ts
type GeneratedRecipeDraft = {
  title: string;
  servings: number;
  estimatedMinutes: number | null;
  rationale: string;
  ingredients: Array<{
    itemName: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
  }>;
  instructions: string;
};
```

The server validates this response with Zod before it reaches the UI. Values must comply with existing recipe limits and supported units. Unknown or ambiguous units are retained as `null` and visibly require user review; they are never guessed.

## Hybrid selection rules

Existing recipes are selected deterministically before any model call.

- Exclude recipes that conflict with explicit dietary exclusions when such metadata is available; otherwise mark suitability as review-needed rather than claiming certainty.
- Avoid selecting the same recipe more than once by default.
- When **Prefer favourite recipes** is enabled, favour recipes with `favorite = true` but do not force them when they conflict with explicit constraints.
- Treat a missing optional cooking-time limit as no limit.
- Use generated recipes only to fill unassigned slots.
- Generation may suggest a meal that resembles an existing recipe, but the review UI must disclose it and allow replacement.

The initial version should not claim nutritional calculations, allergy safety, food cost, or pantry quantities as facts unless those values are calculated from reliable structured data.

## Safety and review rules

- Generated drafts are untrusted suggestions, not saved recipes.
- No generated plan writes recipes, meal entries, pantry stock, or shopping lists until the user confirms.
- The user must be able to edit every generated ingredient and instruction before saving.
- Show a clear message that dietary and allergen suitability must be checked by the user.
- Reject malformed, oversized, or non-JSON model output. Retry at most once with a corrective schema prompt; otherwise return editable empty draft slots and a clear error.
- Apply an absolute request timeout and a bounded response size to the local Ollama request.
- Do not render model output as HTML.

## Data and persistence approach

The first version should keep an in-progress proposal in server/client state and persist only on confirmation. It does not need a new database table for drafts.

On confirmation:

1. validate all accepted generated recipes and ingredient rows;
2. create the generated recipes in the active household;
3. create their ingredients;
4. assign accepted recipes to the selected week's Dinner slots;
5. use the same household and meal-slot protection as normal planner actions.

If any final write fails, report that no plan was finalised and avoid a partial plan. The implementation should use a database transaction/RPC where needed to make recipe creation and assignments atomic.

## UI surfaces

- New planner entry point: **Plan my week**.
- Preferences form with goals, people, optional cooking time, exclusions, likes/dislikes, and favourite preference.
- Local-model availability state: ready, unavailable, model missing, generating, and failed.
- Proposal review screen with source badges: **Saved recipe** and **Generated draft**.
- Confirmation action that makes explicit what will be created and scheduled.

## Implementation phases

1. **Local planning foundation**
   - Add typed Ollama server client, loopback-only configuration, response schema, timeouts, and mocked tests.
   - Add deterministic saved-recipe ranking with favourite preference and optional cooking-time semantics.

2. **Proposal generation and review**
   - Build the preferences form and proposal review UI.
   - Generate only missing slots and validate generated recipe drafts.
   - Support edit, remove, and replace before confirmation.

3. **Safe persistence and planner integration**
   - Atomically save accepted drafts and Dinner assignments within household scope.
   - Ensure existing shopping-list and completion behaviour works unchanged.

4. **Evaluation and user acceptance**
   - Build a small reference set of representative goal combinations.
   - Review generated plans for recipe completeness, duplication, unit validity, constraint adherence, and review-before-save behaviour.

## Acceptance criteria

- A user can produce a proposed week without any paid API key.
- The app works when Ollama is available locally and gives actionable setup guidance when it is not.
- Favourite preference changes ranking only when selected.
- Omitting cooking time imposes no cooking-time filter.
- Existing recipes are used before generated drafts.
- Generated drafts have valid, editable recipe fields or are explicitly flagged for review.
- No recipe or plan is saved before confirmation.
- All final writes remain household-scoped and preserve the current planner, shopping, and pantry guarantees.

## Evaluation checklist

- Saved favourites are selected ahead of otherwise equal non-favourites when preference is on.
- Saved favourites are not artificially prioritised when preference is off.
- Generated recipes respect explicit exclusions in the reference scenarios.
- A response with unsupported units, missing ingredients, malformed JSON, or excessive size is rejected safely.
- A model outage, timeout, or missing model does not create partial data.
- Human review confirms generated recipes are understandable, reasonably varied, and editable before saving.

## Out of scope for the first version

- Nutritional or medical advice.
- Guaranteed allergen safety.
- Live grocery pricing or retailer-cart integration.
- Automatic pantry deduction before a meal is completed.
- Automatic saving of model-generated recipes.
- Remote commercial AI providers.
