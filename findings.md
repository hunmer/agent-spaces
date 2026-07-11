# Findings

- Task scope: team/session task persistence, tools, idle owner wake-up, prompt/tool defaults.
- Existing `GetAgentSessionDetail` tool can supply upstream agent output by agent session ID.
- Team runtime storage is per `team/<teamId>/<sessionId>` with messages, deliveries, runtimes, comments; add `tasks.json` beside them.
- `activeTeamRuns` is the authoritative in-process running set and `dispatchTeamReply(...).finally` removes entries, providing an event-driven idle-check seam.
- `resolveTeamRuntimeTools` already force-adds `team_task_complete` for owners; task tools can be force-added by role without changing every saved agent immediately.
- Generated team agents currently receive only `team_message_send`; owner/member defaults must diverge in `normalizeTeamMemberSelection`.
- The idle recovery can stay event-driven: after a non-owner run ends with no queued handoff, inspect incomplete tasks and active member runs, then enqueue one owner check.
- Task completion stores the executing agent session ID injected by the bound tool context, enabling downstream `GetAgentSessionDetail` calls.
