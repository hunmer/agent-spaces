# GalGenAI Live2D 伙伴（miniapp）

> 从 `D:\galgenai`（Vite + zustand + @google/genai）迁移为 agent-spaces Workflow UI 项目。

## 项目概述

Live2D 虚拟角色对话应用。底部对话框 + Live2D 角色 + 模型库 + 历史记忆 + 设置。

**核心改动**（相对原 galgenai）：

| 能力 | 原实现 | 迁移后 |
|------|--------|--------|
| LLM 对话 | `@google/genai` 直连 Gemini 2.5 Flash | `@agent-spaces/builtin/agent_run`（preset 由用户在设置里选） |
| 语音合成 | `services/ttsService.ts`（浏览器原生 + MiniMax + Custom GET） | `text_to_voice` 工作流（id `820bf3b7-9d50-4f6d-966d-8e442960a233`），经 `@agent-spaces/builtin/execute_workflow_sync` 调用 |
| 状态持久化 | `zustand persist`（localStorage） | `configs/*.json` + `src/services/state.js`（服务端单写者） |
| Live2D 依赖 | `import * as PIXI` + `import { Live2DModel }` | CDN 运行时注入，`window.PIXI` / `PIXI.live2d.Live2DModel` |
| 视图路由 | `currentView` 局部状态 | `currentView` 局部状态（不持久化，永远从 chat 开始） |

## 文件结构

```
src/
  index.jsx                 # 入口：组装 4 个视图
  hooks/
    useGalgenaiStore.js     # 中央状态 hook（settings.json + state.json 镜像）
  components/
    Live2DViewer.jsx        # PIXI Live2D 渲染（CDN 加载 + 模型加载/动作）
    ChatInterface.jsx       # 对话框：buildAgentPrompt + runAgent + synthesizeSpeech
    SettingsPanel.jsx       # AI 预设选择 + TTS(provider+voiceId) + 人设管理
    HistoryPanel.jsx        # 当前会话 + 归档历史
    ModelLibrary.jsx        # Eikanya 模型库浏览/收藏/历史
  utils/
    constants.js            # 工作流 ID、内置插件 id、TTS provider、默认背景/人设/仓库
    cdn-loader.js           # 动态加载 live2d core + pixi + pixi-live2d-display
    agent.js                # listAgentPresets / buildAgentPrompt / runAgent
    tts.js                  # cleanTextForTTS / synthesizeSpeech / playAudioUrl
    repo.js                 # parseRepoData（Eikanya 仓库 JSON 解析）
  services/
    state.js                # 服务端单写者：add_message/clear_messages/archive_session/delete_history
manifest.json              # enabledPlugins: ["@agent-spaces/builtin"]
```

## 能力链 / 外部依赖

| 能力 | 调用方式 |
|------|----------|
| 列出 AI 预设 | `callPluginTool('@agent-spaces/builtin', 'list_agent_presets', {})` → `{presets:[{id,name,runtimeKind,...}]}` |
| 对话生成 | `callPluginTool('@agent-spaces/builtin', 'agent_run', { agentConfigId, prompt, permissionMode })` → `{result: string}` |
| 语音合成 | `callPluginTool('@agent-spaces/builtin', 'execute_workflow_sync', { workflow_id, input:{prompt,model,voiceId}, max_wait_ms })` → `{steps:[...], status}` |
| 设置读写 | `readConfigJson/writeConfigJson('settings.json')` |
| 当前会话/历史 | `invokeService('add_message'/'clear_messages'/'archive_session'/'delete_history')` + `getConfig/onConfigChanged('state.json')` |
| Live2D 运行时 | CDN：`dylanNew/live2d`、`cubism.live2d.com`、`pixi.js@6.5.10`、`pixi-live2d-display@0.4.0` |

`@agent-spaces/builtin` 是宿主内置虚拟插件，经 `packages/server/src/routes/plugin.ts` 识别后走 `executeMiniAppBuiltinTool`（见 `packages/server/src/services/builtin-tools/mini-app-tools.ts`）。

## 关键设计决策

- **agent_run 替代 Gemini**：agent_run 没有原生 history/systemInstruction 参数，全部通过 `buildAgentPrompt` 拼进 prompt（人设 + 用户名 + 动作标签规则 + 最近 10 条历史 + 本次输入）。动作标签 `[MotionName]` 仍由 AI 在回复开头输出，`ChatInterface` 解析后调 `triggerMotion`。
- **TTS 走工作流而非内置**：移除浏览器原生 / MiniMax / Custom GET 三种 TTS UI，统一用 `text_to_voice` 工作流。设置里只暴露 `ttsProvider`(fish-audio/minimax/qianyin) + `ttsVoiceId`。`extractAudioUrlFromWorkflow` 兼容三种 provider 的返回字段（minimax=audioUrl / fish-audio=httpPath / qianyin=fileUrl）。
- **Live2D CDN 注入**：renderer 未 allowlist pixi，必须运行时 `loadLive2DDeps()` 动态插入 `<script>`。依赖顺序固定：cubism2 core → cubism4 core → pixi.js → pixi-live2d-display。`pixi-live2d-display@0.4.0` 只兼容 pixi v6，CDN 锁定 `pixi.js@6.5.10`。
- **状态分层**：`settings.json`（用户偏好，UI 端直接读写，单用户场景不并发）vs `state.json`（messages+history，服务端单写者，多预览实例一致）。Live2D 瞬态（availableMotions/motionToPlay）只在内存。
- **WebGL 探测保留**：miniapp 预览在沙箱 iframe，WebGL 可能被禁用；沿用原 galgenai 的 context attributes 探测逻辑，失败时显示明确错误而非白屏。
- **尺寸用父容器**：原代码用 `window.innerWidth`，miniapp 嵌套时尺寸会错；改用 `canvasRef.parentElement.clientWidth/Height` 和 `resizeTo: parent`。

## 状态契约

**settings.json**（UI 端 writeConfigJson）：
```json
{
  "userName": "Master",
  "backgroundUrl": "...",
  "prompts": [{"id","name","content"}],
  "currentPromptId": "...",
  "models": [{"id","name","url","scale","xOffset","yOffset"}],
  "currentModelId": "...",
  "repositories": [{"id","name","url"}],
  "libraryCache": [...],
  "libraryLastUpdated": 0,
  "favoriteModels": [{"id","name","url","timestamp"}],
  "recentModels": [...],
  "ttsProvider": "minimax",
  "ttsVoiceId": "",
  "agentConfigId": "..."
}
```

**state.json**（服务端 services/state.js 维护）：
```json
{ "messages": [{"id","role","content","timestamp"}], "history": [[...], ...] }
```

## 注意事项

- `agent_run` 会创建真实 agent runtime（Claude Code/Codex 等），开销大于单次 chat；prompt 明确「不使用工具、不执行命令、只输出对话」收敛行为（见 `buildAgentPrompt`）。
- 未选 AI 预设时，发送会被拦截并跳转到设置页。
- 首次启动可能需要几秒加载 4 个 CDN 脚本；Live2DViewer 顶部会显示「正在加载 Live2D 运行时…」。
- Eikanya 仓库较大（数百模型），首次打开模型库需拉取并解析，缓存到 `libraryCache`。
