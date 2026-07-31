# Reskin Generated Image Gallery

## Goal
Show and reuse the generated reskin composite until the user deletes it.

## Phases
- [x] Inspect pipeline, ReskinPanel, and host gallery API.
- [x] Add pipeline reuse/callback contract and regression tests.
- [x] Add Gallery preview and delete control to ReskinPanel.
- [x] Run focused and existing validations.
- [x] Fix SAM image-to-canvas conversion and add regression coverage.
- [x] Fix repeated Pixi atlas texture replacement and add coverage.
- [x] Make the form scroll while preserving log height.
- [x] Re-run all related validations.

## Decisions
- Cache is scoped to the mounted ReskinPanel session.
- Cache remains valid until explicit deletion, per user requirement.
- Use host `openMediaGallery` for full-size preview.

## Errors Encountered
- SAM succeeds remotely but local erosion receives an image element: `canvas.getContext is not a function`.
- Repeated atlas preview replacement throws `Resource can be set only once`.
- One read-only `rg` check had a PowerShell quote terminator error; replaced with direct line reads.
- A second combined `rg` repeated the quote error; final checks were split into independent commands.

---

# Spine Editor Node Persistence

## Goal
Persist reskin generated images and serializable form state in the current `spineEditor` node so reopening restores them.

## Phases
- [x] Read handoff and identify current persistence boundary.
- [x] Build a focused regression signal and compare other dialog nodes.
- [x] Implement the smallest node/dialog/panel data contract.
- [x] Run focused tests and static validation.

## Constraints
- Preserve unrelated worktree changes.
- Do not use a real browser.

## Errors Encountered
- CodeGraph did not surface the Spine persistence symbols; continued with targeted source search.
- A final parallel review used the repository root for the mini-app handoff path and failed; rerun from the mini-app directory.
- A final source read repeated the repository-root relative-path mistake; switched the last checks to absolute paths.

---

# Shape-intersection Canvas Type Fix

## Goal
Fix `bg_components` reskin segmentation when the original atlas is loaded as an image element instead of a canvas.

## Phases
- [x] Restore context and locate the failing boundary with CodeGraph.
- [x] Reproduce with a focused regression test and rank hypotheses.
- [x] Normalize the shape-intersection input with the smallest change.
- [x] Run focused and related validation.

## Constraints
- Preserve node-persistence changes and unrelated worktree changes.
- Do not use a real browser.

## Errors Encountered
- Optional search for an existing EditImageNode/FileUpload source-contract test returned no matches; adding a focused adjacent test instead.

## Follow-up: Thumbnail Action Layout

- [x] Move Edit Image thumbnail actions to a bottom inline icon group.
- [x] Show the action group only on thumbnail hover/focus.
- [x] Re-run focused tests and JSX validation.

## Follow-up: Mini-app Hover CSS Compatibility

- [x] Replace ungenerated Tailwind hover variants with stable scoped CSS.
- [x] Cover hover/focus visibility and pointer interaction in the regression contract.
- [x] Re-run focused validation.

## Follow-up: Clipped Bottom Actions

- [x] Move all action positioning and sizing into scoped CSS.
- [x] Add runtime computed-style diagnostics for manual verification.
- [x] Re-run focused validation.

## Follow-up: Centered And Reused Bottom Actions

- [x] Center the thumbnail action group horizontally.
- [x] Reuse the bottom hover action layout for mask thumbnails without edit.
- [x] Remove confirmed runtime diagnostics and re-run validation.

## Follow-up: Upload Trigger In Thumbnail Grid

- [x] Move the upload trigger into the thumbnail grid as the first item.
- [x] Preserve upload/drop/max/sorting behavior and compact the trigger UI.
- [x] Add ordering coverage and run focused validation.

---

# Shared FileUpload Compact Dropzone

## Goal
Keep the full shared FileUpload dropzone only while empty; after the first file, render a compact upload row after the file items.

## Phases
- [x] Trace GIF node usage and shared FileUpload/hideDropzone contracts.
- [ ] Implement empty/full dropzone mode switching in the shared component.
- [ ] Add focused regression coverage.
- [ ] Run Web lint/tests and review the diff.

## Constraints
- Preserve existing file acceptance, maxFiles, sorting, removal, and internal image-drop behavior.
- `hideDropzone` must hide both full and compact upload entries.
- This is a host-layer change and requires Web restart.

## Errors Encountered
- Direct `node --test` cannot load Web `.ts` test files because this package has no TypeScript test loader; converted the new source-contract test to `.js` and excluded the existing `.ts` helper test from that command.

---

# Output Thumbnail Actions Layout

