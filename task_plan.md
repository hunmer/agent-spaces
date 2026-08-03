# Task Plan: game-asset-canvas 组输出自动绑定

## Goal
按指定 README 本地化帧播放器 dist，并重构视频编辑器的帧选区、双播放器 Tabs 与动画组创建流程。

## Current Phase
Phase 41 complete

## Phases

### Phase 1: 数据路径梳理
- **Status:** complete

### Phase 2: 配置字段传递
- **Status:** complete

### Phase 3: Host Slot 与 Portal
- **Status:** complete

### Phase 4: RightPanel Chat 接入
- **Status:** complete

### Phase 5: 验证与交付
- **Status:** complete

### Phase 6: Session 工具调用分析
- **Status:** complete

### Phase 7: 工具优化实现
- **Status:** complete

### Phase 8: 验证与交付
- **Status:** complete

### Phase 9: Edge 数据与渲染链路诊断
- **Status:** complete

### Phase 10: 批量连线修复
- **Status:** complete

### Phase 11: 8 条边持久化与显示验证
- **Status:** complete

### Phase 12: 参考实现与现有数据链路定位
- **Status:** complete

### Phase 13: 组连线、过滤配置与持久化实现
- **Status:** complete

### Phase 14: 自动绑定执行链实现
- **Status:** complete

### Phase 15: 定向验证与交付
- **Status:** complete

### Phase 16: 过滤对话框空状态崩溃修复
- **Status:** complete

### Phase 17: mini-app createPortal 运行时兼容修复
- **Status:** complete

### Phase 18: 目标组连线手柄命中修复
- **Status:** complete

### Phase 19: 节点头部与属性应用链路定位
- **Status:** complete

### Phase 20: 分组内批量应用属性实现
- **Status:** complete

### Phase 21: 定向验证与交付
- **Status:** complete

### Phase 22: 素材实例目标范围纠正
- **Status:** complete

### Phase 23: 素材 run 属性同步实现
- **Status:** complete

### Phase 24: 回归验证与交付
- **Status:** complete

### Phase 25: 视频拆帧参数链路诊断
- **Status:** complete

### Phase 26: 最小修复与回归覆盖
- **Status:** complete

### Phase 27: 用户视频实测
- **Status:** complete

### Phase 28: 交付
- **Status:** complete

### Phase 29: 帧间隔模式实现
- **Status:** complete

### Phase 30: 静态与真实视频验证
- **Status:** complete

### Phase 31: 交付
- **Status:** complete

### Phase 32: 全部素材实例执行链设计
- **Status:** complete

### Phase 33: 运行所有与缩略图状态实现
- **Status:** complete

### Phase 34: 执行时序回归验证
- **Status:** complete

### Phase 35: 秒间隔抽帧实现
- **Status:** complete

### Phase 36: 秒间隔真实视频验证
- **Status:** complete

### Phase 37: 秒间隔抽帧交付
- **Status:** complete

### Phase 38: README 与现有播放器结构分析
- **Status:** complete

### Phase 39: dist 本地化与通用播放器实现
- **Status:** complete

### Phase 40: 视频编辑器交互重构
- **Status:** complete

### Phase 41: 定向验证与交付
- **Status:** complete

