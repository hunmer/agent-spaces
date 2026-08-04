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
- [complete] Reproduce and trace the dynamic module MIME failure reported from the real runtime.
- [complete] Remove the frame player dependency on the authenticated `/src/file` dynamic import route.
- [complete] Update regression coverage and handoff documentation for the final loading strategy.
- [complete] Run focused verification and review the fix.
- [complete] Trace the animation-group sprite preview refresh loop.
- [complete] Stabilize video editor derived data and compose callback dependencies.
- [complete] Add regression coverage and run focused verification.
- [complete] Trace preview mounting, frame quality defaults, and ffmpeg filter construction.
- [complete] Keep both preview players mounted and preserve their state across tab switches.
- [complete] Change frame extraction to lossless full-resolution PNG output.
- [complete] Add persisted crop selection UI and pass normalized source coordinates to ffmpeg.
- [complete] Update both ffmpeg plugin copies, tests, and handoff documentation.
- [complete] Run focused frontend/backend verification and review the final diff.
- [complete] Trace frame-list controls/layout, loop playback, animation-group crop ownership, and upload-list spacing.
- [complete] Implement the five requested video-editor interaction and layout changes.
- [complete] Add focused regression coverage for range controls, loop toggle, and per-group crop snapshots.
- [complete] Run focused verification and update handoff notes if the data contract changes.

## Decisions
- Preserve unrelated dirty-worktree changes.
- Support both external file drags and internal file/image drags if they share the canvas drag events.
- Preserve the unfinished drag auto-pan changes already present in `Canvas.jsx`.
- Preserve all existing dirty-worktree changes and restrict edits to the embedded frame-player feature.
- Snapshot the current source frame URL array on new animation groups; a crop-region-only snapshot cannot preserve already extracted pixels when global frames are replaced.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| `node --test` could not resolve the existing extensionless `./constants` import pulled in by `canvas-constants.js` | 1 | Keep the pure helper dependency-free and inject `CANVAS_DROP_MIME` from the runtime hook. |
| Quoted wildcard dependency paths were treated literally by `rg` | 1 | Resolve the installed package directory with `find`, then inspect the explicit path. |
| `getFastImageSequence()` dynamically imports a `srcFileUrl` whose response is `text/html` with an empty token | 1 | Replaced with direct React `<img>` rendering and a component-owned interval; no module URL is requested. |
| Animation-group sprite previews continuously recomposed while playing | 1 | Memoized derived arrays so `groupFrames` and `onCompose` stay stable during local renders. |
| Combined ffmpeg patch context did not match escaped filter strings | 1 | No partial changes applied; retry with smaller patches anchored on exact source lines. |
| Tool wrapper parsed ffmpeg template literals inside a raw patch | 2 | No file changes applied; use small double-quoted patch strings without JavaScript template interpolation. |
| ffmpeg smoke-test script was rejected because its temp cleanup used `rm -rf` | 1 | Command did not run; retry without any deletion command and retain the isolated temp directory. |
| Icon export search included nonexistent `packages/ui` | 1 | No changes made; inspect the actual `packages/web/src/lib/ui-exports.ts` export surface only. |
| Output research referenced nonexistent `components/HistoryTab.jsx` | 1 | No changes made; locate the actual history component with `rg --files` before reading. |
| Output research referenced nonexistent `utils/image-ops/image-data.js` | 1 | No changes made; use the discovered `utils/image-ops/io.js` path. |
| Parallel storyboard verification wrapper returned no child output | 1 | Split tests, Babel transforms, and source scans into separate commands to expose the concrete failure. |
| Source audit wrapper treated `rg` no-match exit code 1 as failure | 1 | Rerun the no-match audit with an explicit success fallback and keep diff inspection separate. |
| Combined PowerShell source-audit regex still failed in wrapper quoting | 1 | Stop combining regex audits; use simple independent searches and direct file checks. |
| Gallery fallback initially received normalized item objects instead of URL strings | 1 | Found during diff review before handoff; changed Gallery items to use `item.url` and retained global indexes. |
| Output reorder initially passed normalized resource objects as `output.images` | 1 | Found during second review; split the callback into URL and resource arrays and synchronized delete by original index. |
| Final audit regex used unsupported `rg` look-ahead | 1 | No source changes; replace it with simple independent searches and rerun the full verification set. |

## Current Task: Output grouping and labels

### Goal
Add optional `groupName` and `label` metadata to existing output asset objects without changing result container shapes. Render grouped assets in collapsible UI, show labels as thumbnail badges, preserve all legacy string/object data, and assign video-editor animation exports to named groups.

### Phases
- [complete] Trace output asset models, renderers, and video-editor export flow.
- [complete] Define a backward-compatible UI normalization/grouping helper.
- [complete] Implement collapsible groups, label badges, and animation-group export metadata.
- [complete] Add focused regression coverage and update project documentation.
- [complete] Run targeted syntax/tests and inspect the final diff.

