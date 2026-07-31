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

## Upstream Output History Synchronization

- Handoff identifies `computeInputImages(nodes, edges)` and `computeInputVideos(nodes, edges)` as the shared upstream-to-downstream derivation boundary.
- Existing unrelated user changes are limited to `configs/panel-layout.json` and `manifest.json`; they must remain untouched.
- `Canvas.handleSwitchVersion` replaces the selected upstream node's `data.output` with the version snapshot through `updateNodeData`, so a node-state change should invalidate `computeInputImages`/`computeInputVideos` memos.
- In multi-hop image/video chains, passthrough sources currently prefer persisted `data.images`/`data.videos` over the fresh value in `derivedByNode`; persisted values can therefore retain a previous upstream version and override the newly derived version for later downstream nodes.
- Receiver components read `data.images` from decorated props; their persistent `upstreamOrder` is only an ordering hint and `orderUpstream` filters stale URLs against the current raw list.
- Focused red tests reproduced the defect for both image and video multi-hop chains: downstream received `old.png`/`old.mp4` after the source output had switched to `new.png`/`new.mp4`.
- Fix: passthrough nodes use `derivedByNode` whenever the node has a current derived value, including `[]`; only unconnected passthrough nodes fall back to persisted media. `videoEditor` merges its own videos with the current derived videos.

## Repeated History Switching

- The actual saved canvas contains a two-image history output where both entries have the exact same URL.
- `UpstreamImageList` rendered items with `key={url}`. Duplicate outputs therefore created duplicate React keys; repeated `1 -> 2 -> 1` rendering could retain an extra DOM item even though derived data was correct.
- Targeted instrumentation showed `computeInputImages` produced counts `1, 2, 1, 2, 1` exactly, ruling out fixed-point accumulation and version snapshot mutation.
- The regression seam is unique occurrence-based media keys plus a repeated-switch derivation test. Temporary `[DEBUG-history-sync]` logs were removed after confirming the boundary.

## Group Drag Position Preview

- `GroupOverlays` currently receives `dropTargetGroupId`, but that state highlights a group as a node drop target; it does not represent the dragged group's future bounds.
- The new preview should reuse the existing group move coordinate conversion and remain visual-only until the existing drop handler commits the move.
- Shared `WorkflowGroupOverlay` already implements the full preview callback: it emits `{ groupId, bounds, delta }` on pointer down/move (RAF-throttled), clears it on pointer up/cancel, and only commits `onMove` at pointer up.
- The mini-app currently omits only the `onDragPreviewChange` prop, so the missing behavior is in preview state/render wiring rather than drag mechanics.
- The workflow canvas stores that callback payload as `dragPreview` and renders an absolute, pointer-transparent rectangle inside the same `ViewportPortal`, at `bounds + delta` with unchanged width/height.
- The workflow renderer is web-local rather than exported from `@agent-spaces/ui`; reproducing its small visual element inside mini-app `GroupOverlays` avoids broad package/API changes. The requested border style is dashed.
- Implemented the same state/render contract locally: shared drag mechanics supply flow-space coordinates, while the mini-app only owns the transient visual state.
- There is no component-level `GroupOverlays` test harness in this mini-app. Proportional validation is JSX compilation, focused source/diff checks, and existing group-helper tests only if they cover the unchanged move semantics.
- Validation passed: esbuild compiled the JSX, the existing group helper test passed 1/1, and `git diff --check` was clean. `var(--primary)` is already used by another mini-app canvas component.
- Final diff review confirmed the change is isolated to preview state/visual rendering; `Canvas.jsx`, group move commits, and drop-target behavior are unchanged.

## Node Image Drag To File Upload

