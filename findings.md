# Findings: Canvas drag edge auto-pan

## Current Research: Storyboard creation node migration

- The requested source is the standalone `packages/server/agent-spaces-data/mini-apps/文案转分镜` mini-app.
- The target is the existing `game-asset-canvas` node system; source project-management UI/state is explicitly out of scope.
- Storyboard editing must render inline in the node form, while built-in characters move to a dedicated `RightPanel` tab.
- Generated images, videos, and audio must be represented by existing display-node types and connected through normal ReactFlow edges.
- Source files are compact and separated into `CharacterPanel.jsx`, `ScenePanel.jsx`, `utils/workflow.js`, `utils/constants.js`, `hooks/useStore.js`, and `services/store.js`; project management can be excluded without copying the whole app shell.
- Source storyboard fields include `index`, narration text, image prompt, animation prompt, and participating character IDs; image generation uses selected character images/prompts, video generation prefers the latest scene image, and voice generation consumes narration.
- Target project rules require all shared persistence through `services/canvas.js`, ReactFlow node dimensions at both top-level and `style`, and inline node interaction classes `nodrag nopan nowheel`.
- The target already exposes `addImageNodesFromUrls` and `addVideoNodesFromUrls`; the audio display-node creation contract still needs exact inspection.
- Target `NODE_TYPES` has `imageDisplay` and `videoDisplay`, but no independent audio display type; fulfilling the request cleanly requires adding `audioDisplay` rather than repurposing the executable `textToVoice` node.
- Target workflow IDs already match the source defaults for text-to-image, edit-image, video, and voice, so no new plugin or manifest permission is needed.
- `useImageOutputs.js` owns non-overlapping creation of image/video display nodes. It is the appropriate extension point for audio display-node construction and returning created node IDs for edge creation.
- Character data should be workspace-scoped shared config because the RightPanel library is global to the active canvas workspace, while storyboard scenes and generated-media references belong in each storyboard node's `data`.
- RightPanel is already split into tab components, so the character library can be added as `right-panel/CharactersTab.jsx` and wired in `right-panel/index.jsx` without expanding the forwarding `RightPanel.jsx` file.
- The storyboard node can persist its entire editable state through the existing `data.onUpdate` callback; no new storyboard service is needed.
- Target settings/workflow constants already supply the four required workflows. Generation parameters will live inline in `storyboard.data.params`, avoiding all source generation/settings dialogs.
- Display-node creation must also append ReactFlow edges from the storyboard node. Image creation is asynchronous due to dimension probing, so helpers need an `onAdded(ids)` callback; video/audio helpers should use the same callback contract.
- Implemented a workspace-scoped `storyboard-characters.json` library with service-owned writes and the standard three-read subscription pattern.
- Implemented `storyboard` node data as `{sourceText, scenes[], params}`; each scene owns editable prompts, role references, and arrays of generated media URLs.
- Added `audioDisplay` as a pure upload/playback node with both target and source handles, matching the existing image/video display-node role.
- Storyboard generation uses target `generateImages`/`generateVideo`/`generateAudio`, then creates independent display nodes beside the storyboard. Display nodes expose source handles for normal downstream connections.
- Do not auto-connect storyboard to its display nodes: target input derivation treats any incoming edge as authoritative, while a multi-scene storyboard has no per-edge output selector. An automatic edge would overwrite each display node's assigned media with an empty or aggregate source value.
- AI storyboard import accepts an optional Agent preset ID and otherwise selects the first available preset from `list_agent_presets`; imported characters merge into the active workspace library by name.
- Current built-in `agent_run` ignores a caller-supplied `systemPrompt` field and uses the selected preset's stored system prompt. The follow-up therefore configures a dedicated storyboard preset through `openAgentEditor`; runtime prompts contain only the source-copy task so user edits to the preset remain authoritative.
- Follow-up UI keeps character persistence workspace-scoped but embeds the manager under the storyboard node's collapsed role section; RightPanel no longer exposes a character tab.
- AI copy input is guarded by local `aiOpen` state and is absent from the rendered node body until the entry button is clicked.
- Scene ordering uses a dedicated `GripVertical` HTML5 drag handle and `reorderStoryboardScenes`, which rewrites indexes after every move.

## Current Research: Output grouping and labels

## Current Research: Storyboard generation dialogs and presets

