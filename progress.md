# Progress

## Session Summary

- Created planning files for handoff:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- Inspected current planner/task orchestration baseline.
- Started Phase 2 data-model changes.

## Code Changes Already Made

Working tree currently has partial code changes:

- `packages/shared/src/types/task.ts`
  - Added `agentConfigId?: string`
  - Added `dependsOnTaskIds?: string[]`

- `packages/server/src/services/task.ts`
  - Expanded `create()` input with `agentConfigId`, `dependsOnTaskIds`, `sandboxDirs`.
  - Expanded `update()` input similarly.
  - Added `replaceIssueTasks()`.
  - Added `normalizeTaskIds()`.

- `packages/server/src/routes/task.ts`
  - POST accepts `agentConfigId`, `dependsOnTaskIds`, `sandboxDirs`.
  - PUT accepts those fields too.

## Not Yet Done

- No builds run after the partial changes.
- Added `issueService.replaceTasks()` and made `addTask()` idempotent.
- Created `packages/server/src/agents/issue-task-controller.ts` for task sync, dependency scheduling, and executor startup.
- Refactored `planner-agent.ts` to stop creating a fake task and stop directly running executors.
- Replaced hardcoded planner prompt with configured `systemPrompt` plus current issue context.
- Updated reviewer flow so approved tasks become `done`; controller continues dependency scheduling after reviewer hook returns.

## Current Verification State

- `pnpm --filter "@agent-spaces/shared" build` passed.
- `pnpm --filter "@agent-spaces/server" build` passed.
- `pnpm --filter "@agent-spaces/web" build` passed.
- `git -C "g:/agent_spaces" diff --check` passed.

## Follow-up Fixes

- Added shared `issue-agent-progress.ts` so planner, task creator, executor, and reviewer all create issue detail placeholders/comments.
- Fixed agent progress completion to store full output in issue comments instead of replacing it with truncated runtime summary.
- Removed private `ViewIssueTaskPlanningContext`; task creator now uses `ViewCurrentChannelIssue` plus `ReplaceIssueTasks`.
- Added `ViewCurrentChannelIssue`/`AddCurrentChannelComment` function tools to planner, task creator, executor, and reviewer prompts.
- Changed git commit message input from single-line input to textarea so multiline/full commit messages can be submitted.
- Expanded `ViewCurrentChannelIssue` to return issue, comments, tasks, channel metadata, assignable agents, and valid agent config ids.
- Added `docs/issue-agent-automation.md` documenting the current issue agent automation flow.
- Tightened task creator prompt and docs so task generation defaults to coarse-grained deliverables, splitting only for major cross-area or truly independent workstreams.
- Changed runnable task scheduling from parallel to serial so each executor waits for its reviewer before the next runnable task starts.
- Added issue comment metadata `phase` and `taskId`; issue comments now display phase/task ownership in the frontend.
- Added a local `react-virtualized` declaration file to keep the current issue detail virtualization changes type-safe during web build.

## Last Known Git Status

```text
 M packages/server/src/routes/task.ts
 M packages/server/src/services/task.ts
 M packages/shared/src/types/task.ts
?? findings.md
?? progress.md
?? task_plan.md
```

## Retry/Recovery Session - 2026-05-04

- Started implementing agent error retry and server restart recovery requirements.
- Confirmed existing `Task` has `retryCount`/`maxRetries`, while `Issue` currently only has `status: 'error'` and no issue-level retry counters.
- Current `runIssueTask()` marks runtime failures as `failed`, completes the agent, calls executor hook, and immediately re-enters scheduling; no retry path exists yet.
- Current server app only starts scheduler lazily/exported; no boot recovery pass exists.

## Retry/Recovery Session Results

- Added issue-level retry metadata to shared `Issue` and default initialization/backfill in issue service.
- Added `issue-retry` service for startup recovery, automatic error issue retry, and manual issue resume.
- Startup recovery now marks `running`/`retrying` tasks failed and `in_progress` issues error.
- Scheduler now retries `error` issues up to issue `maxRetries`, then sets `retryPaused`.
- Executor task failure now retries the task up to task `maxRetries`; only after exhaustion does it mark the issue error.
- Task retry route now resets failed tasks to `pending` and triggers scheduling instead of leaving them in `retrying`.
- Added issue resume API and issue-detail action for manually resuming failed tasks.
- Updated `docs/issue-agent-automation.md` with retry/recovery flow.
- Verification: `pnpm --filter @agent-spaces/shared build && pnpm --filter @agent-spaces/server build && pnpm --filter @agent-spaces/web build` passed.
- Verification: `git diff --check` passed.

## Retry Scope Correction

- User clarified issue retry must preserve completed tasks.
- Confirmed completed `done` tasks were already preserved, but cancelled tasks were also being reset.
- Tightened issue retry to reset only `failed` tasks; `done`, `pending`, `running`, `waiting_review`, and `cancelled` are left unchanged.
- Verification: `pnpm --filter @agent-spaces/shared build && pnpm --filter @agent-spaces/server build` passed.

## Reviewing Task Status

- Added `reviewing` to shared `TaskStatus`.
- Reviewer now changes a task to `reviewing` while reviewer runtime is active, then transitions from `reviewing` to `done` or `failed`.
- Scheduler active task set now includes `reviewing`.
- Task replacement/deletion/startup recovery treat `reviewing` as active.
- Issue detail now displays `Reviewing` and exposes active-task cancel control for it.
- Verification: full shared/server/web build passed and `git diff --check` passed.