- Reported symptom: dragging an image displayed as a node input or output onto a node `fileupload` control produces no visible response.
- Initial acceptance boundary: internal image drags must be translated into the same node-data update contract used by successful uploads, without breaking native `DataTransfer.files` handling.
- CodeGraph did not index useful JSX event-handler matches for this interaction, so targeted source searches are required.
- Relevant source candidates are `FileUpload.jsx` on the target side and `ImageResult.jsx`, `UpstreamImageList.jsx`, `ImageDisplayNode.jsx`, and `ImageHoverCard.jsx` on the internal image drag side. `Canvas.jsx`/`useNodeCrud.js` may own canvas-level routing or updates.
- Deterministic source-level repro established: `FileUpload.onDrop` only calls `handleFiles(e.dataTransfer.files)`, and `handleFiles` returns when the list has no image `File` objects.
- `ImageResult` and `UpstreamImageList` use drag only for sorting and write an index to `text/plain`; their nested `<img>` elements are explicitly non-draggable. No image URL reaches `FileUpload` through this path.
- The project already has the correct reusable URL payload protocol: `CANVAS_DROP_MIME = application/x-canvas-drop-images` with `{ urls: string[] }`. History/assets produce it and canvas drop consumes it.
- Canvas-level drop is not the root cause: it explicitly returns for drops inside `.react-flow__node`, and `FileUpload` already stops propagation. Hypothesis 3 is rejected.
- Internal image sources do not write `CANVAS_DROP_MIME`; sortable sources only write `IMAGE_REORDER_MIME`, which intentionally suppresses canvas node creation. Hypotheses 1 and 2 remain primary.
- `ImageDisplayNode` is a special case: its image body is deliberately the ReactFlow node drag handle and its `<img>` is non-draggable, so making that surface an HTML image drag would conflict with moving the node. The fix should target explicit input/output thumbnails, not the full image-display node body.
- FileUpload usages are heterogeneous: the mini-app has a local image-specific `components/FileUpload.jsx`, while several node files appear to use the shared `@agent-spaces/ui` `FileUpload` API (`maxFiles`, `accept`, `sortable`). Imports must be classified before selecting the target boundary.
- Import classification confirms nearly all canvas node upload fields use shared `packages/web/src/components/ui/file-upload.tsx`; only `EditImageNode` and `NodeFormDialog` use the local image-specific upload component.
- A complete fix therefore needs the shared FileUpload to consume the existing URL MIME, plus explicit node input/output thumbnail sources to produce it. Local FileUpload should also consume/produce it for behavioral consistency.
- Shared FileUpload already models persisted uploads as file-like objects containing `url/httpPath`; the dominant node `handleFilesChange` implementations reuse those URLs without calling `uploadFile`. Hypothesis 4 is rejected: internal URLs should be appended as already-uploaded file-like entries.
- Shared FileUpload's react-dropzone callback only receives native `File[]`; it needs a root drop handler for `CANVAS_DROP_MIME`. Its rendered image file rows can also produce that MIME, covering dragged node input thumbnails.
- Output coverage must include both `ImageResult` grid and preview branches. Input coverage includes shared/local FileUpload rows and `UpstreamImageList`; the full `ImageDisplayNode` remains excluded due its move-handle contract.
- Existing Web tests use `node:test` with pure adjacent modules. The correct regression seam is a new UI-level drag payload helper, tested independently from React/DOM, then used by shared FileUpload and mini-app image sources.
- Root cause ranking resolved: hypotheses 1 and 2 are both true (missing URL protocol and non-draggable thumbnails); hypotheses 3 and 4 are false.
- Implementation uses instance-local sorting state to distinguish a reorder dropped back onto its own FileUpload from an internal image dropped onto a different FileUpload, preventing self-drop duplication while allowing cross-node copy.
- Focused validation passed: MIME tests 2/2, changed Web files ESLint clean, three changed mini-app JSX entries compiled, and the existing occurrence-key test passed 1/1.
- After the typed File fix, full Web TypeScript no longer reports any changed file; it remains blocked only by four existing `prompt-text-editor.tsx` errors. MIME tests remain 2/2 and ESLint remains clean.
- Final interaction review added synchronous per-instance drag refs: self-drops are consumed without duplicating an image, while a different FileUpload instance has no source ref and accepts the URL copy.
- Final Web ESLint is clean with no warnings after consolidating URL drop handling at the outer FileUpload boundary; MIME tests remain 2/2.
- Final diff review confirmed scope and changed sortable image drags from `move` to `copyMove`, preserving reorder while explicitly allowing cross-node copy.
- Final validation: MIME tests 2/2, list-key test 1/1, Web ESLint clean, changed mini-app JSX compiled, and `git diff --check` clean. Full Web TypeScript is blocked only by four unrelated prompt-editor errors.
- Follow-up runtime evidence invalidates the prior source-level acceptance signal: input drag is not being accepted by the target, while output drop is accepted visually but the URL callback is not reached. Event propagation through react-dropzone is now the primary suspect; sorting remains a secondary interaction constraint.
- CodeGraph confirms output sources write the MIME before sorting metadata. The remaining unknown is react-dropzone DOM event ordering; inspect its installed handler composition before changing behavior.
- Instrumentation is intentionally retained for the user's next manual run because the previous source-level test did not reproduce the actual DOM propagation failure.
- User-provided logs prove both local input and output sources write the expected MIME; no target-stage log appears. This rejects sorting-payload conflict and localizes the failure before existing target bubble handlers.
- Exact code/runtime match found: canvas forces `dropEffect='move'`, which conflicts with non-sort input `effectAllowed='copy'` and produces the forbidden cursor. Sortable output permits `copyMove` but writes `IMAGE_REORDER_MIME`, causing canvas `handleDrop` to return before reading the valid image payload.
- The sorting protocol is therefore directly responsible for output no-op; the input cursor is a copy/move effect mismatch. FileUpload capture handling is still required for drops whose destination is a node upload control.
- Fix preserves in-node sorting: drops inside a ReactFlow node still return at the node boundary; only a sortable image dragged outside its list with a valid image payload can create/copy an image.
- Capture handlers explicitly skip drags originating from the same FileUpload instance, so original item-level sorting still receives dragover/drop; cross-instance drags are consumed in capture.
- Automated validation after the runtime-informed fix passed: MIME tests 2/2, Web ESLint clean, four mini-app entries compiled, and `git diff --check` clean. Browser verification remains intentionally pending with logs retained.

