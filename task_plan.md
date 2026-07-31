# Task Plan

## Goal
让 Mini App HoverCard 复用插件多配置切换能力，并明确/修正该能力的归属层级。

## Phases
- [complete] 1. 检查 Mini App、Workflow 和插件配置的数据/组件调用链
- [complete] 2. 确定最小下沉方案并实现
- [complete] 3. 补充或调整测试，运行针对性验证
- [complete] 4. 总结架构结论与验收步骤
- [complete] 5. 在 Workflow 插件卡片接入插件方案切换并验证
- [complete] 6. 为所有工作流执行入口增加本次执行级插件配置覆盖
- [complete] 7. 设计 Mini App 工作流选择与配置文件约定
- [complete] 8. 实现 Host API、WorkflowListDialog 配置模式和预览入口
- [complete] 9. 将 Mini App 内直接使用 WorkflowListDialog 的代码迁移到 Host API
- [complete] 10. 验证选择、配置持久化和执行注入闭环
- [complete] 11. 追踪变量选择器与 `__config__` 运行时注入链
- [complete] 12. 实现“插件 → 配置名 → 配置项”菜单及表达式生成
- [complete] 13. 注入默认配置与所有命名配置并保持旧路径兼容
- [complete] 14. 回归测试、构建并通过 procm-mcp 重启持久化服务
- [in_progress] 15. 构造并发 workflow-nodes HTTP 复现并定位模块加载竞态
- [pending] 16. 在正确加载边界串行化/去重插件模块初始化
- [pending] 17. 回归测试、构建并重启 procm Server

## Decision
- 插件状态持久化命名配置方案；宿主（Workflow/Mini App）仅保存每个插件当前选中的方案名。
- 通用 UI 负责列出、新建、删除、选择与打开编辑；两种宿主复用。
- 插件执行 API 接受可选配置覆盖，Mini App 按项目选择注入，Workflow 执行按选择加载插件方案。
- 工作流执行新增 `pluginConfigs`：键支持插件 ID/显示名，值支持方案名或配置对象；只影响本次执行且优先级最高。
- Mini App 工作流配置落在项目 `data` 目录，Host API 负责选择工作流、创建/读取配置并在执行时自动注入。
- `__config__[pluginId][field]` 继续表示默认/当前生效配置；命名配置通过 `__config__[pluginId][schemeName][field]` 读取。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| `mini-app-tools.ts` import 上下文不匹配，组合补丁未应用 | 1 | 读取实际文件头后拆分补丁 |
| 服务端直接 build 命中 shared 旧产物的 runtime/tool 枚举错误 | 1 | 按根构建顺序先重建 shared，再复验 server |
| `tsx -e` 冒烟测试以 CJS 解析纯 ESM shared 包失败 | 1 | 改用已编译的 ESM 服务端产物测试 |
| 通用配置组件组合补丁 hunk 格式错误，未应用 | 1 | 拆分为独立文件补丁 |
| Web 全量 `tsc --noEmit` 命中仓库既有 dropzone/tiptap/图表等类型错误 | 1 | 核对错误列表，本次修改文件均未出现；改用针对性 ESLint 与依赖包构建验收 |
| 新增命名配置模板测试仍返回原模板字符串 | 1 | 预期红灯；现有解析器只接受两段方括号，进入通用路径解析实现 |
| Web + Server 组合补丁在解析器正则处上下文不匹配 | 1 | 整体未应用；拆分为独立小补丁 |
| 解析器小补丁仍因手写捕获组上下文不匹配 | 2 | 已读取函数精确文本，改为完整函数替换 |
| Server build 读取 shared 旧产物，缺少 `WorkflowExecuteRequest.pluginConfigs` | 1 | 按既有构建顺序先重建 shared，再复验 server |
| procm 首次启动时旧独立 Web 进程仍占用 3000 | 1 | Server 已启动；停止确认属于项目的旧 Web 树后通过 procm restart 整体重启 |