### Decisions
- Keep `images`/`videos` and existing result arrays structurally unchanged.
- Treat `groupName` and `label` as optional per-asset metadata; legacy entries remain valid.
- Restrict the implementation to the mini-app UI/data objects already produced by the video editor.

## Current Bug: Animation groups reset after refresh

### Goal
Preserve persisted video-editor animation groups across page refresh while still clearing video-bound state when the user actually switches videos.

### Phases
- [complete] Trace save/load and dialog mount paths; inspect persisted runtime data.
- [complete] Add a failing regression test for initial-mount reset behavior.
- [complete] Guard the video-switch reset effect against initial mount.
- [complete] Run focused regression and syntax verification.

### Root Cause Evidence
- Canvas save/load preserves arbitrary node data without a field whitelist.
- The persisted node has `animGroups: []` while its exported resource still has `groupName: "动画组 1"`, proving a group existed before a later clear.
- `VideoEditorDialog` clears `animGroups` in a `[currentVideo]` effect that runs on initial mount after refresh.

### Resolution
- Initialize `previousVideoRef` from the current persisted video and return when the URL has not changed.
- Preserve the existing reset behavior for actual video URL transitions.
- Regression test changed from 10 pass / 1 fail before the fix to 11 / 11 passing after it; the broader focused set passes 26 / 26.

## Current Task: Storyboard creation node migration

### Goal
Migrate the useful storyboard-writing and built-in character capabilities from the `文案转分镜` mini-app into `game-asset-canvas`: expose storyboard editing directly in a canvas node form, add character management as a new RightPanel tab, omit source project management and dialogs, and materialize generated image/video/audio outputs as connectable display nodes.

### Phases
- [complete] Read project instructions and map the source app's storyboard, character, persistence, and generation flows.
- [complete] Map target canvas extension points and define the minimal compatible data model.
- [complete] Implement character-library persistence and the RightPanel tab.
- [complete] Implement the storyboard creation node and its inline form/list workflow.
- [complete] Create connectable media display nodes from storyboard outputs.
- [complete] Add focused regression coverage and update handoff documentation.
- [complete] Run syntax/tests and inspect the scoped diff.

### Decisions
- Do not migrate source project management.
- Do not open the storyboard editor in a dialog; the node body owns the storyboard list UI.
- Reuse existing image/video/audio display node contracts so storyboard media remains connectable.
- Preserve unrelated dirty-worktree changes.

### Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Node ESM could not resolve extensionless `./constants` from the new storyboard utility | 1 | Use explicit `./constants.js` so the utility works in both the renderer and Node tests. |

## Follow-up: Storyboard node interaction adjustments

### Goal
Move character management into the storyboard node form, collapse AI storyboard import behind an explicit entry button, configure the storyboard Agent through the global Settings dialog, and persist drag-and-drop scene ordering.

### Phases
- [complete] Reuse the character manager as an embedded storyboard-node section and remove the RightPanel tab.
- [complete] Add global storyboard Agent settings using the established `openAgentEditor` pattern.
- [complete] Add collapsed AI import UI and remove per-node Agent ID input.
- [complete] Add handle-based scene drag sorting with normalized indexes.
- [complete] Update tests/docs and run focused verification.

### Decisions
- Character data remains workspace-scoped; only its management UI moves.
- Use native HTML5 drag events on a dedicated grip handle; no dependency addition.
- Storyboard Agent configuration is global, matching other Agent-backed features.

## Follow-up: Character dialog and handoff

### Goal
Open the workspace character library from a storyboard-node Dialog and produce a dedicated continuation handoff in the mini-app root.

### Phases
- [complete] Replace the inline character section with a Dialog entry and reusable character panel body.
- [complete] Update focused tests and project documentation.
- [complete] Create `handoff-storyboard.md` using the requested handoff workflow.
- [complete] Run focused syntax/tests and diff validation.

## Follow-up: Storyboard generation dialogs and presets

### Goal
Add a two-tab image generation dialog to the character library, label all three storyboard output fields, and replace inline generation parameters with four dedicated preset dialogs whose submitted values persist on the storyboard node and drive image, video, and voice workflow calls.

### Phases
- [complete] Read the mini-app guide and trace current storyboard forms, workflow parameter contracts, and persistence flow.
- [complete] Define backward-compatible preset defaults and dialog ownership.
- [complete] Implement the character image dialog, storyboard field labels, and four preset dialogs.
- [complete] Wire saved presets into scene media generation and add focused regression coverage.
- [complete] Run targeted tests/syntax checks and review the scoped diff.

### Decisions
- Preserve the existing workspace-scoped character library and node-scoped storyboard data.
- Reuse existing node form controls and workflow helpers instead of duplicating workflow execution logic.
- Preserve unrelated dirty-worktree changes.
- Select the storyboard image preset from actual inputs: selected character references use `editImage`, otherwise use `textToImage`.