## Edit Image Thumbnail Mask Entry

- The request targets the Edit Image node's uploaded-image thumbnails and should reuse the project's existing mask-painting dialog.
- Acceptance requires the selected thumbnail image to seed the dialog and the dialog output to persist through the node's existing mask field.
- Project conventions require mini-app-local JSX, icons from `@agent-spaces/ui`, and interaction controls inside `nodrag nopan nowheel` regions.
- `editImage` already declares separate persisted `images` and `mask` inputs; the new action should write the existing `mask` field rather than introduce node data.
- The existing reusable implementation appears under the `maskPaint` node path; targeted component reads are required to identify its dialog callback contract.
- `MaskPaintDialog` is directly reusable: it accepts `inputImages`, optional persisted `initialData`, calls `onSave(urls)` after uploading exported masks, and closes through `onClose`.
- `EditImageNode.setMaskImage` already persists the first URL into `data.params.mask`; no workflow or execution changes are needed.
- The local `components/FileUpload.jsx` owns the exact uploaded/reference/connected thumbnail grid used by Edit Image, so an optional per-thumbnail action is the narrowest reusable UI boundary.
- Implemented `FileUpload.onEditItem` for every rendered input thumbnail; the edit action occupies the top-right position and existing remove controls shift left when both are present.
- Edit Image persists dialog operations in `data.editMaskPaintData` and reuses `setMaskImage` so the exported URL immediately becomes `params.mask`.

## Shared FileUpload Compact Dropzone

- GIF split/merge are rendered through `ImageProcessNode`, which imports the shared `@agent-spaces/ui FileUpload` from `packages/web/src/components/ui/file-upload.tsx`.
- The shared component currently renders a large dropzone before a vertical file-card list regardless of whether files already exist.
- `UploadSection` injects `hideDropzone=true` when a node upload section is collapsed; the compact entry must honor the same flag.
- Existing `maxFiles` behavior should remain unchanged in this layout-only task, including retaining an upload entry after a single-file list exists.

