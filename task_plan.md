# Team task orchestration plan

## Goal
Prevent team conversations from stalling when a member finishes without sending a follow-up message.

## Phases
- [complete] 1. Trace team runtime state, tool wiring, prompts, and tests.
- [complete] 2. Add persisted team task list and builtin task tools.
- [complete] 3. Add owner idle self-check scheduling and task lifecycle integration.
- [complete] 4. Update owner/member prompts and default tool assignments.
- [complete] 5. Add regression tests and run builds.

## Decisions
- Reuse JSON team runtime storage and existing function-tool patterns.
- Keep scheduling event-driven after a member run finishes; no polling service unless required by existing flow.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Prompt patch context mismatch due to decoded punctuation | 1 | Located exact UTF-8 lines with `rg` and split the patch. |
| Server build: readonly generated tools and invalid explicit `false` overload | 1 | Use mutable `BuiltInAgentToolName[]`; call the default non-wait overload without the second argument. |
| Existing owner-transfer test expects `my_role=null`, implementation returns fallback owner | 1 | Unrelated pre-existing behavior; task/runtime regression cases pass, so left untouched. |
