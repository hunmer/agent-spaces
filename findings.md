# Findings

- Task scope: team/session task persistence, tools, idle owner wake-up, prompt/tool defaults.
- Existing `GetAgentSessionDetail` tool can supply upstream agent output by agent session ID.
- Team runtime storage is per `team/<teamId>/<sessionId>` with messages, deliveries, runtimes, comments; add `tasks.json` beside them.
- `activeTeamRuns` is the authoritative in-process running set and `dispatchTeamReply(...).finally` removes entries, providing an event-driven idle-check seam.
- `resolveTeamRuntimeTools` already force-adds `team_task_complete` for owners; task tools can be force-added by role without changing every saved agent immediately.
- Generated team agents currently receive only `team_message_send`; owner/member defaults must diverge in `normalizeTeamMemberSelection`.
- The idle recovery can stay event-driven: after a non-owner run ends with no queued handoff, inspect incomplete tasks and active member runs, then enqueue one owner check.
- Task completion stores the executing agent session ID injected by the bound tool context, enabling downstream `GetAgentSessionDetail` calls.
- Team selection state lives in `team-management-page.tsx`; `team-list-panel.tsx` only emits `onSelectTeam`, so URL synchronization belongs in the parent callback/state initializer.
- `TeamChatPanel` already emits `onSessionIdChange` and accepts `initialSessionId`, but the parent currently does not pass the URL session into it.
- `getTeamRuntime` already returns `runtime.output`; adding `tasks: listTasks(teamId, sessionId)` is the smallest API extension for the detail sidebar.
- `TeamDetailPanel` currently has the active session ID but no runtime data, so it can fetch the same session detail directly without coupling chat state upward.
- URL parameters should use the requested snake_case names `team_id` and `session_id`; initializing parent state from them lets refresh restore selection.
- Existing Team translations live in `packages/web/src/locales/{zh,en}/teams.json`; add only the detail labels needed by the new cards.
- Team task IDs are not Agent Session IDs. The authoritative Agent Session ID is `reply.agentContext.sessionId` returned by each member runtime.
- Because Team runtime now stores one record per Team session, member Agent Session history is stored as `runtime.agentSessions[]` inside that record.
- `team_agent_session_list` is bound to the current Team session and may filter by `agent_id`; its returned `session_id` is safe to pass to `GetAgentSessionDetail`.
