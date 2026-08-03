# Findings: Canvas drag edge auto-pan

## Research Notes
- `ImageResult.jsx` starts native HTML5 drag operations and writes shared canvas image drag MIME data through `setCanvasImageDragData`.
- Auto-pan belongs at the canvas container drag-event layer so internal image drags and external OS file drags share behavior.
- The source-node image reorder path uses a separate `IMAGE_REORDER_MIME`; canvas drop already distinguishes it.
- `Canvas.jsx` renders a single outer canvas `div` with `wrappingRef`, `crud.handleDragOver`, and `crud.handleDrop`, so it is the correct ownership boundary for pointer-edge detection.
- The same component owns the React Flow instance and controlled `viewport`, allowing auto-pan without changing node drag sources.
- Project `AGENTS.md` requires minimal changes, simplified Chinese reporting, no browser test unless explicitly requested, and service restart only when one is used.
- `@xyflow/react` is version `^12.10.2`; its React Flow instance exposes `panBy` for relative viewport translation.
- Scope activation to drag types `Files` and `CANVAS_DROP_MIME`. This covers OS image files and images dragged from `ImageResult`, history, asset library, and upload controls while excluding node-template/history-node drags and reorder-only operations.
- Use a 72px edge zone and proximity-scaled movement up to 18 screen pixels per animation frame; opposite axes combine at corners.

## Research Notes: low-zoom selection and paste placement
- `Canvas.jsx` derives `compactNodes` from `COMPACT_NODE_ZOOM_THRESHOLD` and injects `data.compactView` into every decorated node.
- Compact rendering is owned by `NodeShell.jsx`, `ImageDisplayNode.jsx`, and `NoteNode.jsx`; their full-node resize/toolbars are intentionally hidden while compact.
- Normal copy/paste is owned by `useSelectionClipboard.js`, which currently calls `pasteNodes({ genId })` without a viewport-based target.
- `Canvas.jsx` already has `getViewportCenter()` and `reactFlow.screenToFlowPosition(...)`, used for pasted image files and regular node creation, but these are not passed into the selection clipboard hook.
- `pasteNodes` currently applies a fixed `{ x: 40, y: 40 }` offset and returns pasted nodes unselected; the hook can pass an explicit placement offset without changing clone-node behavior, which already passes its own offset.
- Correct multi-node centering should use the copied selection's bounding box, including known `width`/`height`, then translate every pasted node by the same delta to the viewport center.
- Compact node selection should be a visual border/ring on the compact card itself; toolbars and `NodeResizer` should remain hidden below the zoom threshold.
- The final implementation uses the same primary border plus four-pixel ring across all three compact renderers; NoteNode now accepts React Flow's `selected` prop.
- Paste placement is computed in Flow coordinates from the current canvas DOM center, so it remains correct under pan and zoom.

