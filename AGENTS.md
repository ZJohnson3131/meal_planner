<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Workflow

- Before selecting or starting the next task, read `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md` and use the first incomplete task as the source of truth.
- Keep the implementation plan updated as work progresses. Mark completed steps and tasks with checked boxes, and update the plan's progress log after each task is verified and committed.
- Never implement directly on `main`. For every feature, fix, or workflow cleanup, create an isolated branch or worktree, complete and verify the work there, then open a PR.
- During MVP task mode, route every non-documentation task PR to the PR Review Agent. The PR Review Agent must review the PR, run required verification independently, coordinate fixes for blocking findings, and merge approved MVP task PRs with `gh pr merge --squash`. After a successful merge, sync local `main` from GitHub and leave the working tree on `main`.
- MVP task mode lasts until every task in `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md` is complete. After that, the PR Review Agent remains available but dormant unless the user explicitly invokes it. Post-MVP, the user owns UI testing, final implementation feedback, review approval, and merge decisions unless they explicitly delegate that authority again.
- When opening a PR, include a concise summary of the changes, the current functionality, verification results, and any UI surfaces that need user testing.
- Follow the plan's execution mode: complete one task at a time, run the listed verification commands, commit the task, then report the result before moving on.

## Agent Usage

- Use the project agent definitions in `docs/agents/` as the routing source of truth. Before starting a task, identify the most specific agent for the work and follow that agent's responsibilities and constraints.
- Prefix every assistant response with the active agent in square brackets, for example `[Lead Agent]`, `[Security Engineer]`, `[Database Engineer]`, or `[Frontend Engineer]`.
- The Lead Agent coordinates work, reads the implementation plan, selects the correct specialist agent, keeps progress updated, and performs final integration. The Lead Agent should not silently perform specialist work when a specialist agent applies.
- Security-sensitive work must involve the Security Engineer. Functional security checks against a running local stack must involve the Functional Security Validation Agent.
- Database schema, migrations, indexes, seed data, and RLS policies must involve the Database Engineer.
- Next.js App Router, server actions, middleware, Supabase client wiring, and application-level auth checks must involve the Next.js Application Engineer.
- React components, forms, page layouts, interaction states, and accessibility checks must involve the Frontend Engineer or Product UX Reviewer as appropriate.
- Unit conversion, ingredient aggregation, pantry deltas, shopping-list math, and meal-completion deductions must involve the Domain Logic Engineer.
- Recipe URL ingestion, recipe metadata parsing, ingredient-line parsing, and ingestion sanitization must involve the Recipe Ingestion Engineer.
- Meal slot semantics, weekly planning behavior, planned/completed/skipped status transitions, and future scheduling expansion must involve the Scheduling Engineer.
- Test design and test implementation must involve the Test Specialist.
- Docker, local Supabase setup, environment templates, dependency audit, CI, and release infrastructure must involve the DevOps Engineer.
- Code review and final PR review must involve the Code Reviewer or PR Review Agent before merge when the change is more than documentation-only.