- The handoff identifies `StoryboardNode.jsx`, `CharactersTab.jsx`, and `useStoryboardOperations.js` as the primary implementation surface.
- Existing storyboard work is uncommitted and overlaps this request; all edits must preserve it in place.
- CodeGraph is unavailable in this session, so repository discovery uses `rg` as the instructed fallback.
- The existing flat `params.imageModel/videoModel/voiceModel/aspect/...` shape must remain readable because previously saved storyboard nodes may already contain it.
- The stable shape is four nested node presets: `params.textToImage`, `params.editImage`, `params.video`, and `params.voice`; the character library stores its last image mode and both image presets on each character's `generationParams`.
- Scene image generation already derives selected character reference images, making that input presence the compatible discriminator between the saved text-to-image and image-to-image presets.
- `generateImages`, `generateVideo`, and `generateAudio` accept the same workflow input fields as their standalone nodes; count and concurrency can be passed through with the preset.
- The project UI exports the required host `Dialog`, `Tabs`, form, and icon components; no dependency or manifest change is needed.

## Current Research: Storyboard card-local media and role picker

- The current hook already persists generated URLs into the matching scene before creating display nodes; removing the latter calls preserves media data and narrows behavior cleanly.
- `scene.characterIds` already contains AI-imported role mappings and manual selection state, so the new avatar group and picker can reuse it without a data migration.
- The host `AvatarGroup` export accepts `avatarUrls: [{ imageUrl, name }]` and supplies initials when no image exists; selected character images can populate `imageUrl`.
- `useStoryboardOperations` writes URLs into the matching scene before calling `add*NodesFromUrls`, so removing only those calls changes presentation without changing persistence.
- Inline scene previews can use native image/video/audio controls; images may open the existing host `openMediaGallery` without adding dependencies.
- The generic `useImageOutputs/useVideoOutputs` paths remain required by unrelated canvas workflows; only `useAudioOutputs` became unused in `Canvas` after storyboard stopped creating display nodes.
- Consolidating settings at the dialog level does not require changing persisted preset keys, so existing saved nested and legacy flat parameters continue to resolve unchanged.

## Current Research: Storyboard masonry and scene navigation

- The local masonry mini-app uses the host `Masonry` export with `data`, `renderItem`, `getKey`, `getMeta`, `columns`, and `gap`; no package dependency is required.
- `Masonry` needs synchronous aspect metadata, so the scene renderer starts at 1:1 and records each image's `naturalWidth:naturalHeight` after load for accurate relayout.
- `NodeShell` owns the vertical scroll container. A sticky nav inside the scene-list wrapper remains visible while scene refs use `scrollIntoView` against the nearest scrollable ancestor.
- Navigation is fully derived: first scene image when present, otherwise the 1-based scene position. No saved state or migration is needed.

## Current Research: Storyboard output handles and asset-aware connections

