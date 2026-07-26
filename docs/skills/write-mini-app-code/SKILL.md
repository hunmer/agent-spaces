---
name: write-mini-app-code
description: Write, edit, or review Agent Spaces Workflow UI project code from a user-provided project path while looking up Workflow UI renderer, host component, and plugin source from the current working directory instead of MCP/runtime agent tools. Use when an external agent needs to work on Workflow UI React or HTML preview projects, including manifest/mainFile handling, src/ file layout, window.AgentSpacesUI host components, plugin tool calls, config/data helpers, and light/dark theme-safe Tailwind styling.
---

# Write Workflow UI Code

## Goal

Use this skill to make an external agent behave like the built-in Workflow UI agent when editing a Workflow UI project on disk.

The user should provide a path to the Workflow UI project. The project root normally contains:

```text
manifest.json
src/
configs/       # optional runtime JSON config files
data/          # optional generated or downloaded data files
```

If the user provides `src/` or a file inside `src/`, normalize to the project root before editing.

## First Steps

1. Resolve and quote the user-provided path.
2. Confirm the root contains `manifest.json` and `src/`.
3. Read `manifest.json` to find `mainFile`; default to `index.jsx` when missing.
4. Read the entry file under `src/`.
5. For non-trivial changes, inspect directly imported local files before editing.
6. If `src/CLAUDE.md` exists, read it before changes and update it after changes when files, architecture, or important decisions changed.

Do not modify files outside the Workflow UI project root unless the user explicitly asks.

## Source Lookup From Current Workspace

This skill is intended to live alongside the Agent Spaces source tree. Do not rely on MCP or runtime-only agent tools to discover Workflow UI internals. Use the current working directory as the source repository and search files directly.

Useful source locations:

- `packages/server/src/ws/agent-prompt.ts`: built-in Workflow UI agent prompt rules.
- `packages/server/src/services/builtin-tools/mini-app-tools.ts`: host UI component category lists and Workflow UI function tool behavior.
- `packages/web/src/lib/ui-exports.ts`: components and lucide icons exported to `window.AgentSpacesUI` and `@agent-spaces/ui`.
- `packages/web/src/components/ui/`: host UI component implementations and composition patterns.
- `packages/web/src/components/mini-apps/mini-app-router.tsx`: built-in routing — `Router`/`useRouter`/`Link`, `serializeRoute`/`parseRoute`, iframe hash sync and postMessage handoff to the host page URL.
- `packages/web/src/components/mini-apps/mini-app-renderer.tsx`: renderer module allowlist and local import resolution.
- `packages/web/src/components/mini-apps/mini-app-preview.tsx`: preview container behavior.
- `packages/web/src/components/mini-apps/mini-app-editor.tsx`: editor file loading and preview refresh behavior.
- `packages/server/src/services/plugin.ts`: plugin tool lookup and execution behavior.
- `packages/server/src/routes/plugin.ts`: `execute` route, including optional `workspaceId`/`executorId`/`taskId`/`meta` task tracking and `miniApp.*` broadcasting.
- `packages/server/src/services/mini-app-tasks.ts`: in-process task state cache (start/finish/fail/list/prune) backing `miniApp.*` events.
- `packages/web/src/components/mini-apps/use-mini-app-host-api.ts`: host API injected into preview globals — `callPluginTool` options, `onTaskEvent`, `getExecutorId`, `getConfig`/`onConfigChanged`, `invokeService`, config/data helpers.
- `packages/server/src/services/mini-app-services.ts`: compiles project `src/services/*.js`, caches per projectId, `invokeService`, injects `ctx` (readConfig/writeConfig/updateConfig/broadcast).
- `packages/server/src/routes/mini-app.ts`: mini-app REST routes including `POST /:id/services/invoke`.

When a symbol or component location is unclear, search from the current working directory. Prefer structural search when available; otherwise use `rg`.

## Runtime Model

Workflow UI code runs in the browser preview renderer, not in a normal Vite, Next.js, or Node build.

React mode flow:

```text
JSX source
  -> Babel standalone
  -> CommonJS transform
  -> new Function('React', 'ReactDOM', 'exports', 'require', compiled)
  -> default export rendered with ReactDOM.createRoot()
```

Implications:

