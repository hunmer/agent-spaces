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

## Verification

- Server TypeScript: passed.
- Deferred handoff regression: passed.
- Diff whitespace check: passed.
- Full team test file: 6 passed, 1 unrelated pre-existing owner-transfer assertion failed.
- Follow-up server/shared TypeScript: passed.
- Follow-up focused runtime regressions: 2 passed.
- Follow-up scoped diff whitespace check: passed.

## Follow-up: read acknowledgement and owner completion

- [complete] Trace message wake-up, delivery read state, and existing completion APIs.
- [complete] Implement automatic read acknowledgement at the shared wake-up boundary.
- [complete] Add the minimum owner-only team completion tool and prompt instruction.
- [complete] Add focused regression checks and run targeted validation.
