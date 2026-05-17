# PR Review Agent MVP Workflow Design

Date: 2026-05-17

## Goal

Upgrade the existing PR Review Agent into the required final quality gate for every non-documentation MVP task PR. During the MVP build, the agent must independently review, verify, request fixes, re-review, and merge approved PRs so that completed task branches land on `main` without waiting for separate user merge approval.

After all tasks in `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md` are complete, this auto-merge authority ends. The PR Review Agent remains available but dormant unless the user explicitly invokes it. At that point the user will perform UI testing, provide feedback, and decide the final MVP implementation changes and merge approvals.

## Recommended Approach

Update the existing `docs/agents/pr-review-agent.md` role instead of creating a second reviewer. The current project already routes final pre-merge review to this agent, so upgrading the existing definition keeps one authoritative PR gate and avoids ambiguity between reviewer roles.

The project workflow should document two modes:

- **MVP task mode:** PR Review Agent is required for non-documentation PRs and may merge approved PRs.
- **Post-MVP mode:** PR Review Agent is not used unless explicitly requested by the user and does not merge unless the user grants that authority again.

## Agent Authority

During MVP task mode, the PR Review Agent owns the final PR gate after a task branch has been implemented, verified by the implementation agent, committed, and opened as a PR.

The PR Review Agent may:

- Review the PR against the active implementation-plan task.
- Ask clarifying questions of the responsible specialist agent when intent or design rationale is unclear.
- Run verification commands, builds, type checks, tests, security checks, and dependency checks needed to validate the PR.
- Request changes for blocking findings.
- Send blocking findings to the Lead Agent for routing to the responsible specialist agent.
- Route fixes directly to the responsible specialist agent if no Lead Agent is operating in the flow.
- Re-review after fixes are applied.
- Merge approved MVP task PRs with `gh pr merge --squash`.
- Sync local `main` from GitHub after merge and leave the working tree on `main`.

The PR Review Agent must not write fixes itself. It remains a reviewer and gatekeeper, not an implementation agent.

## Review Loop

For each non-documentation MVP task PR, the PR Review Agent should:

1. Confirm the PR maps to the active incomplete task in the implementation plan.
2. Inspect the diff, changed files, plan section, and relevant agent responsibilities.
3. Run the listed verification commands from the task, plus additional checks required by the changed surface area.
4. Review correctness, security, data model integrity, scheduling semantics, test coverage, code quality, maintainability, dependency hygiene, and future scalability.
5. Classify findings as blocking or non-blocking.
6. Name the responsible specialist agent for each blocking finding.
7. Report blocking findings to the Lead Agent for routing. If no Lead Agent is present, route directly.
8. Wait for fixes to be applied.
9. Re-run required verification and re-review the updated PR.
10. Continue until there are no blocking findings.
11. Merge with `gh pr merge --squash`.
12. Sync the local repository from GitHub and switch the working tree to `main`.

All reviewer questions, implementation-agent answers, and routing decisions should be visible in the chat window.

## Blocking Standards

The PR Review Agent should be strict. Blocking findings include:

- Behavior that does not satisfy the referenced plan task.
- Broken build, typecheck, lint, tests, migrations, or required local verification.
- Missing tests for meaningful feature, security, domain, schema, or workflow behavior.
- Incorrect household ownership, authorization, RLS, or credential handling.
- Unsafe handling of untrusted recipe ingestion input.
- Data model or migration mistakes that would be expensive to unwind.
- Incorrect unit conversion, ingredient aggregation, pantry delta, shopping-list, meal scheduling, or meal-completion semantics.
- UI behavior that blocks the required MVP workflow or creates accessibility failures.
- Dependency additions without clear need or unacceptable risk.
- Code organization that would make the next planned tasks materially harder.

Non-blocking findings may include small naming improvements, low-risk cleanup, and future enhancements that do not threaten the current task or next-task scalability.

## Merge And Sync

When satisfied during MVP task mode, the PR Review Agent should merge through GitHub using:

```bash
gh pr merge --squash
```

The merge comment should concisely state the task, review result, verification commands run, and that the PR Review Agent approved the merge.

After GitHub reports a successful merge, the agent should sync local state from GitHub and leave the workspace on `main`, using the project-safe equivalent of:

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
```

If the local tree is dirty or cannot be fast-forwarded cleanly, the agent must stop and report the blocker rather than hiding or discarding changes.

## Documentation Updates

Implementation should update:

- `docs/agents/pr-review-agent.md` with the MVP review, fix-loop, verification, merge, and post-MVP lifecycle rules.
- `docs/agents/README.md` with the updated roster and routing rule for MVP PR review.
- `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md` with execution-mode wording that grants the PR Review Agent MVP-only auto-merge authority and restores user-controlled merge authority after all MVP tasks are complete.

## Validation

Because this is a workflow documentation change, validation should include:

- Search for stale workflow language that contradicts MVP auto-merge authority.
- Confirm post-MVP user merge control remains documented.
- Confirm the PR Review Agent still cannot write implementation fixes itself.
- Confirm the workflow specifies `gh pr merge --squash`, local sync from GitHub, and final working branch `main`.
