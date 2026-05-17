# PR Review Agent MVP Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the project workflow so the existing PR Review Agent is the strict MVP-only PR review, fix-loop, verification, squash-merge, and local-sync gate.

**Architecture:** This is a documentation-only workflow change. The existing `docs/agents/pr-review-agent.md` remains the single authoritative PR reviewer; `docs/agents/README.md` routes MVP PRs to it; the MVP implementation plan defines when auto-merge authority applies and when it ends.

**Tech Stack:** Markdown project documentation, GitHub CLI workflow via `gh pr merge --squash`, local Git sync commands.

---

## File Structure

- Modify: `docs/agents/pr-review-agent.md`
  - Owns the detailed PR Review Agent role, lifecycle, constraints, review loop, verification expectations, merge/sync process, and prompt template.
- Modify: `docs/agents/README.md`
  - Owns the agent roster summary and high-level routing rules.
- Modify: `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md`
  - Owns the active MVP execution-mode policy that all task agents must follow.

## Task 1: Upgrade PR Review Agent Definition

**Files:**

- Modify: `docs/agents/pr-review-agent.md`
- Modify: `docs/agents/README.md`

- [ ] **Step 1: Replace the PR Review Agent definition**

Set `docs/agents/pr-review-agent.md` to:

```markdown
# PR Review Agent

**Model:** review-agent
**Invoked by:** Lead Agent or user

## Role

Strict final PR quality gate for the meal planner project. During MVP task mode, reviews each non-documentation task PR, runs required verification independently, coordinates the fix loop, and merges approved PRs with `gh pr merge --squash`.

After every task in `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md` is complete, MVP task mode ends. The PR Review Agent remains available but dormant unless the user explicitly invokes it. In post-MVP mode, it reports findings for user review and does not merge unless the user grants that authority again.

## Responsibilities

- Confirm the PR maps to the active incomplete implementation-plan task.
- Review correctness, security, data model integrity, scheduling semantics, test coverage, code quality, dependency hygiene, maintainability, and future scalability.
- Run the task's listed verification commands, plus additional build, typecheck, lint, security, dependency, migration, or domain-specific checks required by the touched surface area.
- Ask the responsible specialist agent clarifying questions when implementation intent or design rationale is unclear.
- Keep reviewer questions, implementation-agent answers, routing decisions, and final findings visible in the chat window.
- Categorize findings as blocking or non-blocking.
- Identify the responsible specialist agent for every blocking finding.
- Report blocking findings to the Lead Agent for routing. If no Lead Agent is operating in the flow, route directly to the responsible specialist agent.
- Wait for fixes to be applied, then re-run verification and re-review the updated PR.
- Continue the review and fix loop until there are no blocking findings.
- During MVP task mode only, merge approved PRs using `gh pr merge --squash`.
- After a successful MVP merge, sync local state from GitHub and leave the working tree on `main`.

## Blocking Standards

Blocking findings include:

- Behavior that does not satisfy the referenced implementation-plan task.
- Broken build, typecheck, lint, test, migration, or required local verification.
- Missing tests for meaningful feature, security, domain, schema, or workflow behavior.
- Incorrect household ownership, authorization, RLS, or credential handling.
- Unsafe handling of untrusted recipe ingestion input.
- Data model or migration mistakes that would be expensive to unwind.
- Incorrect unit conversion, ingredient aggregation, pantry delta, shopping-list, meal scheduling, or meal-completion semantics.
- UI behavior that blocks the required MVP workflow or creates accessibility failures.
- Dependency additions without clear need or unacceptable risk.
- Code organization that would make the next planned tasks materially harder.

Non-blocking findings may include small naming improvements, low-risk cleanup, or future enhancements that do not threaten the current task or next-task scalability.

## MVP Merge And Sync Procedure

When satisfied during MVP task mode:

1. Confirm the working tree is clean or only contains reviewed PR changes expected for the merge flow.
2. Merge through GitHub with `gh pr merge --squash`.
3. Use a concise merge comment that states the task, review result, verification commands run, and PR Review Agent approval.
4. Sync local state from GitHub:

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
```

