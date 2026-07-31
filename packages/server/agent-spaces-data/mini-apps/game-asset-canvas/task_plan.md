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
None.

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
