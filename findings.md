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
