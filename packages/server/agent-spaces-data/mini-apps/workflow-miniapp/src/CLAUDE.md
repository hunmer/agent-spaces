# workflow-miniapp

## Project Overview

`workflow-miniapp` is the demo miniapp used by the built-in workflow node `show_miniapp`.

It currently includes 3 routes:

- `/welcome`
- `/approval`
- `/survey`

The miniapp is designed for workflow-hosted usage first:

- workflow route comes from the host router bridge
- workflow params come from the host runtime bridge
- submit results go back to the workflow host through `postMessage`

## File Structure

- `index.jsx`
  Entry point. Mounts the built-in `Router`.
- `components/AppShell.jsx`
  Top-level layout, route switching, debug panel, payload resolution.
- `components/WelcomeRoute.jsx`
  `/welcome` demo route. Shows summary info and submits a start/continue result.
- `components/ApprovalRoute.jsx`
  `/approval` demo route. Submits approval or rejection.
- `components/SurveyRoute.jsx`
  `/survey` demo route. Submits a selected answer and note.
- `utils/payload.js`
  Runtime/query payload helpers. Reads workflow params from the host runtime bridge and keeps query parsing as a compatibility fallback.
- `utils/host.js`
  Centralized workflow submit bridge. Sends miniapp submit messages to the host.

## Runtime Contract

### Route

- Route is controlled by the host through the built-in router bridge.
- The miniapp should read route state from `Router` / `useRouter`.
- `getRouteStateFromLocation()` exists as a fallback to recover route state from the URL when needed.

### Params

- Primary source: host runtime bridge.
- Read workflow params from:
  - `window.AgentSpaces.getRuntimeContext()`
  - `window.AgentSpacesAPI.getRuntimeContext()`
  - `window.__AGENT_SPACES_MINIAPP_RUNTIME__` as fallback
- Runtime updates are broadcast inside the iframe with the `agent-spaces:mini-app-runtime` event.
- `query.payload` is compatibility fallback only. Do not treat it as the primary transport.

### Submit back to workflow

- Workflow continuation messages must use `agent-spaces:workflow-miniapp-submit`.
- Route components should call `submitWorkflowMiniApp(payload)` from `utils/host.js`.
- Do not scatter raw `window.parent.postMessage(...)` calls across route components.

## Rendering Behavior In Workflow

When this miniapp is used by `show_miniapp`:

- Normal editor state, not running:
  the node may show a placeholder instead of rendering the iframe.
- Workflow preview mode:
  inline miniapp should render for real.
- Runtime with `embedDisplay=true`:
  miniapp should render inline in the workflow node.
- Runtime with `embedDisplay=false`:
  the host may show the miniapp in the workflow interaction dialog.

## Key Design Decisions

- Keep the workflow protocol centralized in `utils/payload.js` and `utils/host.js`.
- Prefer host runtime bridge over URL payload transport.
- Keep query-based payload parsing only for backward compatibility and debugging.
- Use a small debug surface in `AppShell.jsx` while the workflow protocol is still evolving.

## Dependencies

- `@agent-spaces/ui`
  for `Router`, `useRouter`, `parseRoute`
- `window.AgentSpacesUI`
  for host UI components
- `window.AgentSpaces` / `window.AgentSpacesAPI`
  for runtime context access

## Notes

- If workflow params change shape, update `utils/payload.js` and the route readers together.
- If the host message protocol changes, update `utils/host.js` first.
- If runtime bridge behavior changes, update `utils/payload.js` and `components/AppShell.jsx` before touching individual route components.
