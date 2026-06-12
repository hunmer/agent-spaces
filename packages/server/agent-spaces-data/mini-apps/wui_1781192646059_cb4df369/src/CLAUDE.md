# SonicAI - AI 音乐播放器

> 基于 code.html 视觉设计，使用 React + AgentSpacesUI 组件构建的 AI 音乐播放器。

## Project Overview

SonicAI 是一个 AI 音乐播放器应用，具有沉浸式视觉效果（动态渐变背景、波形可视化、Material Design 图标），集成了 MiniMax 音乐生成 API，用户可以通过描述音乐风格来生成独一无二的音乐。

## File Structure

- `index.jsx` — 入口组件，主布局（播放器 + 底部创作按钮 + 配置持久化逻辑 + 红心状态管理 + 播放列表/索引/模式管理 + 生成中 Alert 提示）
- `components/Background.jsx` — 动态渐变背景（三色光斑 + 噪点叠加）
- `components/Player.jsx` — 播放器核心 UI（封面+标题左侧列、歌词面板右侧列、悬浮红心/下载、波形可视化进度条（可点击跳转、占满宽度）、播放控制、播放模式切换、音量调节 Popover；播放列表图标定位在下一首按钮右侧）
- `components/PlaylistPopover.jsx` — 播放列表弹窗（Popover，点击播放、翻页、每页50条，歌曲右侧红心收藏切换；使用 CSS 变量 `--theme-accent` 管理主题色）
- `components/MusicGenerator.jsx` — AI 音乐创作面板（Dialog 弹窗，包含风格描述、歌词（带 AI 生成图标）、模型选择、纯音乐开关；生成时立即关闭对话框）
- `hooks/useAudioPlayer.js` — 音频播放状态管理（加载、播放/暂停、进度追踪、跳转、音量控制、replay 重播、onEnded 回调）
- `DESIGN.md` — Apple Music 设计系统 token 参考
- `code.html` — 原始 HTML 参考文件

## Key Design Decisions