## Research Notes: embedded frame player
- `docs/video-editor-handoff.md` describes `FrameSequencePlayer.jsx` as an existing React wrapper around a vendored `@mediamonks/fast-image-sequence@2.2.0` build.
- The documented player contract includes play/pause, frame slider, absolute frame number, loop range, optional FPS editing, and `destruct()` cleanup.
- The handoff explicitly says new code should import `components/FrameSequencePlayer.jsx`; `components/nodes/FramePlayer.jsx` is only a compatibility re-export.
- The broad iframe search found iframe usage for Director Desk, Pixelorama, Photopea, and the miniapp host itself, but no iframe inside `VideoEditorDialog.jsx` or `FrameSequencePlayer.jsx`.
- Next step is to inspect the concrete player/dialog code and current dirty diff to determine whether the requested migration is already partially implemented or whether the remaining external loading mechanism is the vendored dynamic import.
- CodeGraph confirms `FrameSequencePlayer` mounts `FastImageSequence` directly into a local `div`, while `VideoEditorDialog` imports that React component directly.
- `getFastImageSequence()` still loads a vendored JavaScript entry through `window.AgentSpaces.srcFileUrl()` and native dynamic import; this is not an iframe, but it is the only remaining runtime indirection in the player.
- Current `git status` shows no modifications for `FrameSequencePlayer.jsx`, `VideoEditorDialog.jsx`, or `cdn.js`; therefore the direct-rendering implementation is already in repository HEAD rather than an unfinished local change.
- Existing unrelated dirty changes affect panel layout, manifest, Canvas, edge display, and the handoff document; they must remain untouched.
- Git history contains multiple commits touching the player/dialog/vendor files; this supports that the native integration was previously implemented and committed.
- The frame player engine is fully vendored under `src/vendor/fast-image-sequence/` with pinned version and hashes; no network CDN dependency is used at runtime.
- Repository-wide source search found no alternate iframe-based frame player. The only video editor player references are the direct React component, its local loader, and docs.
- `git blame` shows the complete direct player was introduced in commit `f06c304c` on 2026-08-03; the current request arrives after that commit is already in HEAD.
- The miniapp has no standalone `package.json`; runtime dependencies come from the host, while the fast-image-sequence distribution is bundled as miniapp source assets and loaded through the host's local `srcFileUrl` capability.
- Decision: do not rewrite the already-correct direct player or remove the proven frame-sequence engine. Validate the committed integration and only patch a concrete failure if verification exposes one.
- Commit `f06c304c` added the direct player, local vendor distribution, frame selection utilities/tests, and replaced the older `nodes/FramePlayer.jsx` implementation with a compatibility export.
- Existing tests cover frame-selection behavior but not the integration invariant that `VideoEditorDialog` renders `FrameSequencePlayer` directly and that the player source contains no iframe.
- Verification passed: 7 focused tests, Babel JSX transforms for player/dialog, native import of the vendored entry, documented SHA-256 hashes, and `git diff --check`.
- Real runtime feedback invalidated the earlier loader assumption: `srcFileUrl()` produced `http://127.0.0.1:3100/api/mini-apps/.../src/file?...&token=` and the server returned `text/html`, so native dynamic import failed strict MIME validation.
- The iframe-free React integration is correct; the defect is specifically the `getFastImageSequence()` runtime loading path.
- Other miniapp code already implements animation playback locally: `GridAnimationPreview.jsx` uses browser `Image` loading and a component-owned timer, so a native React/browser implementation matches established project patterns.
- `cdn.js` intentionally routes most large third-party bundles through `srcFileUrl`; fast-image-sequence is uniquely unable to use the existing fetch-to-Blob loader because its entry imports a relative chunk. Fixing only the player component avoids changing shared vendor loading behavior for unrelated image tools.
- `GridAnimationPreview.AnimCard` provides the exact established native pattern needed here: component-owned `setInterval`, frame-index state, `<img src>` rendering, and cleanup with `clearInterval`.
- Host `srcFileUrl()` always appends `getToken() || ''`; the reported URL proves this runtime has no token. Changing auth behavior is broader than this player and would still leave native dynamic import dependent on server MIME correctness.
- Chosen fix: make `FrameSequencePlayer` use the same native timer/image pattern, remove its `getFastImageSequence` import, and leave shared CDN loaders untouched.
- The handoff documents and `src/handoff.md` still describe the removed dynamic-import path; they need targeted updates so future changes do not restore the broken loader.
- The old vendored distribution can remain as inert legacy files for now; deleting large unrelated assets is unnecessary for runtime correctness and would broaden the change.
- Focused verification passed: 7 tests, Babel transforms for the player/dialog/shared loader, no runtime player loader references, and `git diff --check`.

## Research Notes: sprite preview refresh loop
- `GroupSheetPreview` correctly depends on `[depKey, onCompose]`, but `onCompose` is `composeSheetDataUrl` from the parent.
- `VideoEditorDialog` creates `frames` with `.filter(Boolean)` during every render. This recreates `groupFrames`, then `composeSheetDataUrl`, then the `onCompose` prop.
- `composeSheetDataUrl` changes `sheetBusyId`; those parent renders retrigger `GroupSheetPreview`, creating an ongoing compose/busy cycle.
- Memoizing `videos`, `frames`, and `animGroups` from their corresponding `data` array references preserves expected updates while keeping callbacks stable during local busy/player renders.
- Implemented the memoization in `VideoEditorDialog`; source data reference changes still trigger updates, while `sheetBusyId` and child playback renders no longer recreate compose callbacks.
- Verification passed: 8 focused tests, Babel transforms for player/dialog, and `git diff --check`.

