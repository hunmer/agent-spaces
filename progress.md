# Progress: Canvas drag edge auto-pan

## 2026-08-04
- Initialized task planning files.
- Traced `ImageResult.jsx`: it publishes drag payloads through the shared canvas MIME helper.
- Decided to scope edge auto-pan to canvas-level drag events.
- Confirmed the outer canvas wrapper owns all relevant native drag events and React Flow state.
- Confirmed React Flow 12.10.2 supports relative `panBy` calls.
- Chose shared-image/external-file MIME filtering, a 72px edge zone, and proximity-scaled movement.
- Added the auto-pan hook, pure delta helper, canvas wrapper wiring, and focused tests.
- First test command failed because importing `canvas-constants.js` reached an existing extensionless ESM import. Adjusting the pure helper to accept the MIME constant from its caller.
- Pure helper tests now pass (3/3), and Babel syntax checks pass for Canvas, the hook, and the utility.
- Verified React Flow 12.10.2 exposes `panBy` as a closure-backed store function, so passing it into the hook is safe.
- Documented the interaction contract in `src/handoff.md` and `src/CLAUDE.md`.
- Final verification passed: 4 drag-related tests, Babel transforms, relative-import checks, and `git diff --check`.
- Drag edge auto-pan task is complete; no browser/server restart was performed because project guidance says `src/**` refreshes directly and browser testing was not requested.
- New request received: retain selected styling for minimal nodes at low zoom and center pasted nodes in the current viewport.
- Existing drag auto-pan work overlaps `Canvas.jsx`; it will be preserved while the new paths are traced.
- Located compact renderers in `NodeShell`, `ImageDisplayNode`, and `NoteNode`.
- Located fixed-offset node paste in `useSelectionClipboard`/`clipboard.js`; decided to center the copied bounding box while preserving relative positions.
- Added compact selected rings to standard, image display, and note node compact renderers.
- Added viewport-targeted paste placement based on the copied nodes' bounding box; explicit offsets remain authoritative for clone operations.
- Wired `Canvas.jsx` viewport Flow center into `useSelectionClipboard` and added clipboard placement tests.
- Added compact renderer regression coverage for standard, image display, and note nodes.
- Verification complete: 8 focused tests passed, six touched modules compiled with esbuild, and `git diff --check` passed.
