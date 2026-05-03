# Task Plan: AI Message Rendering Fix

## Goal
Use `chain-of-thought.tsx` for concise, useful tool/intermediate AI output rendering; avoid duplicate final output; support lazy tool details and opening referenced files in editor tabs.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Read the AI rendering doc and current chat components.
- [x] Locate queue usage and server completion update logic.
- [x] Document findings.
- **Status:** complete

### Phase 2: Technical Approach
- [x] Replace `todo` rendering with `ChainOfThought` primitives.
- [x] Keep `todo` as the data shape for compatibility, but stop using `queue.tsx`.
- [x] On final server update, build parts from the live stream when available so completed messages do not re-render a second final output.
- **Status:** complete

### Phase 3: Implementation
- [x] Update frontend message part rendering.
- [x] Update server final message update logic.
- [x] Update docs.
- **Status:** complete

### Phase 4: Verification
- [x] Run typecheck/build or targeted lint.
- [x] Inspect changed files.
- **Status:** complete

### Phase 5: Delivery
- [x] Summarize changes and verification.
- **Status:** complete

### Phase 6: Concise Chain Tool UI
- [x] Discover editor file-opening flow and message detail storage/API options.
- [x] Add compact tool summaries instead of raw JSON parameters.
- [x] Make tool detail collapsible and lazy-loadable.
- [x] Allow file tool links to open files in editor tabs.
- **Status:** complete

### Phase 7: Verification
- [x] Run targeted server/client checks.
- [x] Document residual risks.
- **Status:** complete

## Key Questions
1. Where is queue used? Answer: only `message-parts.tsx` imports it for `todo` parts.
2. Why does duplicate final text appear? Likely because live stream parts already include final text, then completion rebuilds parts from `result.output`, which can include the same assistant output again.

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep `todo` message part type | Avoids shared schema churn and server/client compatibility risk. |
| Render `todo` via `ChainOfThought` | Matches user request to stop using queue component while showing tool usage in each chain. |
| Use live output as final display source when available | The UI has already streamed these parts; rebuilding from `result.output` can duplicate final text. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- User specifically wants each chain to show tool usage including non-summary intermediate AI output.
- Follow-up request: make tool chain display concise and intuitive, do not show raw JSON by default, support read-file links opening in editor tabs, and lazy-load detailed edit contents via query API.
