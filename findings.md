# Findings

- `workflow-node-sidebar.tsx` 通过 `workflowPluginSchemeApi.list(workflow.id, pluginId)` 加载方案，并把选中项存到 `workflow.pluginConfigSchemes[pluginId]`。
- `mini-app-preview.tsx` 只持有插件字段定义并打开 `WorkflowPluginConfigDialog`，没有方案列表/选中状态。
- 当前命名与 API 表明多配置方案能力耦合在 Workflow；需继续检查服务端持久化及 Mini App 数据模型，判断应下沉到通用插件配置 API 还是增加宿主级绑定。
- 工作区已有用户修改：Mini App/Workflow 数据 manifest、一个 workflow.json 及其 `plugin_configs/`，不得覆盖或回退。
- 服务端 Workflow 执行器按 `workflow.pluginConfigSchemes` 读取 Workflow 目录内的命名方案；读取失败才回退插件全局默认配置。
- Mini App 项目模型只有 `enabledPlugins`，插件工具执行路径调用 `pluginService.getPluginConfig(pluginId)`，不存在方案选择与透传。
- 因而当前多配置不是插件基础能力。正确闭环至少包含：插件级命名方案持久化/API、通用切换 UI、Mini App 的方案选择持久化、执行时应用所选方案；Workflow 应迁移为复用插件级方案。
- 采用全局插件方案 + 宿主选择映射：方案可跨 Workflow/Mini App 复用，同时不同宿主可独立选择。
- 旧 Workflow `plugin_configs/` 数据通过侧栏首次加载或执行时自动复制到插件级方案；旧接口暂留作兼容读取。