- The entry file must export a default React component.
- Local ES module imports are supported between files under `src/`.
- Bare imports only work when the renderer explicitly allowlists them.
- Browser globals such as `window.AgentSpacesUI`, `window.AgentSpaces`, and `window.AgentSpacesAPI` are available in every file.
- Do not assume Node APIs, filesystem APIs, environment variables, or bundler plugins are available in preview code.
- **Never use relative dynamic `import()` in mini-app code.** Because each module is compiled with Babel and executed via `new Function(...)`, the bundler (webpack/turbopack) treats `await import('./image-ops/cdn')` as a static analysis target, fails to find a matching chunk, and returns `Failed to fetch dynamically imported module: http://127.0.0.1:3000/_next/static/chunks/.../image-ops/cdn` (HTTP 404). Use a **static top-level `import`** for any local module under `src/`. The only valid dynamic `import()` targets are Blob URLs built from vendored bundles (see [Loading Third-Party Bundles](#loading-third-party-bundles)) and CDN URLs loaded via `window.AgentSpaces.loadCdnModule(url)`; both must be wrapped in `new Function('u','return import(u)')` so the bundler does not rewrite them.

## File Layout

Split large Workflow UI projects into multiple files. Avoid putting a whole app into `src/index.jsx`.

Recommended layout:

```text
src/
  index.jsx                  # entry point; export default App
  components/
    Header.jsx
    ParameterPanel.jsx
    ResultsTable.jsx
  hooks/
    usePluginData.js
  utils/
    config.js
    formatters.js
```

Rules:

- Keep each file single-purpose.
- Split components that exceed about 200 lines.
- Use standard local imports: `import Header from "./components/Header"` or `import { formatDate } from "./utils/formatters"`.
- The renderer resolves `.jsx`, `.js`, `.tsx`, `.ts`, and directory `index` files.
- Do not create barrel re-export files that only re-export other files.
- Do not import `window.AgentSpacesUI`, `window.AgentSpaces`, or `window.AgentSpacesAPI`; use them as globals.

## Host UI Components

In React mode, prefer host components from `window.AgentSpacesUI` over hand-written equivalents.

```jsx
const { Button, Card, CardContent, Search, Loader2 } = window.AgentSpacesUI;
```

Lucide React icons are exposed on `window.AgentSpacesUI` by their standard names.

Do not import host components or icons from repository source paths such as `@/components/...`.

Do not call `list_agent_spaces_ui_components` from this local skill workflow. Instead, inspect the source in the current working directory:

- Read `packages/server/src/services/builtin-tools/mini-app-tools.ts` for component categories and the categorized component list.
- Read `packages/web/src/lib/ui-exports.ts` to confirm the actual exports available on `window.AgentSpacesUI`.
- Read the relevant file under `packages/web/src/components/ui/` when component props or composition are unclear.

Known categories:

- `actions`: buttons, toggles, direct action controls.
- `forms`: inputs, selectors, labels, uploaders, editable fields.
- `layout`: containers, panels, separators, scroll areas, structural primitives.
- `navigation`: tabs, breadcrumbs, menus, pagination, navigation controls.
- `overlays`: dialogs, popovers, tooltips, sheets, drawers, contextual menus.
- `feedback`: alerts, badges, loading states, progress, empty states, status indicators.
- `data-display`: tables, charts, markdown, avatars, structured display components.
- `media`: images, galleries, carousel, media previews.
- `utilities`: miscellaneous helpers exposed by the host UI bundle.
- `uncategorized`: components not mapped to a category.

If `window.AgentSpacesUI` component props or composition are unclear, inspect the host implementation in the current working directory, especially `packages/web/src/components/ui` and `packages/web/src/lib/ui-exports.ts`.

`@agent-spaces/ui` is also mapped by the renderer for allowed host UI exports, but destructuring from `window.AgentSpacesUI` is the safest default in preview code.

### Composition: use `render`, never `asChild`

The host overlay components (`Tooltip`, `Popover`, `Select`, `DropdownMenu`, etc.) are built on **Base UI** (`@base-ui/react`), not Radix. Base UI uses the **`render` prop** to compose a child element — it does **not** support the `asChild` prop.

Do **not** write the Radix form:

```jsx
// ❌ WRONG — asChild leaks to the DOM and nests buttons
<Tooltip>
  <TooltipTrigger asChild>
    <Button onClick={undo}><Undo2 /></Button>
  </TooltipTrigger>
  <TooltipContent>撤销</TooltipContent>
</Tooltip>
```

Symptoms when you do: a React warning `does not recognize the asChild prop on a DOM element`, plus `<button> cannot be a descendant of <button>` hydration errors. Two `<button>` elements render because Base UI renders its own trigger button and ignores `asChild`, then the inner `<Button>` renders another.

Write the Base UI form instead — pass the composed element via `render`, and put the children inside `<TooltipTrigger>`:

```jsx
// ✅ CORRECT — render prop + children inside the trigger
<Tooltip>
  <TooltipTrigger render={<Button onClick={undo} />}>
    <Undo2 />
  </TooltipTrigger>
  <TooltipContent>撤销</TooltipContent>
</Tooltip>
```

Base UI merges its own props (event handlers, ARIA, refs) onto the element passed to `render` and injects the children, so the trigger is a single button with no DOM nesting.

This applies to every Base UI-backed component exported from `@agent-spaces/ui` (Tooltip/Popover/Select/DropdownMenu/Menu/etc.). When a component's composition behavior is unclear, read its source under `packages/web/src/components/ui/` before writing JSX.

The built-in routing symbols (`Router`, `useRouter`, `Link`, `serializeRoute`, `parseRoute`) are exported from `@agent-spaces/ui` and `window.AgentSpacesUI`. Import them explicitly with a bare import (see [Routing](#routing)) rather than expecting them on a `window` sub-object — `useRouter` must be called inside a `<Router>` subtree, so a static `import` is the natural access point.

## Styling Rules

Use Tailwind utility classes through `className` for ordinary styling.

- Size full-height app roots against the renderer parent with `h-full min-h-0` or `height: 100%`; never use `h-screen` or `height: 100vh`. The standalone preview includes a host toolbar, so viewport height exceeds the available render area and the overflow is clipped.
- Put scrolling on a `min-h-0 overflow-auto` child inside the full-height root.

Prefer theme-aware tokens:

- `bg-background`
- `text-foreground`
- `text-muted-foreground`
- `border-border`
- `bg-card`
- `text-card-foreground`
- `bg-primary`
- `text-primary-foreground`

The Workflow UI host already provides the current light/dark theme through the renderer container.

### CSS color syntax

Do not wrap a hex color in `hsl()`. `hsl(#6366f1)` and `hsl(#6366f1 / 0.18)` are invalid, so the browser silently drops those declarations. Use the hex value directly for opaque colors and an RGB value for alpha:

```css
.selecto-cell.selected {
  border: 2px solid #6366f1;
  background: rgb(99 102 241 / 0.18);
  color: #6366f1;
  box-shadow: 0 0 0 3px rgb(99 102 241 / 0.2);
}
```

Inspect a theme variable's actual value before wrapping it in a color function. `hsl(var(--primary))` only works when `--primary` contains HSL channels such as `239 84% 67%`; when it contains `#6366f1`, use `var(--primary)` directly for an opaque color. Prefer the Tailwind theme utilities above when possible.

Do not:

- Add an internal theme switcher.
- Force `dark` or `light` classes.
- Override global theme CSS variables such as `--background`, `--foreground`, `--card-*`, or `--popover-*`.
- Hard-code text colors like `text-white`, `text-black`, `text-slate-*`, `text-gray-*`, or one-off hex colors unless they are explicit semantic status states with matching `dark:` variants.
- Hard-code only a background color while letting text inherit unrelated theme tokens.
- Use inline `style` objects or `<style>` blocks for normal UI styling.
- Create a separate CSS file for simple Tailwind styling.

When custom surface, border, or muted text styling is necessary, verify it is readable in both light and dark themes. Prefer semantic tokens; use paired `dark:` utilities only when semantic tokens are insufficient.

When adjusting `window.AgentSpacesUI` components, pass visual changes through `className`.

Small repeated class groups may be local constants when they improve readability.

### Dialog sizing

The host `DialogContent` ships with built-in width/height caps (`w-full max-w-[calc(100%-2rem)] sm:max-w-sm`, and a `maxHeight` inline style). To make a dialog wider/taller than the default, **do not rely on Tailwind `!important` classes** — under Tailwind v4 the `!` prefix syntax changed to a suffix (`class-!`), and even then competing with the built-in `maxHeight` inline style is unreliable.

Instead, pass an inline `style` with explicit `width` / `maxWidth` / `height` / `maxHeight` (e.g. `94vw` / `94vh`), combined with a flex-col + `overflow-hidden p-0` container. Then give the `DialogHeader` / scrollable body / `DialogFooter` their own padding so content does not hug the edge, and put `overflow-y-auto` on the middle body so only it scrolls while header and footer stay fixed:

```jsx
<DialogContent
  className="flex flex-col gap-0 overflow-hidden p-0"
  style={{ width: '94vw', maxWidth: '94vw', maxHeight: '94vh', height: '94vh' }}
>
  <DialogHeader className="px-6 pt-6">...</DialogHeader>
  <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">...</div>
  <DialogFooter className="px-6 pb-6">...</DialogFooter>
</DialogContent>
```

## Plugin Tools

### Declare every plugin id in `manifest.json`

`callPluginTool` enforces a **strict allowlist**: only plugin ids listed in the project's `manifest.json` `enabledPlugins` array can be invoked. A missing or empty `enabledPlugins` blocks **all** plugin calls — both the frontend host API and the backend `POST /api/plugins/:pluginId/tools/execute` route reject unlisted ids. The frontend returns `{ error: 'Plugin "<id>" is not enabled in this mini-app' }` without sending a request; the backend returns HTTP 403 with the same message (so the check cannot be bypassed by calling the API directly).

Whenever you add or change a `callPluginTool(pluginId, ...)` call, add `pluginId` to `enabledPlugins`:

```json
{
  "enabledPlugins": ["@agent-spaces/builtin", "workflow.rembg"]
}
```

- `@agent-spaces/builtin` covers the built-in tools (`agent_run`, `list_agent_presets`, `list_workflows`, `execute_workflow_sync`, `kb_add_text` / `kb_query` / `kb_delete`, etc.) and must be declared explicitly — it is **not** special-cased.
- For plugin ids chosen dynamically at runtime (e.g. TTS provider ids read from a config table), list every concrete value the code may pass.
- After editing `enabledPlugins`, refresh the preview so the host API cache reloads it; the backend re-reads the manifest on every request, so direct API calls take effect immediately.

Preview code executes plugin tools with:

```js
const result = await window.AgentSpaces.callPluginTool(pluginId, toolName, args);
```

An optional 4th argument `{ taskId, meta }` opts the call into backend task tracking and `miniApp.*` event broadcasting, so task state syncs across every preview instance of the same project. Omit it for one-off calls. See [Task Events And Multi-Client Sync](#task-events-and-multi-client-sync) for when to use it.

Compatibility aliases exist:

- `window.AgentSpacesAPI.callPluginTool`
- `window.AgentSpacesAPI.executePluginTool`

Prefer `window.AgentSpaces.callPluginTool` in new code.

Do not call internal agent tools such as `list_plugin_tools`, `get_plugin_tool_detail`, or `execute_plugin_tool` from this local skill workflow. Inspect source and project configuration instead:

1. Read the Workflow UI project metadata/config files to identify enabled plugin ids when present.
2. Search the current working directory for the plugin id or tool name.
3. Inspect the plugin's tool registration source for input schema, defaults, credentials behavior, and output shape.
4. Inspect `packages/server/src/services/plugin.ts` and `packages/server/src/services/plugin-runtime-api.ts` when runtime wrapping or credential injection behavior is unclear.

In preview code:

- Do not assume business data is on the top-level wrapper.
- If the response is `{ success, result }`, read plugin data from the inner `result`.
- If an input schema property has a `default`, omit that field unless the user needs an override.
- Do not build UI for API keys, tokens, account credentials, or secrets.
- Do not pass credential arguments when plugin default credentials can be injected from plugin config.

## Task Events And Multi-Client Sync

When a Workflow UI project runs long tasks (generation, polling) and should reflect state across multiple preview instances (editor iframe, standalone preview page, multiple tabs of the same project), use the host task-event channel instead of local-only state.

### Initiating a tracked task

Pass an options object as the 4th argument so the backend tracks the execution and broadcasts `miniApp.*` events to every client on the same project channel:

```js
const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const meta = { mode: 'text_to_image', provider: 'jimeng', prompt };
await window.AgentSpaces.callPluginTool(pluginId, toolName, args, { taskId, meta });
```

- `taskId`: client-generated. Reuse the same id across retries or async polling stages so the backend cache stays idempotent and the queue shows one item.
- `meta`: arbitrary context the backend echoes back in every event (mode/provider/prompt/labels). Other clients that did not initiate the call need it to render queue items and parse results, so include anything the UI needs downstream.

### Subscribing to events

```js
const unsubscribe = window.AgentSpaces.onTaskEvent((event, data) => {
  switch (event) {
    case 'miniApp.taskSnapshot': // reconnect/refresh recovery — data.tasks
    case 'miniApp.taskStarted':  // { taskId, executorId, pluginId, toolName, meta }
    case 'miniApp.taskFinished': // { taskId, executorId, meta, result } -> parse, persist
    case 'miniApp.taskFailed':   // { taskId, executorId, meta, error }
  }
});
// Call unsubscribe in effect cleanup.
```

`window.AgentSpaces.getExecutorId()` returns this client's id (persisted in `sessionStorage`, so it survives reload/reconnect within the same tab; different tabs are independent); compare it with `data.executorId` to detect tasks the current client initiated (e.g. only the initiator surfaces a global error).

### Patterns

- Treat `taskFinished` as the single source of truth for results: every client (initiator or not) parses `result` and persists via `writeConfigJson`, so history is shared. Do not also write results from the initiator's call site — that double-writes.
- For async polling (e.g. MiniMax video), reuse the same `taskId` and `meta` on the polling call; the queue shows one item transitioning running -> completed.
- If `taskFinished` carries no parseable media (intermediate async state, e.g. only an `asyncTaskId`), keep the item `running` instead of marking it completed.
- Subscribe once in a top-level hook; clean up on unmount.

Do not reimplement task queues, polling state machines, or cross-tab sync inside the project — the host already provides them.

## Routing

For projects with multiple views (generate / history / settings / detail), use the built-in router instead of local-only state. It syncs the address bar, serializes params, and restores the view on refresh or via a shared link — with no per-project sync code.

Wrap the entry's default export in `<Router>` and call `useRouter()` inside:

```jsx
import { Router, useRouter, Link } from "@agent-spaces/ui";

function App() {
  const { path, query } = useRouter();
  if (path[0] === "history") return <History filter={query.filter} />;
  if (path[0] === "detail" && path[1]) return <Detail id={path[1]} />;
  return <Generate />;
}

export default function Root() {
  return (
    <Router>
      <App />
    </Router>
  );
}
```

- `useRouter()` returns `{ path, query, push, replace, back }`. It throws if called outside `<Router>`, so the component that reads the route must be rendered inside the `<Router>` subtree.
- `push(path, query?)` / `replace(path, query?)`: `path` accepts a string (split on `/`) or an array of segments. Pass an array when a segment value may contain `/`.
- Navigate declaratively with `<Link to="history" query={{ filter: "done" }}>`; programmatic navigation with `push`/`replace`.
- The active view is derived from `path[0]` (and deeper segments); guard unknown values with a fallback to the default view so a stale/edited URL never blanks the screen.

Driving an existing host component from the route is common — bind its controlled value to the router instead of local state:

```jsx
const { path, push } = useRouter();
const routeValue = validValues.has(path[0]) ? path[0] : "buttons";
<Tabs value={routeValue} onValueChange={(v) => push(v)}>...</Tabs>;
```

Route state is single-`route` query param: path segments joined by `/`, query string appended (e.g. `/history?filter=done` → `?route=%2Fhistory%3Ffilter%3Ddone`). The host writes it into the preview iframe hash for refresh recovery and into the host page URL for shareable links; the project code does not manage `window.location` itself. It is pure client-side state — not persisted to `configs/`, `data/`, or SQLite, and orthogonal to Project Services.

Only render the active view. Avoid `.map`-ing every view into the tree (pre-rendering all tabs) when a single `<TabsContent>` keyed on the active value suffices.

## Miniapp In Workflow

Workflow miniapps can be embedded by the built-in workflow node `show_miniapp`. When editing a miniapp that will run inside a workflow, follow these rules:

- Treat route and runtime params as host-provided workflow context, not user-entered page state.
- Read route state from the built-in router (`Router` / `useRouter`) and read workflow params from the host runtime bridge.
- Do not rely on URL `query.payload` as the primary transport for workflow params. Keep query parsing only as a compatibility fallback when needed.
- The host sends runtime context with `postMessage` using `agent-spaces:mini-app-runtime:init`; the preview page exposes the same context through `window.AgentSpaces.getRuntimeContext()` / `window.AgentSpacesAPI.getRuntimeContext()`.
- When host timing matters, prefer a ready/init handshake instead of assuming one load-time message is enough. The preview iframe may need to announce readiness before the host resends runtime context.
- Keep workflow submit/cancel messaging centralized in one helper such as `src/utils/host.js`; route components should call the helper, not hand-roll `window.parent.postMessage(...)`.
- Workflow completion/continuation messages must use `agent-spaces:workflow-miniapp-submit`.

Rendering rules for `show_miniapp`:

- Normal editor state, not running: if the node enables inline display, the node should still show a placeholder instead of eagerly rendering the miniapp.
- Workflow preview mode: inline miniapps should render for real, not show the placeholder.
- Runtime with `embedDisplay=true`: render inline in the node and do not also require a separate dialog UI for the same interaction.
- Runtime with `embedDisplay=false`: the workflow host may open the miniapp in the interaction dialog.

Implementation guidance:

- If a miniapp is meant for workflow use, document the contract in `src/CLAUDE.md`: supported routes, expected runtime params, and submit payload shape.
- For demo or starter workflow miniapps, include a small debug panel that shows current route, payload source, and resolved runtime params while developing the protocol. Remove or tone down noisy console logs after the protocol stabilizes.
- If the workflow host protocol changes, update the shared bridge/helper files first (`utils/host.js`, payload/runtime helpers, preview host glue) instead of scattering protocol fixes across route components.

## Config And Data Helpers

For project-local persistence, prefer the server-side [Project Services](#project-services-server-side-writers) channel so a single writer owns `configs/` and changes fan out to every client. The direct helpers below remain available for simple projects, but they do not protect against concurrent multi-client overwrites.

Use async helpers for project-local persistence.

Config files live under the project `configs/` directory:

```js
const config = await window.AgentSpacesUI.readConfigJson("settings.json");
await window.AgentSpacesUI.writeConfigJson("settings.json", config);
```

For the last submitted selection, prefer:

```js
const last = await window.AgentSpacesUI.readLastSelection();
await window.AgentSpacesUI.writeLastSelection(value);
```

Data files live under the project `data/` directory:

```js
await window.AgentSpacesUI.saveDataFile("result.txt", text);
await window.AgentSpacesUI.downloadFile(url, "remote-file.bin");
```

The same helpers are also available on `window.AgentSpaces` and `window.AgentSpacesAPI` for compatibility.

### Workspace-Scoped Data

Miniapp config and data are project-scoped by default. If the same miniapp is enabled in multiple workspaces, a fixed path such as `board.json` is shared by all of them. For workspace-owned state, pass the current workspace id from the host iframe and include it in every persistence path.
```js
const src = `/mini-apps-preview?id=${encodeURIComponent(miniAppId)}&embedded=1&workspaceId=${encodeURIComponent(workspaceId)}`;
const workspaceId = new URLSearchParams(window.location.search).get("workspaceId") || "";
const workspacePath = (file) => workspaceId ? `workspaces/${encodeURIComponent(workspaceId)}/${file}` : file;
await window.AgentSpaces.invokeService("save", { ...payload, workspaceId });
```
- Reading `workspaceId` is host bootstrap context, not route state; continue using `Router` / `useRouter` for navigation. Keep the unscoped fallback only for standalone preview compatibility.
- Use `workspacePath(...)` with config APIs and `saveDataFile`; filter `onConfigChanged` by the full scoped path.
- Project Services must derive the identical encoded path before `ctx.readConfig`/`writeConfig`/`updateConfig`. Do not replace the miniapp `projectId`, WebSocket channel, or service registry key with `workspaceId`.
- In the workspace layout host, validate restored `mini-app:*` tabs against the workspace's configured `miniAppIds`, not an asynchronously loaded metadata list. Skip destructive tab cleanup until the workspace exists in the store, or restored tabs can disappear on refresh.

## Project Services (Server-Side Writers)

When multiple preview instances of the same project can mutate config — or any project must avoid one client's write overwriting another's — do not call `writeConfigJson` from the UI. Register server-side handlers under `src/services/` and call them with `invokeService`. The server is the single writer; every write fans out as `miniApp.configChanged`.

### Defining handlers

Each `src/services/*.js` default-exports a map of `eventName -> (payload, ctx) => result | Promise<result>`:

```js
export default {
  add_results: ({ items }, ctx) => {
    ctx.updateConfig("history.json", (prev) => merge(prev ?? [], items));
    return { ok: true };
  },
};
```

- Handlers run in **server Node**, not the browser sandbox. They cannot `import` external modules — all capability comes from `ctx`.
- `ctx.writeConfig(path, value)` / `ctx.updateConfig(path, updater)` write `configs/<path>` and broadcast `miniApp.configChanged`.
- `ctx.updateConfig` is an atomic read-modify-write; use it for append/merge so concurrent calls do not clobber each other.
- `ctx.listRunningTasks()` returns currently running tasks (each carries `executorId`); a handler like `get_queue` returns it so clients can filter the queue to tasks they initiated (`executorId === getExecutorId()`).

### Calling from the UI

```js
// RPC: await the handler's return value
await window.AgentSpaces.invokeService("add_results", { items });

// Read config from the in-memory cache (server pushes configSnapshot on connect)
const history = window.AgentSpaces.getConfig("history.json");

// Subscribe to changes (fires for every server write, on every client)
const unsub = window.AgentSpaces.onConfigChanged((path, value) => {
  if (path === "history.json") setHistory(value);
});
```

Do not also `writeConfigJson` from the initiator after `invokeService` — the server already wrote and broadcast; double-writing reintroduces the overwrite problem.

## HTML Mode

In HTML mode, plain HTML, CSS, and JavaScript are acceptable.

`window.AgentSpacesUI` and `window.AgentSpaces` are still available, but React host components are primarily intended for React mode. Keep HTML mode self-contained and avoid React-only assumptions.

## External Dependencies

Bare imports only work when mapped by the renderer.

Currently supported examples include:

- `react`
- `react-dom`
- `react-dom/client`
- `embla-carousel-react`
- `@agent-spaces/ui`

Do not copy local shims for host dependencies such as carousel, date, or chart libraries into a Workflow UI project. If a dependency is needed and not renderer-allowlisted, ask to update the host renderer or `ui-exports.ts` instead of hiding compatibility code inside the project.

For Embla carousel projects, call `emblaApi.reInit()` after React commits dynamic slide changes, then call `scrollTo()` or read navigation state.

## Loading Third-Party Bundles (Vendor Files)

When a project needs a third-party library that is **not** renderer-allowlisted (image codecs, color quantizers, zip, etc.), download a self-contained ESM bundle into `src/vendor/` and load it as a **runtime resource** — never through a Babel-compiled `import`.

### Why not static `import`

The React-mode renderer compiles every file under `src/` with Babel `transform-modules-commonjs`. That pipeline:

1. Rewrites `import`/`export` to `require`/`module.exports`.
2. Replaces every `require(...)` with the renderer's `localRequire`, which only resolves files under `src/` and allowlisted bare imports.

A vendored library is already-compiled output. Feeding it back through Babel re-compiles it and rewrites its internal `require('events')` / `require('buffer')` calls to `localRequire`, which has no Node built-ins → `Cannot read properties of undefined (reading 'EventEmitter')` and similar failures. CDN `import()` / `<script type=module>` also do not work reliably: in the Next.js/turbopack preview runtime the native dynamic `import()` of cross-origin URLs returns an empty module namespace (no `load`/`error` event fires, namespace is `{}`).

### Correct pattern: fetch + Blob URL + native dynamic import

Download the library into `src/vendor/`, then load it from the browser ESM loader without going through Babel:

```js
// src/utils/vendor.js
const cache = new Map();

export async function loadVendor(fileName) {
  if (cache.has(fileName)) return cache.get(fileName);
  const AS = window.AgentSpaces;
  if (!AS?.srcFileUrl) throw new Error('host srcFileUrl unavailable');
  // srcFileUrl -> http URL of a file under src/ (served by GET /api/mini-apps/:id/src/file?path=...)
  const url = AS.srcFileUrl('vendor/' + fileName);
  const code = await (await fetch(url)).text();
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  // Wrap import() in new Function so webpack/turbopack leaves it as a runtime call.
  const dynamicImport = new Function('u', 'return import(u)');
  const mod = await dynamicImport(blobUrl);
  cache.set(fileName, mod);
  return mod;
}

// Normalize esm.sh CJS interop: named exports often live under `default`.
function unwrap(mod) {
  if (mod?.default && typeof mod.default === 'object') {
    const { default: _drop, ...rest } = mod;
    return { ...mod.default, ...rest };
  }
  return mod;
}

export const getGifEnc = () => loadVendor('gifenc.js').then(unwrap);
```

Key points:

- `window.AgentSpaces.srcFileUrl(relPath)` returns an http URL served from the project `src/` tree — it does **not** require a Babel pass and works for any file (`.js`, `.mjs`, binary).
- `fetch` -> `Blob` -> `Blob URL` keeps the code same-origin so the browser ESM loader resolves it natively; Node polyfills inside the bundle (events/buffer) run normally.
- Wrap `import(blobUrl)` in `new Function('u','return import(u)')` so webpack/turbopack does not statically rewrite the `import()` into `require`.
- Cache the resolved module by file name; module evaluation should happen once.

### Preparing the vendor bundle

Download a self-contained ESM bundle (`?bundle` on esm.sh inlines dependencies):

```bash
mkdir -p src/vendor
curl -sL "https://esm.sh/gifenc@1.0.3/es2022/gifenc.bundle.mjs" -o src/vendor/gifuct-js.js
```

Watch for these failure modes when preparing bundles:

- **Internal cross-package imports** — `gifuct-js` depends on `js-binary-schema-parser`. Use the `.bundle.mjs` variant so the dependency is inlined; the non-bundle `.mjs` still emits `import ... from "/js-binary-schema-parser..."` which cannot resolve.
- **Node polyfills** — libraries like `image-q` / `jszip` `import` from `/node/process.mjs` and `/node/buffer.mjs`. Download those polyfills too and rewrite the import specifiers to local relative paths:
  ```bash
  curl -sL "https://esm.sh/node/process.mjs" -o src/vendor/node-process.js
  curl -sL "https://esm.sh/node/buffer.mjs"  -o src/vendor/node-buffer.js
  # Rewrite the absolute specifiers to relative paths inside image-q.js / jszip.js
  sed -i 's|"/node/process.mjs"|"./node-process.js"|g; s|"/node/buffer.mjs"|"./node-buffer.js"|g' \
    src/vendor/image-q.js src/vendor/jszip.js
  ```
- **Illegal `__esModule` export** — some esm.sh bundles end with `export { X as __esModule, ... }`. Babel (if a file ever does get compiled) rejects it; strip the `X as __esModule,` token from the export list.
- **CJS interop default collapse** — esm.sh frequently folds all named exports into a single `default` object. Always `unwrap()` so callers can `const { GIFEncoder } = await getGifEnc()` regardless of the bundle's export shape.

If the official package ships a clean ESM build, prefer it over the esm.sh bundle (e.g. `unpkg.com/gifenc@1.0.3/dist/gifenc.esm.js` exports `GIFEncoder`/`quantize`/`applyPalette` as proper named exports).

### Quick verification

Before relying on a vendored library, confirm Babel can still compile any file that *imports the loader* (not the vendor file itself), and that the runtime namespace is non-empty:

```bash
# The loader file (which does the fetch+import) must compile, but the vendor bundle is never Babel-compiled.
node --input-type=commonjs -e "require('@babel/standalone').transform(require('fs').readFileSync('src/utils/vendor.js','utf8'),{presets:['react'],plugins:['transform-modules-commonjs'],sourceType:'module'})"
```

```js
// Temporary diagnostic inside loadVendor:
console.log('[vendor] loaded', fileName, 'keys:', Object.keys(mod));
// keys should list the library's real exports (e.g. GIFEncoder, quantize, applyPalette), not []
```

Do not add the vendor bundle path to the renderer allowlist or import it statically — that re-introduces the Babel re-compilation problem. The whole point of the `fetch` + Blob URL path is to bypass the Babel pipeline for already-compiled third-party code.

## Implementation Pattern

For a React project:

```jsx
import Header from "./components/Header";

const { Card, CardContent } = window.AgentSpacesUI;

export default function App() {
  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
        <Header />
        <Card>
          <CardContent className="p-4">
            {/* UI */}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
```

For plugin calls:

```js
async function runTool() {
  const response = await window.AgentSpaces.callPluginTool(pluginId, toolName, args);
  const data = response && typeof response === "object" && "result" in response
    ? response.result
    : response;
  return data;
}
```

## Validation Checklist

Before finishing, inspect the changed files for these invariants:

- `manifest.json` still points to the intended entry file.
- Every `pluginId` passed to `callPluginTool` (including `@agent-spaces/builtin` for built-in tools) is listed in `manifest.json` `enabledPlugins`. Missing or unlisted ids are rejected by both the host API and the backend `execute` route (403).
- The entry file exports a default React component in React mode.
- Large code was split into focused files under `components/`, `hooks/`, or `utils/`.
- Local imports are relative and resolve inside `src/`.
- No relative dynamic `import()` is used anywhere in `src/` (it 404s under the `new Function` renderer). Lazy loading of local helpers is done via static top-level imports; only Blob URLs (vendored bundles) and CDN URLs may use dynamic `import()`, wrapped in `new Function('u','return import(u)')`.
- Host UI components and lucide icons come from `window.AgentSpacesUI` or `@agent-spaces/ui`, not host source paths.
- Overlay triggers (`Tooltip`/`Popover`/`Select`/`DropdownMenu`/`Menu`) use the Base UI `render` prop, never `asChild`. There must be no `asChild` anywhere in `src/` — it leaks to the DOM and nests buttons inside buttons.
- Full-height roots use parent-relative height (`h-full` / `height: 100%`), not viewport height (`h-screen` / `100vh`).
- Styling uses Tailwind `className` and theme tokens where practical.
- Light and dark themes remain readable.
- Plugin tool responses are read according to their documented output shape.
- Credentials are not collected, stored, or passed from preview UI unless explicitly required.
- Config writes go to `configs/`; generated/downloaded data goes to `data/`.
- Workspace-owned config/data uses the same encoded `workspaces/<workspaceId>/...` relative path in the UI and server service; change subscriptions compare the full scoped path.
- Shared/mutable config is written through `invokeService` + server `src/services` handlers (single writer) and read via `getConfig`/`onConfigChanged`; the initiator does not also `writeConfigJson` the same value.
- Multi-client task state uses `onTaskEvent` + the `callPluginTool` options (`taskId`, `meta`) instead of local-only queues; the initiator does not double-write results that `taskFinished` already persists.
- Routing: when views are switched, the entry is wrapped in `<Router>` (or the route-reading component is inside one), `useRouter()` is not called outside the `<Router>` subtree, unknown `path[0]` values fall back to a default view, and only the active view is rendered. The project does not read or write `window.location` directly.
- Third-party bundles under `src/vendor/` are loaded via `window.AgentSpaces.srcFileUrl` + fetch + Blob URL + native dynamic import (wrapped in `new Function`), not via static `import` (which would force them back through Babel and break their internal Node `require`s) or via CDN `import()` (which returns an empty namespace in the turbopack runtime).
- `src/CLAUDE.md` was updated if project structure or decisions changed.

Return concrete manual verification steps for the user, including which page to open, which controls to click, and what result confirms success.
