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
