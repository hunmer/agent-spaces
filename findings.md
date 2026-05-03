# Findings & Decisions

## Requirements
- Stop using the `queue` component for tool/step display.
- Use `packages/web/src/components/chat/chain-of-thought.tsx` for chain rendering.
- Each chain should show tool usage and AI output messages, including non-summary intermediate output.
- Fix completed sessions showing a summary/final message again in the frontend.
- Follow-up: compact chain display should summarize tools, not expose raw JSON arguments by default.
- File tools such as Read should show a clickable file path that opens the file via editor tabs.
- Tool details should be collapsible; expensive details such as edit contents should be loaded lazily through a query API instead of streamed/rendered immediately.

## Research Findings
- `docs/ai-message-rendering.md` says `todo` parts currently represent TODO/tool records and are rendered by `queue.tsx`.
- `packages/web/src/components/chat/message-parts.tsx` is the only frontend import site for `queue.tsx`; its `todo` switch branch renders Queue primitives.
- `chain-of-thought.tsx` provides `ChainOfThought`, header/content, and steps with status and icons.
- `packages/server/src/ws/handler.ts` creates a streaming pending message, accumulates `liveOutput`, builds live parts from that stream, and updates the message during execution.
- On completion, `handler.ts` rebuilds `parts` from `result.output` and sets `content` from `result.output.join('\\n')`. If `result.output` repeats lines that already streamed through `liveOutput`, the completed UI can show a repeated final text/summary.
- `MessageParts` falls back to rendering `message.content` only when no `text` part exists, so duplication is most likely inside rebuilt completion `parts`, not the fallback.
- Editor file tabs are opened through `useEditorStore.openFile(workspaceId, path)`; chat can call this directly and does not need to modify `editor-tabs.tsx`.
- File API expects paths relative to the workspace root, so server tool summaries normalize absolute `file_path` values under `workspace.boundDirs[0]`.
- Claude runtime can expose full tool input before formatting; storing this via a new `tool_use` runtime event supports lazy detail fetching without streaming raw edit JSON to the UI.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Keep backend `todo` part type for tools | Lower risk than changing shared types and server parser shape. |
| Render `todo` parts with `ChainOfThoughtStep` | Satisfies the UI request without changing persisted message data. |
| Make `reasoning` use the same chain wrapper | This groups non-final AI output with tool usage in chain-of-thought UI. |
| Build final parts from `liveOutput` when present | Prevents completion from injecting a second copy of output already streamed. |
| Store full tool input in separate tool detail storage | Keeps message parts lightweight while allowing edit/detail inspection on demand. |
| Only show detail links when a saved detail exists | Avoids 404 detail buttons for old messages or runtimes that do not emit structured tool events. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `docs/ai-message-rendering.md`
- `packages/web/src/components/chat/message-parts.tsx`
- `packages/web/src/components/chat/chain-of-thought.tsx`
- `packages/server/src/ws/handler.ts`

## Visual/Browser Findings
- No browser or image inspection used.
