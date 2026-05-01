# Task Plan: Multi-Agent Coding Workspace

## Goal
Create an actionable implementation plan for the PRD-defined local multi-agent collaborative coding workspace.

## Current Phase
M1 Complete — Ready for M2

## Phases

### Phase 1: Requirements Baseline
- [x] Read `PRD.md`
- [x] Extract core product goals, roles, state models, storage rules, and UI modules
- [x] Record findings in `findings.md`
- **Status:** complete

### Phase 2: Architecture Definition
- [x] Define frontend/backend/package structure
- [x] Define workspace, `.agentspace`, `share/`, issue, task, and agent session data models
- [x] Define WebSocket event contracts and state transitions
- [x] Define filesystem and Git service boundaries
- [x] Verify and map selected libraries: FlexLayout, xterm.js, OpenAI Codex, open-agent-sdk-typescript, and react-dev-inspector
- **Status:** complete

### Phase 3: MVP Scope Breakdown
- [x] Split PRD into MVP, post-MVP, and future extension scope
- [x] Define first usable vertical slice
- [x] Identify implementation milestones and acceptance criteria
- [x] Map each milestone to user-visible behavior
- **Status:** complete

### Phase 4: Backend Implementation Plan
- [x] Plan Express API routes and WebSocket channels
- [x] Plan local JSON persistence layout
- [x] Plan workspace binding and `.agentspace` claiming rules
- [x] Plan scheduler, planner, executor, reviewer, and hook orchestration
- [x] Plan Codex and Claude Code adapter boundaries
- [x] Plan xterm.js backend PTY/session streaming protocol
- [x] Plan Git branch, diff, commit, and PR integration boundaries
- **Status:** complete

### Phase 5: Frontend Implementation Plan
- [x] Plan Next.js app routes and shell layout
- [x] Plan workspace tabs, left panel, right panel, and bottom dock using FlexLayout
- [x] Plan channel chat, issue center, Monaco editor, terminal, and Git panel modules
- [x] Plan xterm.js terminal tabs, resize handling, and WebSocket binding
- [x] Plan Codex, Claude Code, VSCode debug/inspection dock panels
- [x] Plan shadcn/ui component usage and state management
- **Status:** complete

### Phase 6: Risk, Testing, and Delivery Plan
- [x] Identify security and filesystem risks
- [x] Define test strategy for backend services, WebSocket flows, state transitions, and UI workflows
- [x] Define delivery checklist and documentation outputs
- [x] Record unresolved questions for product decisions
- **Status:** complete

## Key Questions
1. What is the exact MVP boundary for the first usable version?
2. Should the first version support real agent process spawning, or mock agent execution behind stable interfaces?
3. Which Git providers must be implemented first: GitHub, GitLab, or both?
4. What is the required persistence schema for workspaces, issues, tasks, channels, messages, and agent sessions?
5. How should `.agentspace` ownership be enforced when a workspace binds multiple local directories?
6. What terminal implementation should be used for local shell sessions and WebSocket streaming?
7. What safety constraints, if any, should apply despite the PRD saying file operations are unrestricted?
8. How should FlexLayout state be persisted per workspace and restored across sessions?
9. Which exact Codex and Claude Code SDK/runtime APIs should be wrapped by backend adapters?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use file-based planning documents in the project root | The requested workflow explicitly uses persistent planning files generated from `PRD.md`. |
| Treat PRD as the authoritative source for the initial plan | No other project files or implementation exist in the workspace yet. |
| Plan the product in architecture, MVP, backend, frontend, and verification phases | The PRD spans product flows, agent orchestration, storage, UI, and integrations, so the plan needs separate tracks. |
| Use user-supplied libraries as preferred implementation candidates | The user provided concrete repositories for dock layout, terminal, Codex, Claude Code, and VSCode inspection/debug integration. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None | 1 | No errors encountered while creating the initial plan. |

## Notes
- Planning files live in `/Users/Zhuanz/Documents/agent_spaces`.
- `PRD.md` currently defines product intent but does not yet define API contracts, schema details, or exact MVP acceptance criteria.
- Keep web or third-party research out of `task_plan.md`; write external findings to `findings.md`.
- User-supplied GitHub links should be verified during Phase 2 before finalizing implementation contracts.