## Decisions
- 使用固定 `@mediamonks/fast-image-sequence@2.2.0` CDN dist 的入口+核心 chunk，本地 HTTP URL 原生 dynamic import。
- 当前帧选区持久化到 `data.frameSelection`，主帧预览和新建动画组共享。
- 帧列表单击设置起点，Ctrl/Cmd+单击设置终点；新建动画组直接消费当前起止选区。
- 秒间隔模式字段为 `params.secondsInterval`，支持大于 0 的小数；通过 `fps=1/N` 按时间均匀采样。
- 帧间隔模式字段为 `params.interval`，取大于等于 1 的整数；N=1 等价全部原始帧。
- 视频拆帧新增 `all` 模式输出全部原始帧；`fps` 继续表示每秒抽取张数，避免破坏既有配置。
- 配置字段：`agentChatPlacement?: "dock" | "mini-app-slot"`，缺省等同 `dock`。
- Chat 状态、会话和权限继续归宿主管理，mini-app 只提供 DOM 插槽与 tab 切换。
- 插槽协议挂在 `window.AgentSpaces`，使用注册/注销和订阅机制，避免 DOM 轮询。
- 工具优化同时修复数据输入兼容、并发分组快照、删除成员清理三条根因，不改节点业务模型。
- 连线问题以用户提供的 8 组 source/target 和指定 workspace canvas.json 为验收样本。
- 组过滤模式为全部、指定节点、按节点类型多选；绑定只消费来源节点当前输出。
- 绑定关系持久化在目标组 `batchExecution.assets.binding`，自动素材 run 标记为 `group-output-binding`。
- 分组属性应用的正确目标是“按上传素材执行”的其他素材 run 中同一 nodeId 的节点快照，不是画布分组内其他节点。
- `groupAssetInputUrls` 标记的分组素材在目标节点上保留，来源节点同类素材不作为人工上传图传播。
- “运行所有”按 execution runs 串行，单个 run 内的可执行节点并行；每轮完成后保存 nodeStates，最终恢复原 activeId。
- 组连线使用矩形落点判断并持久展示虚线箭头；循环绑定被拒绝。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| 差异复核工具脚本出现 `Unexpected token '/'` | 1 | 拆成无嵌套引号的独立命令执行 |
| Web 全量 `tsc --noEmit` 失败 | 1 | SDK build 后本次相关错误已消失；剩余均为仓库既有类型错误 |
| 第二个 Next dev 服务启动失败 | 1 | Next 单目录开发锁禁止并行；保留现有 3000 服务，其健康检查为 200 |
| planning 完成检查器误报 5/0、0/0 | 2 | 按模板改为 `### Phase` + `**Status:** complete` |
| RPC 自查修正补丁上下文未匹配 | 1 | 读取精确行后缩小补丁范围 |
| `tsx --eval` 不支持 CJS 顶层 await | 1 | 改用 async IIFE 执行真实加载验证 |
| 开发态 `tsx` 导入 server 时 shared 无 exports | 2 | 构建 shared/server 后从正式 dist 入口验证 |
| 新增纯函数测试无法解析 `./constants` | 1 | 将 `group-execution.js` 的既有 ESM import 补为 `./constants.js` |
| 根目录执行 ESLint 找不到 flat config | 1 | 改用 `packages/web/eslint.config.mjs` 所在包执行定向 lint |
| 对话框关闭状态读取 `null.filter` | 1 | `undefined === undefined` 误入已有绑定分支，增加 binding/state 显式非空判断 |
| `react-dom.createPortal` 运行时不是函数 | 1 | renderer 将 react-dom 映射为 react-dom/client；拖线预览改为可清理的原生 SVG overlay |
| 最终组合验证脚本正则引号解析失败 | 1 | 简化为普通文本搜索后重新执行完整验证 |
| localhost:3000 健康检查超时 | 1 | mini-app 源码刷新即生效；当前无 procm-mcp，不启动或重启宿主服务 |
| Phase 25 追加补丁上下文未命中 | 1 | 发现其他任务已追加 Phase 25-31，改为读取当前规划并从 Phase 32 继续 |
| 运行所有结构测试未匹配条件文案 | 1 | 按实际 JSX 条件表达式改为匹配 `'运行所有'` 字符串 |
| 视频编辑器组合补丁在默认数据上下文未命中 | 1 | 补丁整体未应用；拆为 Dialog 与 canvas defaults 两次精确修改 |
| 默认数据与交接文档组合补丁在目录树未命中 | 1 | 补丁整体未应用；默认数据与文档分开修改 |
