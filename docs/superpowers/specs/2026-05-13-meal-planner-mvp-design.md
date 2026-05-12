# Meal Planner MVP Design

Date: 2026-05-13

## Goal

Build a local, Dockerized end-to-end MVP for a meal planner and pantry-aware food tracker. The MVP must prove the full user workflow: capture recipes, plan dinners, track pantry stock, calculate what is missing, export a shopping list, and deduct pantry items when meals are completed.

The app is single-user for the first release, but the design must leave a clear path to multi-user households. Security should be treated as production-grade from the start, even though initial deployment is local.

## Non-Goals For MVP

- Mobile native app.
- Nutrition and macro tracking.
- Retailer cart integration with Coles, Woolworths, or other grocery services.
- Production hosting, monitoring, backups, custom domains, and release hardening.
- Full natural-language ingredient normalization.
- Ambiguous quantity conversion, such as converting `1 onion` to `300g onion`.

## Recommended Approach

Use a modular **Next.js + TypeScript + Supabase** stack.

Next.js provides the responsive web UI, route structure, server actions or API routes, and app-level validation. Supabase provides local Postgres, authentication, and database Row Level Security. The local development environment should be Dockerized, using Supabase locally rather than building throwaway auth or storage.

This approach adds some setup complexity, but it aligns with the security requirements and keeps the path to hosted deployment clean.

## Architecture

The system is organized around domain modules:

- **Auth and household access**: every user owns one default household in MVP.
- **Recipes**: manual recipes plus URL-ingested recipes, with ingredients, instructions, favorite flag, and source URL.
- **Meal planning**: dinner-focused weekly planning, modeled with meal slots for later expansion.
- **Pantry**: current stock items with quantity and unit.
- **Shopping**: generated shopping list from planned meals minus pantry, editable and exportable.
- **Shopping provider boundary**: an internal abstraction for future grocery services, with no retailer integration in MVP.

The main data path is:

1. User saves or imports recipes.
2. User favorites or selects meals.
3. User assigns dinners to dates.
4. App aggregates ingredients across planned meals.
5. App compares required ingredients against pantry stock.
6. App produces an editable, exportable shopping list.
7. User marks meals completed.
8. App deducts matched ingredients from pantry stock exactly once.

## Data Model

The data model is household-centered even though the MVP is single-user.

Core tables:

- `profiles`: user-facing profile linked to Supabase auth user.
- `households`: one default household per user in MVP.
- `household_memberships`: links users to households; MVP creates one owner membership.
- `recipes`: title, description, source URL, favorite flag, servings, instructions, ingestion status, and household ownership.
- `recipe_ingredients`: recipe, item name, quantity, unit, optional notes, and display order.
- `meal_slots`: predefined `dinner` slot in MVP, expandable later.
- `meal_plan_entries`: date, slot, recipe, household, and status such as `planned`, `completed`, or `skipped`.
- `pantry_items`: item name, quantity, unit, optional expiry date, optional category, and household ownership.
- `pantry_deductions`: ledger of pantry deductions made when meals are completed.
- `shopping_lists`: generated list for a planning window, editable before export.
- `shopping_list_items`: item name, required quantity, pantry quantity, delta quantity, unit, status, and review flag.
- `shopping_providers`: future integration registry. MVP may include provider records for planning purposes, but no provider can execute cart or retailer actions.

Every household-owned table includes `household_id`. Row Level Security allows access only to users with a matching `household_memberships` row. Server-side code also validates household access for mutations and queries.

## Core Workflows

### Recipe Capture

The user can manually create a recipe or paste a recipe URL.

For URL ingestion, the app fetches the page and looks for structured recipe metadata such as JSON-LD. It extracts title, ingredients, instructions, servings, and source URL where available, then opens an edit and review screen.

If parsing fails or returns incomplete data, the user can still create or complete the recipe manually with the source URL attached. Parsed ingredients and instructions always remain editable.

### Meal Planning

The user views a weekly dinner planner, chooses saved or favorite recipes, and assigns one dinner recipe per day.

Only dinner is visible in the MVP UI. The underlying model uses `meal_slots` so later versions can add breakfast, lunch, snacks, custom household slots, or scheduling integration with the separate task planner project.

Meal entries support statuses:

- `planned`
- `completed`
- `skipped`