1. **视觉还原**：使用 Tailwind 任意值语法（如 `bg-[#ff4dc3]`）复刻 code.html 的 Apple Music 风格深色主题
2. **AgentSpacesUI 图标**：所有图标使用 Lucide React 图标（通过 `window.AgentSpacesUI` 解构），不依赖 Google Material Symbols 字体
3. **AgentSpacesUI 组件**：使用 Dialog、Button、Textarea、Select、Switch、Label、Card、Popover、Alert 等组件；封面使用 Card + Music 图标占位
4. **音频管理**：自定义 `useAudioPlayer` hook 处理音频生命周期，支持自动播放新生成的音乐、音量控制、onEnded 回调
5. **音乐生成**：通过 `window.AgentSpaces.callPluginTool` 调用 `workflow.minimax` 插件的 `minimax_music_generation` 工具
6. **播放历史持久化**：音乐生成后通过 `writeConfigJson('music-history.json')` 写入记录，播放列表通过 `readConfigJson` 读取
7. **播放列表**：使用 Popover 组件展示，支持翻页（每页50条），点击可播放
8. **布局**：页面 `h-screen overflow-hidden` 不滚动，创作按钮固定在底部居中，波形进度条可点击跳转播放位置
9. **歌词面板**：始终显示在专辑封面右侧，无切换按钮；歌词通过 `\n` 分割后用 `<p>` 标签渲染；无歌词时显示"暂无歌词"占位；歌词面板高度与封面+标题区域对齐
10. **控制栏对齐**：所有控制按钮统一使用 `flex items-center justify-center w-10 h-10` 确保垂直居中
11. **顶部导航**：已移除，页面仅保留播放器和创作按钮
12. **红心收藏**：封面悬浮红心图标可点击切换当前歌曲收藏状态（通过 `likedSongs` Set 管理），播放列表每首歌曲右侧显示红心图标，点击可切换
13. **下载按钮**：封面悬浮更多图标已替换为下载图标（Download），点击 `window.open` 打开歌曲链接
14. **进度条间距**：进度条区域增加了下边距（mb-6）
15. **布局结构**：歌曲标题和副标题移至封面图下方（左侧列），歌词面板在右侧与封面同顶部对齐
16. **歌词数据流**：生成音乐时 `MusicGenerator` 将歌词传入 `onGenerate` 回调，`index.jsx` 将歌词存入 `currentLyrics` 状态和历史记录；从列表播放时也加载歌词
17. **播放模式**：左侧播放模式按钮，循环切换「顺序播放 → 单曲循环 → 随机播放」，图标分别为 Repeat / Repeat1 / Shuffle；非顺序模式下按钮高亮为主题色 `var(--theme-accent)`
18. **切歌逻辑**：SkipBack（若当前播放 >3s 则重启当前曲目，否则切上一首，支持循环）、SkipForward（随机模式随机选曲，其他模式按顺序下一首，末尾循环回第一首）
19. **音量调节**：右侧音量按钮（Volume2/Volume1/VolumeX 图标），点击弹出 Popover 展示音量 range 滑块，点击图标可快速静音/恢复
20. **生成中提示**：点击生成音乐后立即关闭对话框，页面右上角展示 Alert 提示「正在生成中」，生成完成（成功或失败）后自动隐藏
21. **播放列表管理**：`index.jsx` 加载 `music-history.json` 作为播放列表，跟踪 `currentIndex`，歌曲结束时根据 `playMode` 决定下一步操作
22. **控制栏布局**：控制栏宽度 `max-w-3xl` 与封面+歌词区域对齐，歌单图标（PlaylistPopover）位于下一首按钮右侧
23. **单曲循环重播**：使用 `replay()` 方法（seek 0 + play）而非 `loadAudio(同URL)`，避免 React 状态未变化导致不触发重渲染
24. **主题色管理**：通过 CSS 变量 `--theme-accent: #d6143a`（定义在 index.jsx style 标签）统一管理主题色，PlaylistPopover 等组件使用 `text-[var(--theme-accent)]` 引用，避免硬编码

## Dependencies

- **插件**: `workflow.minimax` — MiniMax 音乐生成（apiKey 和 baseUrl 由插件配置自动注入）
- **UI**: AgentSpacesUI（Dialog, Button, Textarea, Select, Switch, Label, Card, Popover, Alert, Lucide 图标等）

## Notes

- `apiKey` 和 `baseUrl` 参数由插件配置自动注入，调用 `callPluginTool` 时无需传递
- 波形条高度通过 `useMemo` 随机生成，保证组件重渲染时保持一致；波形可点击跳转播放位置
- 波形进度条使用 `flex-1` 占满可用宽度，条数 80 根，主题色通过 CSS 变量 `--theme-accent` 管理
- 背景动画 `pulseBlur` 关键帧定义在 index.jsx 的 `<style>` 标签中（Tailwind 无法表达 keyframe）
- 封面图片使用 Card 组件 + Music 图标占位，不依赖外部图片资源
- 所有图标使用 Lucide（通过 `window.AgentSpacesUI` 解构），已移除 Google Material Symbols 字体依赖
- 播放历史存储在 `configs/music-history.json`，格式为 `{ id, audioUrl, title, artist, prompt, lyrics, createdAt }[]`
- 已移除 Range 进度条，改用波形可视化作为可点击的进度条，占满可用宽度
- `useAudioPlayer` 的 `onEndedRef` 暴露给父组件，父组件通过直接赋值 ref 注册歌曲结束回调，避免闭包过期
- 单曲循环模式使用 `replay()` 方法重播（直接 seek 到 0 并 play），不经过 `setAudioUrl` 以避免同 URL 不触发 effect 的问题
- 主题色 `#d6143a` 统一定义为 CSS 变量 `--theme-accent`，所有组件通过 `var(--theme-accent)` 引用，便于全局修改
