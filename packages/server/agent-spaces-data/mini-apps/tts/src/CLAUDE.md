# 配音工作流 UI 项目

## 项目概述

Agent Spaces Workflow UI 项目 —— 多服务商 TTS（文本转语音）配音工具。用户输入文本、选择服务商与音色、调节参数后一键合成语音并在线试听。

支持的服务商：
- **MiniMax** — `workflow.minimax` / `minimax_tts`
- **FishAudio** — `workflow.fish-audio` / `fish_audio_tts`
- **千音** — `workflow.qianyin` / `qianyin_tts`

## 技术栈

- **React**（CDN 全局变量，无构建步骤）
- **Agent Spaces UI 组件库**（`window.AgentSpacesUI` 提供 Card、Button、Slider、Select 等组件）
- **Agent Spaces Plugin Tool API**（`window.AgentSpaces.callPluginTool` 调用 TTS 插件）
- **Agent Spaces Config API**（`window.AgentSpacesUI.readConfigJson` / `writeConfigJson` 持久化配置）

## 文件结构

```
src/
├── index.jsx                    # 入口组件 App，状态管理中心；单/多人模式 tabs、服务商切换、组合子组件
├── components/
│   ├── VoiceSelector.jsx        # 音色选择器（搜索、卡片网格、添加/删除/试听；multi 模式右下角「添加为角色」按钮）
│   ├── ParameterPanel.jsx       # 参数面板（语速、音量、语调、情绪等，按服务商动态渲染）
│   ├── BackgroundMusic.jsx      # 背景音乐（单人模式，本地混音，随主音频同步播放）
│   ├── PlayerBar.jsx            # 单人模式播放栏（开始配音、音频播放器、错误提示，置于单人 tab 下）
│   └── MultiVoicePanel.jsx      # 多人配音面板（角色列表、消息增删改、试听、批量合成、批量下载）
└── utils/
    ├── providers.js             # 服务商定义（PROVIDERS）、默认音色/参数、情绪列表、buildTTSArgs / extractAudioUrl / genId
    ├── config.js                # 配置读写（persistProviderStates / persistMultiState）
    └── styles.js                # 内联样式对象（含单人/多人模式样式）
```

其他项目文件：
- `manifest.json` — Workflow UI 项目描述，入口 `index.jsx`，类型 `react`
- `configs/config.json` — 运行时持久化的用户配置（模式、文本、服务商、音色列表、参数值、多人角色 roles、多人消息 messages）

## 架构设计

### 状态管理

所有状态集中在 `App` 组件（`index.jsx`），通过 props 分发给子组件：

| 状态 | 说明 |
|---|---|
| `mode` | 配音模式：`single` 单人 / `multi` 多人 |
| `provider` | 当前选中的服务商 key（minimax / fishaudio / qianyin），两种模式共用，控制音色库筛选 |
| `providerStates` | 各服务商独立状态（voices、voiceId、speed 等参数） |
| `text` | 单人模式待配音文本 |
| `loading` / `audioUrl` / `error` | 单人模式 TTS 生成流程状态 |
| `roles` | 多人模式角色列表：`{ id, name, icon, provider, voiceId }` |
| `messages` | 多人模式消息列表：`{ id, roleId, text, audioUrl, status, error }` |

### 数据流

```
用户操作 → App 更新 state → props 下发给子组件
        → 同时调用 persistProviderStates() 写入 config.json
```

### TTS 调用流程

1. `handleGenerate` 按服务商构建参数 `args`
2. 调用 `window.AgentSpaces.callPluginTool(pluginId, toolName, args)`
3. 从返回结果中按优先级提取音频 URL：
   - `result.data.audioUrl` → MiniMax
   - `result.data.httpPath` → FishAudio
   - `result.data.fileUrl` → 千音
   - 其他兼容格式兜底
4. 设置 `audioUrl` 触发 `<audio>` 播放

### 配置持久化

- 启动时 `readConfig()` 加载所有服务商的音色列表和参数
- 每次音色增删、参数变更时自动调用 `persistProviderStates()` 保存
- 配置路径：`configs/config.json`

## 设计决策

1. **单文件状态集中** — 项目规模适中，无需引入状态管理库，所有状态提升到 App 组件
2. **服务商隔离** — `providerStates` 按 provider key 分区存储，切换服务商时无需重新加载
3. **URL 提取链** — 兼容不同服务商的返回格式，按优先级逐级尝试
4. **试听功能** — 音色卡片内通过 `new Audio(url).play()` 直接播放，不占用主音频播放器
5. **hover 交互** — 删除和试听按钮仅在 hover 时显示，保持界面简洁

## 关键约定

- UI 组件统一从 `window.AgentSpacesUI` 解构，不使用 import
- 样式使用内联对象（`utils/styles.js`），不使用 CSS 文件
- 文件最大文本长度限制 10000 字符
- 所有插件调用通过 `window.AgentSpaces.callPluginTool` 进行