## Goal
Move node output thumbnail asset/delete actions into one hover-only, bottom-centered inline action group.

## Phases
- [x] Locate the shared output thumbnail action renderer.
- [x] Implement mini-app-safe scoped positioning/visibility CSS.
- [x] Add focused source-contract coverage.
- [x] Leave validation pending because the user interrupted automatic checks.

## Constraints
- Preserve gallery opening, asset saving, image deletion, and output sorting.
- Keep actions inside the image bounds and avoid behavior-critical Tailwind hover/position utilities.

## Errors Encountered
None.

---

# Shared FileUpload Gallery Preview

## Goal
Show the shared FileUpload delete action only on item hover/focus and open image previews in MediaGallery when their thumbnails are clicked.

## Phases
- [x] Confirm the host Gallery API and current file-row structure.
- [x] Implement image-only gallery mapping and thumbnail interaction.
- [x] Make delete visibility hover/focus-only.
- [x] Update source-contract coverage; leave automatic validation pending per user preference.

## Constraints
- Non-image file cards remain unchanged.
- Sorting and cross-node image dragging remain available from the file row.
- Gallery indices include only image files with resolvable previews.

## Errors Encountered
None.

## Follow-up: Thumbnail Preview Overlay

- [x] Add a thumbnail-local translucent hover overlay.
- [x] Center an eye icon without affecting row hover/delete behavior.
- [x] Update source-contract coverage; leave automatic validation pending.

---

# Upstream Output History Synchronization

## Goal
Switching an upstream node's output history immediately replaces every connected downstream input without retaining the previous derived input.

## Phases
- [x] Trace output-history selection and downstream input derivation.
- [x] Add a focused regression test reproducing stale downstream input.
- [x] Implement the smallest fix at the shared synchronization boundary.
- [x] Run focused/static validation and review the diff.

## Constraints
- Preserve unrelated worktree changes.
- Do not use a real browser.

## Errors Encountered
- Recursive AGENTS.md discovery timed out after traversing node_modules; reran targeted reads for the known root instructions and handoff.
- A combined search script failed in the tool orchestration layer because of regex string escaping; split it into plain PowerShell commands.
- A combined read returned exit code 1 because one optional test search had no matches; replaced it with deterministic file reads.
- The first Node import probe had malformed orchestration quoting and did not run; the corrected probe confirmed Node 22 cannot resolve `input-images.js`'s extensionless `./constants` import, even with the legacy resolution flag.
- Follow-up combined read stopped because a PowerShell `Select-String` pattern was misquoted; removed the optional config search and split deterministic source reads.

## Follow-up: Repeated History Switching

- [x] Reproduce the `1 image -> 2 images -> 1 image` residual across repeated switches.
- [x] Instrument derivation and input-list state boundaries with `[DEBUG-history-sync]`.
- [x] Test ranked hypotheses and identify the exact state owner retaining the extra image.
- [x] Add a regression test, implement the minimal fix, and remove debug instrumentation.
- [x] Run focused and related validation.

---

# Group Drag Position Preview

## Goal
Show a dashed target-position outline while moving a group on the game asset canvas, matching the workflow editor interaction.

## Phases
- [x] Compare the workflow editor preview and the mini-app group drag state.
- [x] Implement the smallest preview-state and overlay change.
- [x] Run focused static/tests validation and review the diff.

## Constraints
- Preserve existing group move/drop behavior and unrelated worktree changes.
- Do not use a real browser unless requested.

## Errors Encountered
- Mini-app directory has no `package.json`; the combined pre-edit inspection stopped on that missing optional file. Validation commands will be resolved from the workspace package files instead.
- Combined validation inspection returned exit 1 because the optional test-name search found no `GroupOverlays` test; the diff/check itself was clean. Subsequent checks are split into deterministic commands.
- First esbuild syntax command combined `--external:*` without `--bundle`; esbuild rejected the option combination before compilation. Retrying with bundling enabled.
- `procm-mcp` had no running process and the workspace has no `procm-commands.json`, so there was no configured persistent service to restart.

---

# Node Image Drag To File Upload

## Goal
Allow images dragged from a node's input/output previews to populate another node's `fileupload` field.

## Phases
- [x] Build a deterministic repro at the real drag payload/drop parsing seam.
- [x] Rank and test hypotheses across source drag and target fileupload handlers.
- [x] Add a regression test, apply the minimal fix, and remove instrumentation.
- [x] Run focused validation, review the diff, and check persistent service state.

## Constraints
- Preserve local-file upload/drop, canvas node dragging, and edge connection behavior.
- Preserve unrelated worktree changes; do not use a real browser unless the source-level seam is insufficient.

