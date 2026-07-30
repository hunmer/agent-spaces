# Findings

- `runReskin` currently generates and consumes the edited composite in one call.
- `workflowRedraw` returns `{ url, durationMs }`; the UI cannot observe the URL before segmentation.
- `openMediaGallery([{ src, type: 'image' }], 0)` is exported by `@agent-spaces/ui` and already used in this mini-app.
- `ReskinPanel` catches pipeline failures, so a generated-image callback must run before segmentation to preserve the image after later failures.
- Generation controls should be disabled while a cached image exists, preventing prompt/method/model/size changes from silently mismatching the reused image.
- SAM loads successful plugin output as `HTMLImageElement`; `erodeAlpha` accepts only `HTMLCanvasElement`. Convert every successful mask through `drawToCanvas` before optional erosion.
- Pixi 7 `BaseTexture.setResource` throws whenever a resource is already bound. Hot preview must update the existing image resource source instead.
- Form content currently has intrinsic height while logs consume remaining flex height; Gallery therefore shrinks logs. Form must become the scrollable flex region and logs must be fixed-height.

## Spine Editor Node Persistence

- The handoff documents node persistence only for `output`, `exportedPose`, and `reskinAssets`.
- The existing generated-image cache is explicitly scoped to the mounted `ReskinPanel` session, so unmounting the dialog necessarily loses it.
- Other editor dialogs use an `initialData` + `onDataChange` contract and persist a serializable snapshot on the node.
- Persisted form fields should be `prompt`, `skinName`, `method`, `segMethod`, `size`, `erosion`, `processingModel`, `slotMode`, and `selectedSlot`; `generatedImageUrl` is also persisted.
- Runtime/derived state (`running`, `logs`, `history`, `slots`, `activeSkin`) must not be stored on the node.
- The generated image must carry an asset signature (`skel|atlas|png`) and be cleared when the loaded Spine resource changes, matching other dialog nodes' input-signature strategy.
- There is no React component test harness in this mini-app; the focused regression seam will cover snapshot normalization/restoration and asset-signature invalidation, while Babel/static checks cover prop wiring.
- `useCanvasState.updateNodeData` shallow-merges top-level node data, so one complete `reskinEditorData` object per change is safe; splitting nested partial updates would lose sibling fields.
- The three Spine source files targeted by this fix had no pre-existing worktree modifications.
- Confirmed root cause: `ReskinPanel` state was local-only and neither `SpineEditorDialog` nor `SpineEditorNode` exposed a persistence contract.
- Library-selected assets are now stored inside the same snapshot so their generated image remains compatible after reopening even when the node has no uploaded files.

## Shape-intersection Canvas Type Fix

- CodeGraph shows `buildOriginalSilhouettes` requires `sourceCanvas.getContext('2d')`.
- `runReskin` loads the original atlas through `loadImage`, which returns an image element; the `bg_components` call site must be checked for a missing image-to-canvas conversion.
- Confirmed hypothesis 1: atlas mode passes `atlasSheetImg` (`HTMLImageElement`) directly to `buildOriginalSilhouettes`.
- Confirmed hypothesis 2: exploded mode leaves `segmentSource` as `HTMLImageElement` when workflow output dimensions already match, so both silhouette and intersection readers can fail.
- The smallest complete boundary is `shapeSegmenter`: normalize any CanvasImageSource to a readable canvas before calling `getImageData`.
- Focused tests reproduced both exact TypeErrors before the fix and pass after normalizing at the shared boundary.
- Root cause was hypotheses 1 and 2; generated-image caching and cross-realm detection were not involved in the reported failure.
