# Task Plan: game-asset-canvas 组输出自动绑定

## Goal
为 game-asset-canvas 增加组级输入连线与过滤配置，并将来源组匹配节点的当前输出自动应用到目标组的“按上传素材执行”。

## Current Phase
Phase 15 complete

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

## Decisions
- 配置字段：`agentChatPlacement?: "dock" | "mini-app-slot"`，缺省等同 `dock`。
- Chat 状态、会话和权限继续归宿主管理，mini-app 只提供 DOM 插槽与 tab 切换。
- 插槽协议挂在 `window.AgentSpaces`，使用注册/注销和订阅机制，避免 DOM 轮询。
- 工具优化同时修复数据输入兼容、并发分组快照、删除成员清理三条根因，不改节点业务模型。
- 连线问题以用户提供的 8 组 source/target 和指定 workspace canvas.json 为验收样本。
- 组过滤模式为全部、指定节点、按节点类型多选；绑定只消费来源节点当前输出。
- 绑定关系持久化在目标组 `batchExecution.assets.binding`，自动素材 run 标记为 `group-output-binding`。
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