### Pantry Tracking

The user manually maintains pantry items with item name, quantity, and unit.

The app supports simple matching by item name and unit, plus deterministic unit conversion for explicitly supported compatible units. Ambiguous or unsupported matches are flagged for review.

### Shopping List Generation

The user generates a shopping list for a selected week.

The app aggregates ingredients from planned meals, subtracts matching pantry quantities, applies safe compatible unit conversions where possible, flags review-required items, and lets the user edit, check off, and export the result.

Export is simple in MVP: copyable text and a downloadable plain text file. Retailer cart integration is not included.

### Meal Completion And Pantry Deduction

When the user marks a planned meal as completed, the app deducts that recipe's matched ingredients from pantry stock.

Clean item matches and supported unit conversions can be deducted automatically. Ambiguous matches require review before pantry changes are applied.

Pantry deductions are recorded in a ledger so the same meal cannot double-subtract stock if the user toggles status or repeats an action. Reversing a completed meal requires user confirmation, then restores the exact recorded quantities where the pantry item still exists. If restoration cannot be applied cleanly, the app flags the item for manual review.

## Unit Conversion Rules

The MVP supports a small explicit conversion table for compatible units:

- Mass, such as `g` and `kg`.
- Volume, such as `ml` and `L`.
- Kitchen volume conversions that are explicitly defined, such as `tsp` and `tbsp`.

The app does not guess across ambiguous dimensions:

- `1 onion` vs `300g onion`
- `1 bunch coriander` vs `20g coriander`
- `2 cloves garlic` vs `1 bulb garlic`

Unsupported conversions are flagged for review during shopping-list generation and pantry deduction.

## Error Handling

Recipe ingestion is best-effort. URL fetch failures, missing structured data, or incomplete extracted fields route the user to manual review rather than failing the workflow.

Pantry, shopping, and meal-completion calculations are conservative. Missing pantry items, insufficient stock, unsupported unit conversion, and ambiguous duplicate pantry items are surfaced as review-required items.

Auth and access errors fail closed. Unauthenticated users are sent to login. Authenticated users can only access rows belonging to households where they have membership, enforced by both server code and Supabase Row Level Security.

## Security Requirements

Security is production-minded from the start, even for local MVP.

- Use Supabase Auth rather than custom password handling.
- Enable Row Level Security on all household-owned tables.
- Require household membership for all reads and writes.
- Validate household-scoped IDs server-side before mutations.
- Avoid exposing service-role credentials to browser code.
- Keep secrets in environment variables.
- Treat recipe ingestion URLs as untrusted input.
- Sanitize rendered recipe content.
- Do not execute retailer automation or external cart actions in MVP.

## Testing And Validation

Core unit tests should cover:

- Ingredient aggregation across planned meals.
- Unit conversion for explicitly supported compatible units.
- Pantry delta calculation, including review flags.
- Meal completion deduction and idempotency.
- Shopping list generation from planned meals minus pantry.

Integration tests should cover:

- Authenticated household access checks.
- Recipe creation and manual editing.
- URL ingestion success and failure paths using mocked recipe pages.
- Meal planning to shopping-list generation.
- Completing a meal and verifying pantry deduction ledger behavior.

Security validation should cover:

- Supabase Row Level Security policies for household-owned tables.
- Checks proving one household cannot read or write another household's recipes, pantry, plans, or shopping lists.
- Server-side access checks for all mutations receiving household-scoped IDs.

Manual MVP acceptance flow:

1. Create account.
2. Create default household automatically.
3. Add pantry items.
4. Ingest or manually create recipes.
5. Favorite recipes.
6. Plan dinners for a week.
7. Generate shopping list.
8. Export shopping list.
9. Mark a meal completed.
10. Confirm pantry stock is deducted once.

## Future Extensions

- Multi-user household memberships and invitations.
- Nutrition and macro tracking after MVP completion.
- Breakfast, lunch, snacks, and custom meal slots.
- Integration with the separate task planner project's scheduling functionality.
- Grocery provider integrations for Coles, Woolworths, and other services.
- Product matching and retailer cart preparation, with user-confirmed checkout only.
- Hosted deployment with production monitoring, backups, and operational controls.
- Broader ingredient normalization and safer conversions where deterministic mappings exist.
