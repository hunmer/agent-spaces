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
