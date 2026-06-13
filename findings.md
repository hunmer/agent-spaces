# Mini App Launch Params Findings

## Research Notes
- `docs/mini-app-renderer.md` 说明了 renderer 的运行方式、宿主桥接 API、配置与服务端 service 机制，但未定义通用的 URL 启动参数执行协议。
- 当前任务更适合在 mini-app 项目内增加一层启动参数解析，而不是改 renderer 核心。
- `packages/server/agent-spaces-data/mini-apps/podcast_generator/src/components/PodcastPanel.jsx` 当前只有顶部复制按钮，底部区域尚未预留固定操作栏。
- `window.AgentSpaces.onTaskEvent` 在宿主层只转发 allowlist 内的事件；TTS 若通过 service 广播自定义启动事件，需要把事件名加入 `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`。
- mini-app preview 页面本身会保留 URL query，因此 TTS 可以直接从 `window.location.search` 读取启动参数，无需改 renderer。
- POST 场景可通过 mini-app service 路由 `POST /api/mini-apps/:id/services/invoke` 调用 `launch_tts`，由服务端广播 `miniApp.ttsLaunch` 给前端。
