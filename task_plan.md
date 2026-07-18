# Task Plan

## Goal
Embed SkyOffice below the team detail panel, create a room per team, add its agents, and sync agent start messages/status.

## Phases
- [complete] Trace existing team, agent-start, and SkyOffice flows.
- [complete] Implement the smallest shared integration.
- [complete] Run focused checks and record results.
- [complete] Reproduce missing members/activity and identify the failed boundary.
- [complete] Apply root-cause fix and run regression checks.
- [complete] Add idle agent wandering and restore automatic player keyboard controls.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Tool JavaScript string quoting failed while running combined `rg` commands | 1 | Split queries into separately quoted commands. |
| PowerShell stripped quotes from inline `tsx -e` self-check | 2 | Added a tiny directly runnable test file instead of retrying inline escaping. |
| Archived team directory was treated as a live team during fixture inspection | 1 | Ignore non-team directories; no code impact. |
