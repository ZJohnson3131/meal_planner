# Meal Planner Agents

This directory defines the project-specific agents used to route work. The Lead Agent should select the most specific agent before starting a task and prefix responses with the active agent name.

## Agent Roster

- [Architect](architect.md): structural decisions, module boundaries, trade-offs, and plan/spec wording.
- [Security Engineer](security-engineer.md): static security review and security implementation guidance.
- [Functional Security Validation Agent](functional-security-validation-agent.md): local defensive security checks against a running stack.
- [Database Engineer](database-engineer.md): Supabase schema, migrations, seed data, indexes, and RLS policies.
- [Next.js Application Engineer](nextjs-application-engineer.md): App Router, server actions, middleware, Supabase client wiring, and authorization checks.
- [Frontend Engineer](frontend-engineer.md): React components, forms, layouts, interaction states, and accessibility.
- [Domain Logic Engineer](domain-logic-engineer.md): unit conversion, ingredient aggregation, pantry deltas, deductions, and shopping export logic.
- [Recipe Ingestion Engineer](recipe-ingestion-engineer.md): URL ingestion, recipe metadata extraction, ingredient-line parsing, and ingestion fallback behavior.
- [Scheduling Engineer](scheduling-engineer.md): meal slot semantics, weekly planning behavior, status transitions, and future scheduling expansion.
- [Test Specialist](test-specialist.md): Vitest, Testing Library, integration tests, Playwright, and verification reporting.
- [DevOps Engineer](devops-engineer.md): Docker, local Supabase, environment files, CI, audit, and setup docs.
- [Product UX Reviewer](product-ux-reviewer.md): user-facing workflow, accessibility, clarity, and MVP acceptance-flow review.
- [Code Reviewer](code-reviewer.md): static code-quality and correctness review after implementation.
- [PR Review Agent](pr-review-agent.md): strict MVP PR gate for non-documentation task PRs; reviews, verifies, coordinates fixes, and squash-merges approved MVP PRs.

## Routing Rules

- Route security-sensitive work to the Security Engineer before implementation is considered complete.
- Route live local security validation to the Functional Security Validation Agent.
- Route schema or RLS work to the Database Engineer before application code depends on it.
- Route user-facing UI work to the Frontend Engineer and, when reviewing flow quality, the Product UX Reviewer.
- Route date, meal slot, and meal-plan status behavior to the Scheduling Engineer.
- Route deterministic pantry, ingredient, and shopping calculations to the Domain Logic Engineer.
- Route recipe parsing and URL ingestion to the Recipe Ingestion Engineer.
- Route tests to the Test Specialist, and do not let implementation agents silently patch tests to pass.
- During MVP task mode, route every non-documentation task PR to the PR Review Agent before merge. The PR Review Agent must run verification independently, coordinate any fix loop, and squash-merge approved MVP PRs.
