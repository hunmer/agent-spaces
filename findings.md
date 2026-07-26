# Findings

## 2026-07-26 Image editor dialog

- Handoff points to `ImageEditorNode.jsx`, `utils/image-ops/cdn.js`, and host `react-renderer.tsx` as the relevant path.
- Reported failures are null DOM access during dialog open: `dispatchEvent` and `setAttribute`, followed by immediate close.
- CodeGraph is unavailable in this session, so project rules require targeted `rg` inspection.
- `react-renderer.tsx` does not call `dispatchEvent` or `setAttribute` in the mini-app lifecycle; the stack location is the dynamically evaluated module boundary.
- `ImageEditorDialog.jsx` currently creates Painterro with its default body wrapper, calls `show(imageUrl)`, then reparents that wrapper into a Radix Dialog portal. Cleanup calls `hide()` and manually removes the wrapper.
- The current DOM reparenting/cleanup strategy can invalidate Painterro's internal DOM queries and event targets, matching both null-access errors.
- Painterro 1.2.92 constructs its custom-event target with `document.querySelector('#' + options.id) || document.getElementById('app')`. With no `id` and no host `#app`, that target is deterministically null.
- In custom-id mode all `holderEl` uses are guarded; the previous comment claiming that mode dereferences a null holder was incorrect.
- The Painterro mount must be an empty element owned exclusively by Painterro because its constructor replaces the target's children.
- Painterro's constructor calls `hide()` before returning. An unconditional `onHide -> onClose` therefore explains the immediate dialog close independently of the null DOM errors.
- The cutout node owns the actual input image list, while `ParamField` is shared by unrelated processors. Color picking therefore belongs in `CutoutNode`, with `ParamField` exposing only an optional trigger.
- Rembg `backgroundColor` must preserve an empty value as transparent; the picker displays that state and only writes a hex color after confirmation.
- Painterro injects media-query CSS at runtime that resets `.ptro-holder` to `position: fixed`; runtime Tailwind arbitrary selectors are not a reliable override in this mini-app. Inline holder bounds plus a scoped toolbar z-index keep the full editor inside the dialog body.
- Cutout color picking can use the current input image or an existing output image. The trigger should remain clickable and let the dialog explain when neither exists.

- Team detail UI entry: `packages/web/src/components/teams/team-detail-panel.tsx`, component `TeamDetailPanel`.
- Server SkyOffice room class: `packages/server/src/skyoffice/rooms/SkyOffice.ts`; it supports chat/status messages through its dispatcher.
- Team memberships contain `teamId`, `agentId`, optional agent data and active status.
- CodeGraph did not index `SkyOfficeApp` or `agent-client.ts`; use targeted text/file inspection next.
- `executeTeamReply` is the shared entry for preset/chat/custom team agents, so one hook there covers all team-agent starts.
- Existing SkyOffice `Bridge` already supports spawn, talk, and async activity transitions; no new protocol is needed.
- Frontend `Network.joinCustomById` already joins a business room ID; `SkyOfficeApp` only needs an automatic-join prop and embedded sizing.
- Room registry is in-memory. The minimal idempotent mapping can derive a stable room ID from `teamId` and recreate it after server restart.
- Verification: server `tsc` passed; `test/team-room.test.ts` passed; changed web files have no ESLint errors.
- Repository-wide web `tsc --noEmit` has unrelated existing failures, so it is not a clean project baseline.
- Reproduction showed the server registry had 3 agents while a real Colyseus client decoded `{ players: {}, agents: {} }`.
- Root cause: server TS emitted native class fields (`useDefineForClassFields=true` via ES2022), shadowing `@colyseus/schema` decorator accessors, so state changes were not serialized.
- Real Colyseus integration now verifies members are decoded, spawn positions differ, and activity switches to `working`.
- Automatic team-room login skipped `Game.registerKeys`; passing `autoRegisterKeys` through Bootstrap restores arrows/WASD.
- `disableGlobalCapture()` allowed browser arrow-key scrolling; explicit Phaser capture fixes it.
- Idle wandering now keeps an independent `nextWanderAt` per agent instead of moving agents from one synchronized batch timer.
- Team spawn assigned different textures but left `anim=adam_idle_down`; setting both from one texture fixes skin changes.
- BFS was correct, but the `Wall` object layer was absent from `furnitureBlockedTiles`; adding it to the same obstacle grid prevents wall-crossing.
- Camera dragging stopped follow permanently; restarting follow on pointer release keeps the player in frame.
- Idle BFS returned tile coordinates but AgentSprite tweens require world pixels; converting every path node fixes erratic/out-of-map movement.
- Camera follow should not resume on pointer release; manual camera position persists until the player exits `camera.worldView`.
- `Schema.onChange` is a registration method in Colyseus schema v2 and its callback has no changes argument; assigning it or expecting changes silently breaks live updates.
- Snapshot diffing inside registered callbacks preserves the existing field-change event API and makes activity changes immediate.