## Output Thumbnail Actions Layout

- `ImageResult` owned two separate negative-offset controls: asset saving at the top-right and image deletion at the bottom-right.
- Both controls now share a scoped `.game-asset-output-actions` container positioned inside the image at bottom center, with hover/focus visibility independent of Tailwind-generated variants.

## Shared FileUpload Gallery Preview

- The host-standard viewer is `openMediaGallery(items, startIndex)` from `components/ui/media-gallery.tsx`.
- Shared FileUpload can contain non-image files, so Gallery entries and indices must be derived only from items whose `getFilePreview` returns a URL.
- Because `file-upload.tsx` is host source included in Tailwind scanning, `group-hover` and `group-focus-within` are valid for delete visibility here.

## Text Node And Text Product Routing

- User requires a new Markdown text node using the host `markdown-editor.tsx` for both editing and display.
- Text products must support normal edge propagation and drag-to-input assignment; a single compatible text field is selected automatically, while multiple compatible fields require a chooser dialog.
- The existing image target-selection implementation must be generalized instead of duplicated for text.
- Reverse-prompt results must move from form-local display into the node output model so downstream nodes can consume them.
- The worktree already contains unrelated and overlapping edits; all changes must be incremental against current files.
- CodeGraph located `utils/connection-targets.js` as the existing image target-field abstraction; edges carry target metadata and `computeInputImages` derives both aggregate images and per-fileupload values.
- `computeInputImages` currently treats `imageDisplay` as the only passthrough output node and treats `promptReverse` as an image receiver.
- `MarkdownEditor` is a default Web component taking `{ contentMarkdown, onChange, theme }`; it must be exposed through `ui-exports.ts` and the renderer mapping before mini-app code can import it.
- Current worktree already exports `MarkdownEditor` from `packages/web/src/lib/ui-exports.ts`; the renderer resolves the whole export object for `@agent-spaces/ui`, so no additional host edit is required for this task, but the existing host change still requires Web restart to take effect.
- Existing `Canvas.onConnect` always calls `getFileUploadTargets(targetType)` and stores `edge.data.inputTarget`; `ConnectionTargetDialog` is image-specific only in copy/icon defaults and can become a generic target chooser.
- Text-capable target schemas currently exist for text-to-image (`prompt`, `fileName`), edit-image (`prompt`, `fileName`), text-to-voice (`prompt`, `voiceId`), video-generator (`prompt`), and workflow-runner (`workflowId`, `inputText`, `urlFieldPath`).
- Reference semantics require derived text to live separately from persisted `data.params`: injecting directly into params would cause component spread-updates to persist stale upstream content. Use `data.textInputValues`, merge only for rendering/execution, and keep setters based on stored params.
- Reverse-prompt execution already persists `data.output.text`; the UI-only gap is extracting its current inline result block into a reusable text-product presentation and routing that output downstream.
- `NodeShell` already renders `NodeOutput` outside the resizable/scrollable form body. Extending `NodeOutput` with a text branch places reverse-prompt text in the same product area as generated images without changing execution storage.
- Connection creation also occurs in `useNodeCrud.handleAddAtDrop` and `useCanvasAgentRpc`; both must write the same `inputType/inputTarget` edge metadata or text references silently fail outside direct UI connections.
- Agent execution builds inputs from raw canvas nodes, so it must merge `computeInputTexts` at execution time; UI node buttons already receive decorated derived values.
- `EditImageNode` is a special text target: its schema exposes `prompt`, but its visible editor/execution uses `promptHtml`. Referenced plain text is escaped and converted to paragraph HTML for display/execution without being persisted.
- `MarkdownEditor` was already present in the committed host export surface, so this feature required no new host-layer change and follows the mini-app refresh-only path.
