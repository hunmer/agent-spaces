# Findings

- Team detail UI entry: `packages/web/src/components/teams/team-detail-panel.tsx`, component `TeamDetailPanel`.
- Server SkyOffice room class: `packages/server/src/skyoffice/rooms/SkyOffice.ts`; it supports chat/status messages through its dispatcher.
- Team memberships contain `teamId`, `agentId`, optional agent data and active status.
- CodeGraph did not index `SkyOfficeApp` or `agent-client.ts`; use targeted text/file inspection next.
- `executeTeamReply` is the shared entry for preset/chat/custom team agents, so one hook there covers all team-agent starts.
- Existing SkyOffice `Bridge` already supports spawn, talk, and async activity transitions; no new protocol is needed.
- Frontend `Network.joinCustomById` already joins a business room ID; `SkyOfficeApp` only needs an automatic-join prop and embedded sizing.
- Room registry is in-memory. The minimal idempotent mapping can derive a stable room ID from `teamId` and recreate it after server restart.
- Verification: server `tsc` passed; `test/team-room.test.ts` passed; changed web files have no ESLint errors.
- Repository-wide web `tsc --noEmit` has unrelated existing failures, so it is not a clean project baseline.
- Reproduction showed the server registry had 3 agents while a real Colyseus client decoded `{ players: {}, agents: {} }`.
- Root cause: server TS emitted native class fields (`useDefineForClassFields=true` via ES2022), shadowing `@colyseus/schema` decorator accessors, so state changes were not serialized.
