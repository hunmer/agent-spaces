# Findings

- Historical messages show repeated cross-role notifications and whole-history payload duplication.
- User reports team tools returning HTTP 404 `channel not found` and LangChain token callbacks writing after the stream controller closes.
- CodeGraph points to `dispatchTeamReply` in `packages/server/src/services/team-runtime.ts`: it creates a generic agent message parts tracker with `workspaceId = TEAM_RUNTIME_WORKSPACE_ID` and `channelId = runtime.id`, even though team runtime messages are stored in team files rather than a normal channel.
- The same handoff path stops an existing run for the same `teamId:actor:target` key before starting another, so stream ownership and callback cleanup must be checked together.
- `createAgentMessagePartsTracker` persists tool details under a required `workspaceId/channelId`, confirming team runtime currently projects non-channel activity into channel-oriented storage.
- `team_message_send` is locally bound to `handleTeamMessageSendAndRun`; `team_message_update` and other team tools call local service handlers, so an HTTP-shaped 404 likely originates from surrounding channel/tool-detail infrastructure rather than the team handler result itself.

## Ranked hypotheses

1. Team tool detail lookup uses `runtime.id` as a normal channel id and returns `channel not found` even when the local tool executed.
2. Stopping/replacing an active LangChain run leaves a token callback attached to a closed stream controller.
3. Explicit agent handoffs overlap with `dispatchTeamReply` automatic completion recipients, producing duplicate persisted messages.
4. LangChain's tool-result final-response retry can repeat a send when the first stream ends without assistant text.

## Confirmed root causes

- Agent handoffs synchronously await the downstream agent inside the parent LangChain tool call. Revision loops nest back into an earlier run key, causing `stop()` against a stream whose callbacks are still unwinding.
- Each `dispatchTeamReply` creates an automatic completion message in addition to the explicit `team_message_send` workflow message. It addresses the immediate caller plus owner, multiplying messages and deliveries.
- Team Chat maps `runtime.id` into `Message.channelId`; generic `ToolStep` then calls the normal channel detail route, whose required channel lookup returns 404 because a team runtime is not a channel.
- The latest stored run has 12 messages and 15 deliveries; 9 deliveries remain `running`, matching interrupted nested handoffs.
- Automatic reply deliveries were never completed because finalization only updated the inbound message delivery; completion now covers both inbound and generated reply deliveries.

## Follow-up findings

- Team delivery state uses `TeamInboxItem` fields (`inboxStatus`, `readAt`, `executionStatus`, etc.), while the local `Delivery` type in `team-runtime.ts` is currently narrower.
- The shared wake-up path is `dispatchTeamReply`; automatic read acknowledgement should happen there so it does not depend on an agent tool call.
- Runtime status already supports `completed`; the new owner tool should reuse the existing runtime update/completion path instead of introducing a second task state model.
- `team_message_update` already centralizes valid delivery transitions and timestamps, but automatic wake-up has the exact delivery id and can update the same record directly at the runtime boundary.
- `createTeamFunctionTools` filters tools through shared `BUILT_IN_AGENT_TOOLS`; a new tool name must be declared there or it will be filtered out.
- Team tools receive bound `teamId` and `actorAgentId`, so the completion tool needs no model-supplied identifiers and can enforce owner permission server-side.
- Owner agents may have an explicit tool whitelist, so runtime tool resolution must append `team_task_complete` for active owners; otherwise the prompt could instruct an unavailable tool.
- Read acknowledgement regression must assert while the agent is still blocked/running, not only after completion, to prove wake-up itself marks the delivery read.

## Channel team integration

- CodeGraph is available and indexes all five requested frontend files.
- Team is global; frontend Team calls must use `sdk.team.*`.
- `TeamChatPanel` already accepts `teamId` and `actorAgentId`, so the Team message dialog can reuse it directly.
- Team runtime uses the fixed human sender `admin`; normal channel execution must bridge into `sdk.team.sendRuntimeMessage` or the matching server boundary.
- Detailed Channel/message contracts are still being traced; implementation will reuse existing APIs and UI primitives.
- `Channel.members` is normalized against workspace agents, so Team ids need a separate `Channel.teamIds` field.
- Channel persistence is a small shared path: shared type, SDK create/update, server route/service, Zustand store, and dialog callers.
- Composer mentions currently return plain ids. Normal chat send should split ids against `channel.teamIds`: agents continue through `runMentionedAgent`, teams go through Team runtime.
- A Team-triggered channel message needs `MessageMetadata.teamId/teamName` so `MessageItem` can render the Team-only card and dialog.
- Use mention ids as `team:<teamId>` to avoid collisions with agent ids; persisted `Channel.teamIds` remain raw ids.
- The server can create a lightweight channel card message immediately, then call existing `postTeamRuntimeMessage` asynchronously with actor `admin`; `TeamChatPanel` supplies live execution/chat state in the dialog.
- No Team reply mirroring or new websocket protocol is needed for the requested UI flow.
- Team mention candidates are ordered before agents so the existing six-item suggestion cap cannot hide bound Teams.
- `MessageItem` dynamically loads `TeamChatPanel` to avoid a static component cycle because `TeamChatPanel` already renders `MessageItem`.

## Team card runtime summary

- Reuse `sdk.team.getRuntime(teamId, 'admin')`; no new server status endpoint is needed.
- Team mention cleanup must cover both the dispatched runtime content and the composer post-send restore behavior.
- Runtime `running` messages are emitted by the executing agent, so running agents come from non-admin `senderAgentId`; fall back to `runtime.leader_agent_id` while running.
- Completed agents come from non-admin senders of completed runtime messages, excluding agents still running.
- Server `stripHtml` intentionally converts Mention spans to `@label`; Team mentions must be removed before calling it and before persisting the channel user message.

## Generated agents and session-scoped storage

- User reports generated members can include the built-in `agent-generator` and lack Team tool usage instructions.
- User reports `deliveries.json`, `comments.json`, and `messages.json` are still created under `team/{teamId}` although runtime data now belongs under `team/{teamId}/{sessionId}`.
- The provided memberships fixture is the source of truth for the expected generated Agent tool/prompt shape.
- The fixture gives every business Agent `tools: ["team_message_send"]`; prompts state the exact sender/recipient workflow, and owner-only `team_task_complete` is appended by Team Runtime.
- `team-runtime.ts` already requires `sessionId` for messages, deliveries, and runtimes.
- `team-internal.ts` still accepts optional session ids and falls back to Team root paths, which permits the reported root-level files.
- Built-in `agent-generator` filtering belongs in server-side generated-result normalization so every caller gets the same guarantee.
- `team-manage.ts` explicitly creates empty root-level `messages.json`, `deliveries.json`, and `comments.json` during Team creation; these writes are unnecessary after session scoping.
- `team-inbox.ts` updates delivery state with `saveDeliveries(ctx.team.id, nextDeliveries)` and drops the known session id, which can recreate root-level deliveries.
- Root-level list/find calls do not write files but become stale after migration; aggregate lookup must enumerate UUID session directories.
- The create dialog still renders every global preset as a candidate, including built-in `agent-generator`, even though smart creation now creates new Agents.
- Confirmed fixes: generated-result normalization removes reserved `agent-generator`; generated prompts receive shared handoff instructions; created presets enable only `team_message_send`.
- Confirmed storage fix: Team creation no longer initializes session files, all message/delivery/comment writes require session ids, aggregate reads enumerate UUID session directories, and ID lookups return their owning session.
- Historical root files are left untouched; the change prevents new root writes and reads migrated session data.