## Errors Encountered
- The first combined `rg` lookup returned exit 1 without output, likely from PowerShell regex quoting or one no-match branch. Replaced it with simple literal searches in separate commands.
- Import-classification regex hit the same PowerShell quoting issue. Replaced it with literal `FileUpload` searches scoped to import lines via `Select-String`.
- Expected red regression test failed with `Cannot find module './file-upload-drop'`, confirming the helper/contract did not exist before the fix.
- Web TypeScript validation found the new dropped URL file-like object was not assignable to the default `File` generic. Resolved by creating a zero-byte `File` carrying the existing URL fields; unrelated prompt-editor errors remain pre-existing.
- Final combined test command used an incorrect `../../server` path from `packages/web`; MIME tests passed but the list-key test file was not found. Rerunning that test from the mini-app directory.
- `procm-mcp` had no running process and the workspace still has no `procm-commands.json`, so no persistent service could be restarted.

## Follow-up: Drop Event Propagation

- [x] Reproduce the forbidden-cursor/no-op split at the event propagation seam.
- [x] Instrument source, capture, and target stages with `[DEBUG-image-drop]`.
- [x] Move internal URL handling ahead of react-dropzone interception and retest.
- [x] Validate, review, and leave actionable logs for manual verification.
- [ ] User verifies input/output drops in the running browser and reports the resulting stage chain if still failing.

### Errors Encountered
- Broad pnpm-store `rg` filtered through `Select-String` returned no output. Resolve the installed react-dropzone package directory first, then inspect it directly.
- Initial debug helper typed writers as `setData` only, so TypeScript rejected reading optional debug fields. Expanded the structural writer type to include optional DataTransfer debug properties.
- Combined same-instance bypass patch mixed shared/local FileUpload context in one file hunk and did not apply. Split by file with exact contexts.
- Final `procm-mcp` process check could not connect to `127.0.0.1:7331`; no persistent service restart was possible.

---

# Edit Image Thumbnail Mask Entry

## Goal
Add an edit action to each Edit Image node upload thumbnail that opens the existing mask-painting dialog and stores the painted output as that node's mask image.

## Phases
- [x] Inspect EditImageNode, mask dialog, and node persistence contracts.
- [x] Implement the smallest thumbnail action/dialog wiring.
- [x] Add or update focused regression coverage.
- [x] Run focused syntax/tests validation and review the diff.

## Constraints
- Reuse the existing mask-painting implementation and existing node data shape.
- Preserve upload, sorting, deletion, upstream inputs, and generation behavior.
- Keep changes inside the game-asset-canvas mini-app.

## Errors Encountered
None.

---

# Text Node And Text Product Routing

## Goal
Add a Markdown-backed text node and make text products, including reverse-prompt results, connectable or draggable into compatible node text parameters.

### Phase 1: Text Node And Routing
- **Status:** complete

## Phases
- [x] Trace node schemas, reverse-prompt execution, media derivation, and image drag-to-input behavior.
- [x] Define a shared target-field resolver/chooser for image and text products.
- [x] Implement text node registration, Markdown editing/display, text derivation, and reverse-prompt output.
- [x] Add focused regression coverage and update project documentation.
- [x] Run proportional validation and review all overlapping diffs.

## Constraints
- Preserve existing worktree changes and current image drag behavior.
- Reuse `packages/web/src/components/common/editors/markdown-editor.tsx` through the mini-app host export boundary.
- Mini-app changes refresh directly; host export/allowlist changes require a web restart.
- Do not use a real browser unless source-level validation is insufficient.

## Errors Encountered
- Initial relative lookup for `.agents/skills/planning-with-files/SKILL.md` failed because the skill lives at `/Users/Zhuanz/.agents/skills/planning-with-files/SKILL.md`; switched to the catalog-provided absolute path.
- Expected red tests failed because the new connection-target and text-derivation exports did not exist.
- First implementation patch did not apply because the `NODE_META` context differed from the assumed declaration; no partial code changes were made, and the patch was split against exact source context.
- First combined UI integration patch did not apply because `useDecoratedNodes` had a shorter dependency list than expected; no partial changes were made, and subsequent edits were split by file boundary.
- Final behavior review found EditImageNode renders/executes `promptHtml` while its schema exposes `prompt`; added a derived plain-text-to-editor-HTML bridge without persisting the reference.
- Completion checker initially reported `0/0 phases` because the existing long-term plan uses custom headings; added one checker-compatible completed phase for this task.
- First final status command used repository-relative paths while already inside the mini-app directory, producing a harmless path warning; reran from the repository root.
