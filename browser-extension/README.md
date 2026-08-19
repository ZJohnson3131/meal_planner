# Meal Planner Recipe Draft extension

This Firefox-first Manifest V3 extension extracts only visible text from the active recipe page and opens the local Meal Planner review screen. It does not call a Meal Planner API, use CORS, read Supabase cookies, or save recipes automatically.

## Load in Firefox

1. Start Meal Planner locally at `http://127.0.0.1:3000`.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on**.
4. Choose this folder's `manifest.json`.
5. Open a public recipe page and click the Meal Planner toolbar button.
6. Review and edit the draft at the local Meal Planner page, then save it normally.

Temporary add-ons are removed when Firefox closes. A signed package is needed for persistent installation.

## Debugging

- In `about:debugging`, select **Inspect** beside the extension to view background-script logs and errors.
- If the local review page does not open, confirm the app is running at `http://127.0.0.1:3000` and reload the extension from `about:debugging`.
- The extractor intentionally limits its payload to 12 KB and 100 list items. Sites with unusual layouts may require manual completion in the review form.
