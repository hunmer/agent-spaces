# Task Plan: Game asset canvas improvements

## Goal
When a file is dragged over the game asset canvas, continuously pan the viewport when the pointer approaches an edge or corner, and stop immediately when the drag leaves or ends.

Also ensure minimal nodes retain a clear selected state at low zoom, and pasted nodes are centered in the current viewport.

Embed the frame player directly inside the `game-asset-canvas` miniapp, replacing the iframe-based presentation described in `docs/video-editor-handoff.md` while preserving the required playback behavior.

## Phases
- [complete] Inspect existing canvas file drag/drop and viewport APIs.
- [complete] Implement scoped drag auto-pan using existing canvas patterns.
- [complete] Add focused regression coverage and documentation.
- [complete] Run syntax/tests and review the final diff.
- [complete] Trace low-zoom minimal node rendering and clipboard paste placement.
- [complete] Implement low-zoom selected styling and viewport-centered paste placement.
- [complete] Add focused regression coverage for both fixes.
- [complete] Run syntax/tests and review only the new changes alongside existing work.
- [complete] Read the video editor handoff and trace the current iframe/frame-player implementation.
- [complete] Confirm the frame player is already implemented as native miniapp components in current HEAD.
- [complete] Assess existing regression coverage and add only missing focused coverage.
- [complete] Run targeted checks and review the final diff.

## Decisions
- Preserve unrelated dirty-worktree changes.
- Support both external file drags and internal file/image drags if they share the canvas drag events.
- Preserve the unfinished drag auto-pan changes already present in `Canvas.jsx`.
- Preserve all existing dirty-worktree changes and restrict edits to the embedded frame-player feature.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| `node --test` could not resolve the existing extensionless `./constants` import pulled in by `canvas-constants.js` | 1 | Keep the pure helper dependency-free and inject `CANVAS_DROP_MIME` from the runtime hook. |
| Quoted wildcard dependency paths were treated literally by `rg` | 1 | Resolve the installed package directory with `find`, then inspect the explicit path. |