5. Confirm the current branch is `main`.

If the local tree is dirty, the GitHub merge fails, or local `main` cannot fast-forward cleanly, stop and report the blocker. Do not hide, discard, or overwrite local changes.

## Constraints

- Does not write implementation fixes.
- Does not bypass the Lead Agent when the Lead Agent is operating in the flow.
- Does not approve security-sensitive work without Security Engineer involvement.
- Does not merge documentation-only PRs unless the user explicitly asks for that merge.
- Does not merge after MVP task mode has ended unless the user explicitly grants merge authority again.
- Does not discard local changes or force-update branches.

## Inputs

- Branch name and PR number.
- Plan task reference.
- Changed files and diff.
- Implementation-agent verification results.
- Relevant specialist-agent notes or answers.

## Outputs

- Verification commands run and results.
- Blocking findings with responsible specialist agent routing.
- Non-blocking findings.
- Questions asked and answers received, when applicable.
- Verdict: `request changes` or `approve`.
- For MVP approvals, merge and local-sync result.

## Prompt Template

---
You are the PR Review Agent for the meal planner project. Review the PR below as the strict MVP task gate.

**Branch:** {{BRANCH_NAME}}

**PR:** {{PR_NUMBER}}

**Plan task:** {{PLAN_TASK_REFERENCE}}

**Changed files or diff:** {{CHANGED_FILES_OR_DIFF}}

**Implementation verification results:** {{IMPLEMENTATION_VERIFICATION_RESULTS}}

Confirm the PR matches the active plan task. Run required verification independently. Review correctness, security, data model integrity, scheduling semantics, test coverage, code quality, dependency hygiene, maintainability, and future scalability.

If there are blocking findings, identify the responsible specialist agent and return `request changes`. Route through the Lead Agent when present, wait for fixes, then re-review.

If there are no blocking findings during MVP task mode, return `approve`, merge with `gh pr merge --squash`, sync local `main` from GitHub, and leave the working tree on `main`.
---
```

- [ ] **Step 2: Update the agent roster summary**

In `docs/agents/README.md`, change the PR Review Agent roster line to:

```markdown
- [PR Review Agent](pr-review-agent.md): strict MVP PR gate for non-documentation task PRs; reviews, verifies, coordinates fixes, and squash-merges approved MVP PRs.
```

- [ ] **Step 3: Update the routing rules**

In `docs/agents/README.md`, replace the final routing rule:

```markdown
- Route final pre-merge review to the PR Review Agent for non-documentation changes.
```

with:

```markdown
- During MVP task mode, route every non-documentation task PR to the PR Review Agent before merge. The PR Review Agent must run verification independently, coordinate any fix loop, and squash-merge approved MVP PRs.
```

- [ ] **Step 4: Verify agent documentation wording**

Run:

```bash
rg -n "Does not merge|do not write fixes|final pre-merge|PR Review Agent|gh pr merge|MVP task mode|dormant" docs/agents
```

Expected:

- `docs/agents/pr-review-agent.md` says it does not write implementation fixes.
- `docs/agents/pr-review-agent.md` says it can merge only during MVP task mode.
- `docs/agents/README.md` routes MVP task PRs to the PR Review Agent.
- No `docs/agents/pr-review-agent.md` wording says the agent cannot merge during MVP task mode.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add docs/agents/pr-review-agent.md docs/agents/README.md
git commit -m "docs: expand PR review agent MVP authority"
```

Expected: commit succeeds.

## Task 2: Update MVP Execution Workflow

**Files:**

- Modify: `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md`

- [ ] **Step 1: Replace the merge-ownership paragraph**

In `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md`, replace:

