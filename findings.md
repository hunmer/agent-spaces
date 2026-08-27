# Findings

- The target app is `packages/web` (`@agent-spaces/web`), a Next.js 16 React 19 app.
- Tailwind CSS v4 and `tw-animate-css` are already configured in `src/app/globals.css`.
- `packages/web/components.json` uses shadcn `base-nova`, neutral CSS variables, and Lucide icons.
- The app has many local UI components under `src/components/ui`; `button.tsx` still wraps `@radix-ui/react-slot`, while `card.tsx` already uses newer shadcn data-slot conventions.
- Existing CSS already defines Coss-documented extra semantic tokens (`info`, `success`, `warning`, and foreground variants), but font variables are app-specific aliases rather than Coss font packages.
- `@base-ui/react` is already a direct dependency, which reduces risk for Coss primitives.
- Direct npm lookup for `@coss/ui`, `@coss/style`, and `@coss/fonts` returns 404; the supplied guide's supported path is shadcn registry commands (`add @coss/ui` / `add @coss/style`), not npm install.
- `https://coss.com/ui/r/registry.json` is reachable but contains metadata without `files[].content`; source must be fetched per component URL.
- `shadcn add` against both `@coss/ui` and a direct component URL stalls during registry/dependency handling in this environment. A metadata-only extraction cannot safely replace local files.
- The official GitHub tree contains complete source files under `ui/`, `base-ui/`, `lib/`, and `hooks/`; these are suitable for deterministic local downloads.
- Coss `calendar.tsx` requires `@daypicker/react`; Coss `otp-field.tsx` requires a newer Base UI export (`OTPField`) than the installed `@base-ui/react@1.4.1`.

## Game asset canvas task (2026-08-27)
- `handoff.md` identifies `useSelectionClipboard` as selection/clipboard owner and `Canvas.jsx` plus `components/canvas` as canvas/menu integration points.
- Mini-app source changes are refresh-only; no host restart should be required unless implementation crosses into host files.
- Existing git worktree is clean at task start.
- Project root contains `manifest.json` and `src/`; `mainFile` is `index.jsx`.
- The local `write-mini-app-code` guidance requires keeping changes inside this mini-app root and validating JSX through Babel; no new plugin capability is needed for the requested interactions.
- Target menu file exists at `components/canvas/CanvasContextMenu.jsx`; selection ownership remains `hooks/useSelectionClipboard.js`.
- `useSelectionClipboard.handleKeyboardSelectAll` currently infers a group only from selected node ids. It has no `selectedGroupId`, so an activated group with no selected child nodes falls back to selecting the entire canvas.
- `Canvas.jsx` owns `nodeContextMenu` state and already passes React Flow `onNodeContextMenu`; the canvas-level context menu explicitly cancels itself on `.react-flow__node`.
- Existing downstream image-display creation logic is present in `useNodeExecutions.js`; it should be reused or mirrored through a focused callback rather than reimplementing node size/edge defaults in the menu.
- The node menu UI lives in `CanvasOverlayDialogs.jsx`; actions are dispatched by `Canvas.jsx::runNodeContextAction`.
- `useNodeCrud.createNodeAt(type, position, dataPatch)` returns the new node id and applies canonical default size/data, making it suitable for the downstream shortcut.
- `useSelectionClipboard` is currently initialized before `useGroupOperations`; passing active group state requires reordering these independent hooks in `Canvas.jsx`.
- Active-group resolution now validates that the group still exists before applying scoped selection; stale ids fall back to the prior selected-node inference.
- During implementation, unrelated concurrent edits appeared in `Canvas.jsx`, `useNodeCrud.js`, `FloatingEdge.jsx`, `ImageDisplayNode.jsx`, config/index/workflow files, and others. They were preserved and not reverted.
- Project conventions require post-change synchronization of `src/CLAUDE.md` and `src/handoff.md`; the new interaction contract was appended to both.
