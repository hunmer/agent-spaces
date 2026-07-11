# Team task orchestration plan

## Goal
Prevent team conversations from stalling when a member finishes without sending a follow-up message.

## Phases
- [complete] 1. Trace team runtime state, tool wiring, prompts, and tests.
- [complete] 2. Add persisted team task list and builtin task tools.
- [complete] 3. Add owner idle self-check scheduling and task lifecycle integration.
- [complete] 4. Update owner/member prompts and default tool assignments.
- [complete] 5. Add regression tests and run builds.
- [complete] 6. Trace Team selection/session state and runtime response types.
- [complete] 7. Synchronize team_id and session_id with URL parameters.
- [complete] 8. Expose session tasks/final output and render them in Team detail.
- [complete] 9. Add focused tests/build validation.
- [complete] 10. Persist real member Agent Session IDs in Team runtime state.
- [complete] 11. Add Team member session list builtin tool and catalog entry.
- [complete] 12. Update runtime/designer prompts and default tools.
- [complete] 13. Add regression tests and build validation.

## Decisions
- Reuse JSON team runtime storage and existing function-tool patterns.
- Keep scheduling event-driven after a member run finishes; no polling service unless required by existing flow.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Prompt patch context mismatch due to decoded punctuation | 1 | Located exact UTF-8 lines with `rg` and split the patch. |
| Server build: readonly generated tools and invalid explicit `false` overload | 1 | Use mutable `BuiltInAgentToolName[]`; call the default non-wait overload without the second argument. |
| Existing owner-transfer test expects `my_role=null`, implementation returns fallback owner | 1 | Unrelated pre-existing behavior; task/runtime regression cases pass, so left untouched. |
| Web `tsc --noEmit` fails in existing `message-item.tsx:203` click-handler typing | 1 | Outside this change; Next compilation succeeded and modified packages are validated separately. |
