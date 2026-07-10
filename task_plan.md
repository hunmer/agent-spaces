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

## Verification

- Server TypeScript: passed.
- Deferred handoff regression: passed.
- Diff whitespace check: passed.
- Full team test file: 6 passed, 1 unrelated pre-existing owner-transfer assertion failed.
