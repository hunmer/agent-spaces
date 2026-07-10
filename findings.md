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
