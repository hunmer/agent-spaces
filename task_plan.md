# Task Plan: Multi-Agent Coding Workspace

## Goal
Build the multi-agent collaborative coding workspace, milestone by milestone.

## Current Phase
M2 Complete — Ready for M3

## Phases

### Phase 1-6: Planning (All complete)
- Status: complete

### M1: Project Scaffold + Basic Layout
- Status: complete

### M2: Workspace + File System (IN PROGRESS)

#### M2.1: File System Backend API
- [ ] Add `GET /api/workspaces/:id/files/tree` — recursive directory listing
- [ ] Add `GET /api/workspaces/:id/files/content?path=` — read file content
- [ ] Add `PUT /api/workspaces/:id/files/content` — write file content
- [ ] Create `packages/server/src/services/file.ts` — file system operations
- [ ] Create `packages/server/src/routes/file.ts` — file API routes
- [ ] Register file routes in `app.ts`
- Status: pending

#### M2.2: .agentspace Auto-Initialization
- [ ] Expand workspace creation to create full `.agentspace/` structure (skills/, agents/, tasks/, cache/, logs/, claude.md, workspace.json)
- [ ] Add `FileNode` type to shared package for tree representation
- Status: pending

#### M2.3: File Tree UI
- [ ] Install/verify shadcn/ui components needed (ScrollArea, etc.)
- [ ] Create `packages/web/src/components/editor/file-tree.tsx` — recursive tree with folder expand
- [ ] Wire file tree to Editor panel in workspace-shell
- Status: pending

#### M2.4: Monaco Editor Integration
- [ ] Install `@monaco-editor/react` in web package
- [ ] Create `packages/web/src/components/editor/code-editor.tsx` — Monaco instance with file loading/saving
- [ ] Create `packages/web/src/components/editor/editor-tabs.tsx` — multi-file tab switching
- [ ] Create `packages/web/src/stores/editor.ts` — editor state (open files, active file)
- [ ] Wire editor + tabs to Editor panel in workspace-shell
- Status: pending

#### M2.5: Integration Verification
- [ ] Verify file tree loads from bound directory
- [ ] Verify file open → Monaco editor shows content
- [ ] Verify file save → content persisted to disk
- [ ] Verify .agentspace directory created on workspace creation
- Status: pending

## Key Questions
(See findings.md for full list)

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use file-based planning documents in the project root | Requested workflow |
| Treat PRD as the authoritative source | No other implementation exists |
| Monaco via `@monaco-editor/react` | Standard React wrapper, zero config |
| File tree as custom component | Lightweight, no heavy dependency needed |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None yet for M2 | - | - |

## Notes
- Planning files live in `/Users/Zhuanz/Documents/agent_spaces`.
- M1 delivered: monorepo, shared types, Express + WS, Next.js + FlexLayout shell.