- CodeGraph is indexed for the repository but did not surface the mini-app JSX symbols for this feature, so targeted `rg`/file reads are required as the instructed fallback.
- The requested UX is one source handle per storyboard scene, with the scene's image/video/audio arrays forming that handle's asset choices.
- Compatibility rule from the request: only show an asset-selection step when a handle has more than one generated asset; the chosen asset type must constrain the target list.
- The handoff confirms each scene persists assets in `scene.images`, `scene.videos`, and `scene.audios`; outputs stay inside the storyboard card and currently do not create display nodes.
- `Canvas.jsx` owns `onConnectEnd` and opens `ConnectionTargetDialog` with `{ source, sourceHandle }`; this is the narrow integration point for decoding a storyboard scene handle.
- The mini-app is already heavily modified by prior storyboard work. All new edits must compose with those changes and avoid resetting unrelated files.
- Project rules require React Flow content controls to use `nodrag nopan nowheel`, host UI/icon exports instead of direct `lucide-react`, and no browser test unless explicitly requested.
- `StoryboardNode` currently renders no source handle at all; `NodeShell` only supports a single boolean `sourceHandle`, positioned by the global floating-handle setting.
- The scene card already has stable `scene.id` values and left navigation thumbnails, so a matching right rail can use those IDs for handle identity without persisting new data.
- `Canvas.onConnect` currently derives output type only from the source node type, asks `getConnectionTargets(...)` for target slots, and stores `inputTarget/inputType` on the edge. It does not carry a selected source asset.
- `ConnectionTargetDialog` currently handles only target-slot selection. It receives `targets`, `inputType`, and returns a target ID.
- `onConnectEnd` preserves `sourceHandle` when opening the blank-canvas add-node menu, so scene-handle metadata must remain decodable there as well or degrade cleanly.
- A minimal compatible edge extension is to persist selected source asset metadata in `edge.data` while retaining existing `sourceHandle`, `inputTarget`, and `inputType` fields.
- `StoryboardNode` scene cards use stable `data-storyboard-scene-id` attributes and the left rail renders a 48px thumbnail/number per scene. The requested right rail can mirror this visual language while placing an actual `Handle` on each item.
- The right rail should be derived from scenes with at least one asset; empty scenes need a disabled visual item or no active handle. Keeping all scenes visible preserves the requested “以分镜数量为输出 handle” count, so the implementation should render a disabled placeholder for empty scenes rather than omit the row.
- The mini-app renderer allowlists `@xyflow/react`; no package installation is appropriate. Host Tailwind may not include novel arbitrary classes, so behavior-critical handle positioning should use inline styles.
- Current connection creation stores only target-side routing metadata. Selected source material must also influence derived downstream inputs, not just dialog filtering, otherwise the edge would still transmit every source-node output.
- `getConnectionTargets` maps the source node type to one of `image/text/video/audio`, but has no source-asset override and currently emits media targets without checking whether the target node consumes that media type.
- `computeInputImages`, `computeInputVideos`, and `computeInputAudios` derive downstream values from source node output fields. A storyboard edge therefore needs an edge-level selected asset fallback because storyboard media lives inside `data.scenes[]`, not `data.output`.
- `computeInputImages` already reads edge routing metadata and builds parallel resource objects, making it the correct place to consume an edge-level selected image. Video/audio derivation can follow the same rule.
- `useDecoratedNodes` is the sole consumer of all four media derivation maps, so no node component contracts need to change once the pure derivation utilities understand `edge.data.sourceAsset`.
- The project guide forbids dependency installation and requires static local imports, host exports, theme tokens, and focused Babel/test verification. This change stays entirely inside the mini-app root.
- The official React Flow Button Handle page returned HTTP 200 and still documents `Position`, `useConnection`, and `ButtonHandle`; the repository already exposes React Flow's native `Handle` but contains no installed `ButtonHandle` wrapper.
- Existing `canvas-edges.js` already treats `sourceHandle` and `inputTarget` as part of stable edge identity. Canvas duplicate checks should align with that contract so two storyboard scene handles can connect to the same target.
- Blank-canvas node creation repeats direct-connect target selection in `useNodeCrud`, so it must receive the same storyboard asset selection behavior to avoid inconsistent handle semantics.
- The pure data contract is now verified: `edge.data.sourceAsset = { sceneId, type, url, thumb?, label? }`; media derivation uses it when present and retains legacy source-node output behavior when absent.
- Image target compatibility must include both the generic `imageProcess` type and `isImageProcessNodeType(...)` split processor types.
- Host `react-renderer.tsx` exposed `Handle` and `Position` but omitted `useUpdateNodeInternals`; React Flow's documented dynamic-handle contract requires adding that existing library export to the bare-import allowlist.
- Edge display must pass persisted `edge.data.inputType` back into target resolution; otherwise storyboard video/audio edges receive image-oriented labels because the storyboard node's default output type is image.
- Final verification: focused 33/33; full mini-app 233/236 with three unrelated existing failures; renderer ESLint and all affected Babel transforms pass.
- User feedback confirmed the first handle layout was unusable because the rail lived under NodeShell's clipped content hierarchy. Moving the entire rail, not just the dot, to an absolute sibling restores an external drag target.

## Current Diagnosis: Animation groups reset after refresh

- The canvas service and `useCanvasState` save/load full node data; neither strips `animGroups`.
- The real workspace canvas contains an empty `animGroups` array but an exported resource with `groupName: "动画组 1"`, proving the data was cleared after an animation group existed.
- `VideoEditorDialog` has an unconditional `[currentVideo]` effect that writes `animGroups: []`; React runs it on initial mount, including immediately after refresh.
- The confirmed fix is a previous-video ref initialized from `currentVideo`; equal URLs return before any write, while genuine URL transitions keep the reset behavior.

- The request is UI-only and requires backward compatibility with existing string URL arrays and current resource objects.
- The project guide requires edits to remain inside the mini-app root and `src/CLAUDE.md`/handoff documentation to be updated when the output UI contract changes.
- `NodeShell` passes `data.output.images` and `data.output.resources` to the single `ImageResult` renderer; downstream image derivation also propagates resource objects.
- The stable compatibility shape is `output.images: string[]` plus `output.resources: [{ url, thumb?, groupName?, label? }]`.
- Resource lookup by URL alone is insufficient because duplicate URLs may carry distinct metadata; UI normalization must align by index first and preserve original global indexes for actions.
- Video editor currently exports one URL per animation group but writes no `resources`; it can add `{ url, thumb: url, groupName: group.name }` without changing `output.images`.
- Existing manual output delete/reorder rebuilds `resources` by URL, which preserves metadata for unique URLs but needs occurrence-aware alignment to remain correct for duplicate URLs.
- Diff review caught and fixed the Gallery fallback after UI normalization; it now passes `item.url`, while delete/open/drag actions use the original global index.
- Reorder/delete must carry the parallel resource array explicitly; deriving it only from URLs loses occurrence-specific metadata when duplicate URLs exist.

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
