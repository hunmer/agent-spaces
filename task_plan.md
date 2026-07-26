# Task Plan

## Goal
Fix the game-asset-canvas image editor dialog so it stays open and does not trigger null DOM access errors.

## Phases
- [complete] Trace existing team, agent-start, and SkyOffice flows.
- [complete] Implement the smallest shared integration.
- [complete] Run focused checks and record results.
- [complete] Reproduce missing members/activity and identify the failed boundary.
- [complete] Apply root-cause fix and run regression checks.
- [complete] Add idle agent wandering and restore automatic player keyboard controls.
- [complete] Trace the image editor dialog lifecycle and Painterro integration.
- [complete] Apply the Painterro lifecycle/DOM cleanup fix.
- [complete] Constrain editor layout and add reusable color-picker mode for cutout controls.
- [complete] Update the mini-app contract and run focused static checks.
- [complete] Fix hidden Painterro toolbar and overly strict cutout color-picker availability.
- [complete] Run focused static regression checks for the follow-up fixes.
- [complete] Restore cutout color-picker disabled state when no source image exists.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Tool JavaScript string quoting failed while running combined `rg` commands | 1 | Split queries into separately quoted commands. |
| PowerShell stripped quotes from inline `tsx -e` self-check | 2 | Added a tiny directly runnable test file instead of retrying inline escaping. |
| Archived team directory was treated as a live team during fixture inspection | 1 | Ignore non-team directories; no code impact. |
| Combined `apply_patch` had an invalid hunk boundary | 1 | No files changed; rebuilt the patch with valid per-file hunks. |