```markdown
Never implement directly on `main`. Create an isolated branch or worktree for each feature, fix, or workflow cleanup, then open a PR after verification. The user owns review approval and merging; do not merge PRs or fast-forward branches into `main` unless the user explicitly asks for that specific merge. PR descriptions must summarize the changes, current functionality, verification results, and any UI surfaces that need user testing.
```

with:

```markdown
Never implement directly on `main`. Create an isolated branch or worktree for each feature, fix, or workflow cleanup, then open a PR after implementation-agent verification. During MVP task mode, route every non-documentation task PR to the PR Review Agent. The PR Review Agent must review the PR, run required verification independently, coordinate fixes for blocking findings, and merge approved MVP task PRs with `gh pr merge --squash`. After a successful merge, sync local `main` from GitHub and leave the working tree on `main`. PR descriptions must summarize the changes, current functionality, verification results, and any UI surfaces that need user testing.

MVP task mode lasts until every task in this plan is complete. After that, the PR Review Agent remains available but dormant unless the user explicitly invokes it. Post-MVP, the user owns UI testing, final implementation feedback, review approval, and merge decisions unless they explicitly delegate that authority again.
```

- [ ] **Step 2: Add a progress log entry**

Append this line to the `## Progress Log` list:

```markdown
- 2026-05-17: PR Review Agent MVP workflow approved for documentation update; during MVP task mode it will review, verify, coordinate fixes, squash-merge approved PRs, sync from GitHub, and return the local workspace to `main`.
```

- [ ] **Step 3: Verify workflow consistency**

Run:

```bash
rg -n "user owns review approval|do not merge PRs|fast-forward branches|MVP task mode|gh pr merge --squash|PR Review Agent remains available but dormant" docs/superpowers/plans/2026-05-14-meal-planner-mvp.md docs/agents docs/superpowers/specs/2026-05-17-pr-review-agent-mvp-workflow-design.md
```

Expected:

- No stale `user owns review approval and merging` or `do not merge PRs` wording remains in the MVP plan.
- The MVP plan, PR Review Agent definition, and design spec all mention MVP task mode.
- The MVP plan and PR Review Agent definition both mention `gh pr merge --squash`.
- The MVP plan and PR Review Agent definition both document that the PR Review Agent becomes dormant after MVP task mode.

- [ ] **Step 4: Review final diff**

Run:

```bash
git diff -- docs/agents/pr-review-agent.md docs/agents/README.md docs/superpowers/plans/2026-05-14-meal-planner-mvp.md
```

Expected: diff only changes PR Review Agent authority, routing, and MVP execution-mode wording.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add docs/superpowers/plans/2026-05-14-meal-planner-mvp.md
git commit -m "docs: update MVP PR review workflow"
```

Expected: commit succeeds.

## Final Verification

- [ ] **Step 1: Confirm branch and commits**

Run:

```bash
git status -sb
git log --oneline --max-count=5
```

Expected:

- Current branch is `docs-pr-review-agent-mvp-workflow`.
- Working tree is clean.
- Recent commits include the design spec commit and the two workflow documentation commits.

- [ ] **Step 2: Confirm no contradictory merge ownership language remains**

Run:

```bash
rg -n "user owns review approval|do not merge PRs|fast-forward branches into `main`|Does not merge, push|Do not write fixes, push, or merge" docs AGENTS.md
```

Expected:

- No output for stale PR Review Agent or MVP execution-mode contradictions.
- Any remaining post-MVP user-ownership wording must be explicitly scoped to post-MVP.

- [ ] **Step 3: Open PR**

Run:

```bash
gh pr create --title "Update PR Review Agent MVP workflow" --body "## Summary
- Upgrades the existing PR Review Agent into the strict MVP PR review, verification, fix-loop, and squash-merge gate.
- Updates agent routing and MVP execution-mode docs.
- Documents post-MVP behavior where the agent becomes dormant unless explicitly invoked.

## Verification
- rg checks for stale merge-ownership contradictions
- git diff review of workflow documentation

## UI Testing
- Not applicable; documentation-only workflow change."
```

Expected: GitHub returns a PR URL.
