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
