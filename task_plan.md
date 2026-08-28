# Coss UI migration plan

## Goal
Migrate `packages/web` from the current shadcn setup toward Coss UI conventions while preserving existing component APIs and application behavior.

## Phases
- [completed] 1. Inspect current UI/toolchain and confirm Coss package setup
- [completed] 2. Apply Coss-compatible dependencies, registry config, tokens, and fonts
- [completed] 3. Verify existing shared primitives remain API-compatible with the Coss registry path
- [completed] 4. Run typecheck/build/lint and document residual migration work
- [completed] 5. Download every supported Coss primitive from the official GitHub registry
- [completed] 6. Back up original shadcn files and batch replace matching components
- [completed] 7. Adapt downstream consumers to Coss component contracts
- [completed] 8. Upgrade Base UI and verify OTPField
- [completed] 9. Remove obsolete shadcn backup directory
- [completed] 10. Inspect game-asset-canvas selection, context-menu, and node-creation flows
- [completed] 11. Implement group-scoped Ctrl+A, node info copy, and downstream image-display shortcut
- [completed] 12. Run focused syntax/type/tests and document results

## Validation
- Game asset canvas: Babel compilation passes for `Canvas.jsx`, `CanvasOverlayDialogs.jsx`, `useSelectionClipboard.js`, and `group-helpers.js`.
- Game asset canvas: `node --test src/utils/group-helpers.test.js` passes 3/3 tests.
- Game asset canvas: `git diff --check` passes.
- `pnpm --filter @agent-spaces/web exec eslint "src/app/layout.tsx"` passes.
- `pnpm --filter @agent-spaces/web exec tsc --noEmit` reaches existing unrelated project errors in mini-app/file API typings and `tiny-pinyin`; no errors point to the migration files.
- `https://coss.com/ui/r/button.json` and `https://coss.com/ui/r/style.json` are reachable and confirm the configured registry URL.

## Errors Encountered
| Error | Attempt | Resolution |
| `@coss/ui`, `@coss/style`, and `@coss/fonts` are not published as npm packages | 1 | Use the shadcn registry workflow described by the supplied guide; do not add npm dependencies directly |
| Coss registry index exposes metadata only; CLI/source fetch stalls in this environment | 2 | Restore affected local files; defer bulk replacement until registry fetch/install is available |
| Batch replacement exposes downstream API mismatches (`AlertDialogAction`, `ContextMenuContent`, `asChild`, legacy variants) | 4 | Keep originals in `ui/backup`; requires a compatibility pass |
| Existing non-Coss `ui/otp-field.tsx` still targets unavailable `OTPField` export | 5 | Pre-existing issue; Coss copy is type-suppressed pending Base UI upgrade |
| `@base-ui/react@1.4.1` lacked `OTPField` | 6 | Upgraded to `^1.7.0`; Coss OTP source now type-checks |
| User requested removal of the 40-file backup directory | 7 | Deleted `packages/web/src/components/ui/backup` |
| Parallel diff/icon/syntax validation returned only an orchestration error | 8 | Re-run checks sequentially to isolate the failing command and obtain concrete output |

## Current Task
- Target: `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src`
- Goal: group-scoped Ctrl+A, node context-menu info copy, and one-click downstream image-display creation.

## Background Service Extension (2026-08-28)
- [completed] Add generic mini-app background service manager and built-in async image persistence task
- [completed] Wire background register/submit events into mini-app WS and host API
- [completed] Migrate game-asset-canvas workspace image persistence to background submission and result replacement
- [completed] Update miniapp documentation and validate compilation
