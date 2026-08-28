# Progress log

## 2026-08-26
- Read the planning-with-files skill and the supplied Coss UI Get Started guide.
- Located the target frontend package and inspected its package/config/CSS/UI baseline.
- Confirmed Coss packages are registry-only (npm 404), so migration must use shadcn registry/config conventions.
- Added `@coss` registry to `packages/web/components.json`; existing local primitives remain intentionally API-compatible to avoid a broad behavior change.
- Added Coss `code` semantic tokens to `packages/web/src/app/globals.css`.
- Wired Inter/Geist Mono CSS variables in `packages/web/src/app/layout.tsx` and corrected root typography to `font-sans`.
- Removed the CLI's accidental `@daypicker/react` dependency and cleaned lockfile metadata churn.
- Targeted ESLint passes; full TypeScript check remains blocked by pre-existing unrelated errors.
- Attempted bulk replacement of 39 supported components; detected metadata-only registry response, restored all affected files, and recorded the environment blocker.
- Sparse-cloned the official Coss repository and downloaded 53 UI primitives plus Base UI/lib helpers into `packages/web/src/components/ui/coss`, rewriting internal registry aliases for this project.
- Added the required `@daypicker/react` dependency and local `use-media-query` helper for the downloaded sources; only `otp-field.tsx` remains incompatible with the installed Base UI version.
- Backed up 40 existing same-name shadcn components under `packages/web/src/components/ui/backup` and replaced 54 files with official Coss implementations.
- TypeScript check reports downstream API incompatibilities; rollback is available from `ui/backup`.
- Restored compatibility-sensitive primitives (`button`, dialogs, menus, drawer, tabs, sidebar, form controls) from backup; compatible Coss primitives remain active.
- Added a scoped `@ts-nocheck` marker to the downloaded Coss OTP source because the pinned Base UI version lacks `OTPField`; the original OTP error remains pre-existing.
- Upgraded `@base-ui/react` to `^1.7.0` and removed the temporary OTP type suppression; Coss OTP now type-checks.
- UI component ESLint completes with warnings only; remaining TypeScript errors are unrelated app/API baseline issues.
- Removed `packages/web/src/components/ui/backup` (40 legacy shadcn files) per request.

## 2026-08-27
- Started the game-asset-canvas interaction task from `src/handoff.md`.
- Confirmed clean worktree and added phases 10-12 to the existing planning files.
- Read the complete planning workflow and local mini-app development guidance; confirmed project root, entry point, and likely target files.
- Located the Ctrl+A defect: group selection state is not passed into `useSelectionClipboard`.
- Located the node context-menu integration and an existing downstream image-display creation flow for reuse.
- Confirmed the menu action dispatch path and canonical node factory (`crud.createNodeAt`).
- Implemented all three requested interactions; the first parallel validation wrapper failed before returning child outputs, so validation is being rerun sequentially.
- Added active-group-aware Ctrl/Cmd+A with a tested pure resolver and stale-group fallback.
- Added node context-menu actions to copy structured node JSON and create/connect a downstream image-display node while preserving direct group membership.
- Updated `src/CLAUDE.md` and `src/handoff.md` with the new interaction contract.
- Final validation passed: four Babel compilation checks, 3/3 group-helper tests, and `git diff --check`.

## 2026-08-28
- Added `mini-app-background.ts`: generic per-miniapp background handler registry with default `src/background.js` and built-in `persist-images` task.
- Added `miniApp.background.register/submit` WS events and `registerBackgroundService`/`submitBackgroundTask` host APIs.
- Switched game-asset-canvas workspace image persistence to fire-and-forget background tasks; Canvas replaces output URLs with authenticated local-file URLs on completion.
- Documented manifest one-line enablement and event contract in `packages/web/public/learn/miniapp.md`.
- Validation: server `tsc --noEmit`, miniapp Babel compilation, and `git diff --check` passed.
