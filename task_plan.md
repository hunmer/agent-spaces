# Team runtime fault diagnosis

## Goal

Fix duplicate team messages, team tool `channel not found` failures, and writes to a closed LangChain stream.

## Phases

- [complete] Build a deterministic repro from stored messages/deliveries and existing tests.
- [complete] Trace tool dispatch and handoff stream ownership.
- [complete] Rank and test root-cause hypotheses.
- [complete] Add focused regression tests and implement the minimum fix.
- [complete] Run targeted tests and cleanup.

## Constraints

- Preserve unrelated dirty worktree changes.
- Do not rewrite historical team data unless required for the fix.
- Prefer one shared root-cause fix over prompt-only guards.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| `DEFAULT_CONTEXT_LENGTH` not defined | First typecheck | Use existing `normalizeContextLength(undefined)` helper. |
| Existing handoff test expected blocking tool call | First targeted test | Update contract to immediate queueing and post-parent dispatch. |
| Owner transfer test failed outside touched path | First targeted test | Re-run independently before deciding; preserve unrelated changes. |
| Handoff test relied on fixed sleeps and did not exit reliably | Final targeted test | Added an explicit editor completion signal before assertions and cleanup. |
| PowerShell range dump parsed `$p:` as a drive-qualified variable | Follow-up inspection | Use `${p}` when printing file/range labels. |
| Local `Delivery` type lacked `inboxStatus` | First follow-up typecheck | Add the persisted inbox status field to the local runtime projection. |
| Full team test still fails owner-transfer `my_role` assertion | Follow-up regression | Pre-existing unrelated failure already documented; run focused new regressions separately. |
| Full `git diff --check` found trailing spaces in existing server log | Follow-up diff check | Scope final whitespace check to files changed by this task. |
| Final plan update hunk did not match combined sections | Final bookkeeping | Re-read file tail and apply smaller exact hunks. |
| Assumed composer mention renderer file path did not exist | Channel Team inspection | Located the shared renderer under `components/composer/create-suggestion-renderer.ts`. |
| Server/Web saw stale shared and SDK declarations | First channel Team typecheck | Rebuild ignored workspace `dist` outputs before the final typecheck. |
| Team pseudo mention widened AgentBar runtime type | First channel Team typecheck | Strip the pseudo `kind` field and retain only the supported `langchain` runtime in the ChatAgent adapter. |
| Generated Agent regression retained `Agent Generator` | New follow-up red test | Expected failure; fix server-side normalization and frontend candidate filtering. |
| Team creation regression found root message files | New follow-up red test | Expected failure; remove empty-file initialization and require session-scoped writes. |
| Session message deletion returned not found | New follow-up red test | Expected failure; make context finders enumerate session directories and return the owning session id. |
| Session layout test expected legacy root files | First green run | Update the existing assertion to the migrated session-only layout. |
| Final line-reference `rg` split its double-quoted pattern | Final bookkeeping | Re-run with a PowerShell single-quoted pattern; no code or verification impact. |
| `apply_patch` could not express no-final-newline metadata | Test artifact cleanup | Used one scoped mechanical byte write to restore the original tracked JSON exactly. |
| Web rejected `AgentConfig` as `TeamMembershipAgent` | First custom-membership typecheck | Widen SDK create input to accept either embedded membership data or a complete `AgentConfig`. |

## Verification

- Server TypeScript: passed.
- Deferred handoff regression: passed.
- Diff whitespace check: passed.
- Full team test file: 6 passed, 1 unrelated pre-existing owner-transfer assertion failed.
- Follow-up server/shared TypeScript: passed.
- Follow-up focused runtime regressions: 2 passed.
- Follow-up scoped diff whitespace check: passed.
- Channel Team shared/server/web TypeScript: passed.
- Channel Team persistence regression: passed.
- Targeted Web ESLint: passed with 3 pre-existing warnings and no errors.
- Channel Team scoped diff whitespace check: passed.
- Team card summary Server/Web TypeScript: passed.
- Team mention cleanup regressions: 2 passed.
- Team card targeted ESLint and scoped diff check: passed.

## Follow-up: read acknowledgement and owner completion

- [complete] Trace message wake-up, delivery read state, and existing completion APIs.
- [complete] Implement automatic read acknowledgement at the shared wake-up boundary.
- [complete] Add the minimum owner-only team completion tool and prompt instruction.
- [complete] Add focused regression checks and run targeted validation.

## Follow-up: channel team integration

- [complete] Trace channel, mention, team execution, and message rendering contracts.
- [complete] Extract a reusable single/multi Team Selector.
- [complete] Persist selected teams in channel create/edit flows.
- [complete] Expose channel teams in mentions and dispatch team execution.
- [complete] Render team message cards and open Team Chat in a dialog.
- [complete] Run focused typechecks/tests and inspect the final diff.

## Follow-up: Team card runtime summary

- [complete] Confirm Team Runtime fields and Team mention cleanup behavior.
- [complete] Show Team status and running/completed agents in TeamMessageCard.
- [complete] Stop restoring Team mentions after send and strip Team mention text from dispatched content.
- [complete] Run focused typecheck, lint, and regression checks.

## Follow-up: generated agents and session-scoped storage

- [complete] Reproduce agent-generator leakage, missing Team tools, and root-level runtime file writes.
- [complete] Trace memberships-derived Agent configuration and every runtime storage path caller.
- [complete] Add focused failing regressions for filtering/configuration/path placement.
- [complete] Implement the minimum shared fixes.
- [complete] Run targeted tests, builds, and scoped cleanup.

## Follow-up: generated agents as custom memberships

- [in_progress] Trace the generated Agent submission payload through Web, SDK, and Team creation.
- [pending] Add a failing regression proving custom Agent config is persisted only in memberships.
- [pending] Remove global preset creation and carry generated configs in Team form values.
- [pending] Extend Team create input for mixed existing/custom members.
- [pending] Run focused tests, typechecks, lint, and cleanup.