## Research Notes: persistent previews, lossless frames, and crop selection
- The main preview uses a JSX conditional, so switching `previewTab` unmounts either `<video>` or `FrameSequencePlayer`; both must remain mounted and be hidden instead.
- The extraction UI defaults `maxWidth` to 320 and passes it to ffmpeg, so frames are scaled down by default.
- The ffmpeg plugin writes `frame-%04d.jpg` with `-q:v 2`; this is lossy JPEG even when no scaling is requested.
- Both template and runtime plugin copies currently match and must be edited identically.
- Crop should be expressed as source-video pixel coordinates and inserted into the same ffmpeg filter chain as sampling and optional scale.
- The only miniapp default outside the dialog is `canvas-constants.js`, also set to `maxWidth: 320`; both defaults must change.
- Existing pointer-selection code uses `getBoundingClientRect()` plus `setPointerCapture`, which is suitable for a lightweight normalized video overlay without adding Fabric.
- Store crop selection as normalized `{x,y,width,height}` in `data.params.cropRegion`; this remains correct across player resizing and lets ffmpeg derive source-pixel coordinates from `iw/ih`.
- Keep both preview DOM trees mounted with visibility classes. Pause the hidden video/frame timer without resetting current time/frame, then resume from the same state when shown.
- Frontend crop helpers now normalize/clamp coordinates and reject selections smaller than 1% on either axis.
- The ffmpeg filter builder applies sampling first, then crop, then optional scale; all modes including the single-frame seek path share the same transform list.
- Frame files now use `.png` and no `-q:v`, while the miniapp no longer sends `maxWidth`; this preserves source resolution and uses lossless encoding.
- Preliminary verification passed: 11 tests, Babel transforms, Node syntax checks, and exact equality of both plugin copies.
- A real ffmpeg smoke test generated a 160x120 source, applied `fps=2` plus the normalized 50% crop expression, and produced a valid 80x60 RGB PNG.
- Crop mode pauses the video and hides native controls while the pointer overlay is active; disabling crop restores controls without remounting the video element.
- Final verification passed: 15 tests, frontend/backend syntax checks, identical plugin copies, real ffmpeg crop output, and `git diff --check`.

## Research Notes: video editor interaction follow-up
- The crop-overwrite root cause is the shared global `data.frames`: re-extracting another crop replaces this array, and every group derives playback from it. A `cropRegion` snapshot alone would not preserve the old pixels; new groups must snapshot their source frame URLs and old groups must retain a global-frame fallback.
- Existing unrelated dirty-worktree changes must remain intact; edits will stay within the video editor/player, focused tests, and handoff/planning notes.
- `addGroup` currently stores only `startFrame/endFrame/fps`, so every group implicitly shares the current extracted `data.frames`; no crop snapshot exists on the group.
- `FrameSequencePlayer` always advances with modulo arithmetic, so playback always loops and there is no persisted/local loop toggle.
- The frame-list header currently contains only instructional copy; it can own clamped numeric boundary inputs and the quick-add icon without introducing another panel.
- New groups currently write `frames: []` and `groupFrames()` always slices global `frames`, which directly explains why re-extraction changes all existing group previews.
- The implemented compatibility rule is `group.frames` when non-empty, otherwise current global `frames`; this fixes new groups without invalidating historical groups that stored an empty compatibility field.
- Numeric header inputs use `resolveFrameSelection`, so persisted values and direct edits share the same integer/clamping contract.
- Final review found the first loop implementation called `setPlaying` inside a `setCurrentFrame` updater. Move stop behavior to a dedicated effect so the frame updater remains pure.
- The video-editor handoff still describes animation-group `frames` as unused compatibility data and must be updated to the new snapshot/fallback contract.
- Final loop implementation uses `currentFrameRef` inside the interval, keeping React state updaters pure and avoiding a race between sequence reset and non-loop end detection.
