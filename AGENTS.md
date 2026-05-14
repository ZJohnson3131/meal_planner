<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Workflow

- Before selecting or starting the next task, read `docs/superpowers/plans/2026-05-14-meal-planner-mvp.md` and use the first incomplete task as the source of truth.
- Keep the implementation plan updated as work progresses. Mark completed steps and tasks with checked boxes, and update the plan's progress log after each task is verified and committed.
- Never implement directly on `main`. For every feature, fix, or workflow cleanup, create an isolated branch or worktree, complete and verify the work there, then merge back only after the task is complete.
- Follow the plan's execution mode: complete one task at a time, run the listed verification commands, commit the task, then report the result before moving on.
