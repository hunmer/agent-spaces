# Mini App Launch Params Plan

## Goal
Enable the TTS mini-app to read launch parameters and perform startup actions, then add a fixed "send to dubbing" button in the podcast generator panel.

## Assumptions
- Launch parameters are passed through URL query parameters first.
- POST-based launch parameters may need support from the renderer/server bridge if there is an existing mechanism; do not invent a large protocol without evidence.
- `multi` mode splits `text` by newline into multiple messages.

## Phases
1. Research renderer docs and relevant mini-app code. Status: complete
2. Implement TTS launch parameter parsing and startup detection. Status: complete
3. Add podcast generator fixed send button. Status: complete
4. Verify with available tests or focused build/lint checks. Status: complete

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| ESLint 9 找不到 `eslint.config.*` | `pnpm exec eslint ...` | 改用 esbuild 语法解析和 `pnpm --filter @agent-spaces/web exec tsc --noEmit --pretty false` |
