# 模块职责

SDK 由 39 个 API 模块适配器组成，按业务域划分。以下是各模块的职责说明。

## 核心 API 模块

### workspace（工作空间）
- 工作空间 CRUD（创建/读取/更新/删除）
- 通知设置（获取/更新/启动/停止/测试）
- Prompt 管理（获取/更新）
- 文件夹浏览与权限检查
- Git Clone（SSE 流式）
- Reveal 目录、创建文件夹、读取文件

### agent（Agent 预设）
- Agent 预设 CRUD
- 用量仪表盘数据
- AI 生成 Agent 配置（design、generateFromPrompt）
- Prompt 优化（optimizePrompt）
- 连接测试（testConnection）
- 同步到所有工作空间

### channel（频道）
- 频道 CRUD
- 消息管理（获取/清除/删除单条）
- 频道状态
- 附件上传
- 工具调用详情查询

### issue（Issue）
- Issue CRUD
- 生命周期操作（start/resume/continue/interrupt）
- 评论管理（列表/添加/删除/更新）

### task（Task）
- Task CRUD
- 重试与取消
- 排序（reorder）

### git（Git 操作）
- 基本操作：status/diff/log/commit/push/pull/fetch
- 分支管理：branches/checkout/createBranch/deleteBranch
- 暂存区：stage/unstage/discard/discardAll
- 远程仓库：remotes/addRemote/remoteUrl
- 高级操作：cherryPick/createTag/reset/mergeBase
- 冲突解决：resolveFile
- AI 生成提交信息
- Git 配置读写
- 操作历史

### editor（编辑器）
- 文件树与文件内容读写
- 编辑器状态持久化（打开的文件/活动文件/固定文件）
- 代码搜索
- 文件操作：exists/reveal/copy/delete/rename
- 导入：URL 导入/本地路径导入/文件上传

### llm（LLM 模型/供应商）
- 模型 CRUD
- 供应商 CRUD

### workflow（Workflow）
- Workflow CRUD + duplicate
- SSE 流式执行
- 文件夹管理
- 版本管理（列表/添加/获取/删除/清除）
- 执行日志（列表/获取/删除/清除）
- 操作历史（加载/保存/清除）
- 暂存区（加载/保存/清除）
- Workflow Agent 聊天（加载/保存/清除）

### workflow-plugin（Workflow 插件）
- 插件列表（全部/仅工作流插件）
- 启用/禁用/卸载/从商店安装
- 获取工作流节点定义
- 插件配置读写
- 插件方案管理（列表/创建/读取/保存/删除）

### mini-app（Workflow UI 项目）
- 项目 CRUD
- 文件树与文件内容读写
- 配置文件读写
- 数据文件写入
- ZIP 导入导出
- 头像上传

### kanban（看板）
- 获取/保存看板数据（列/任务/布局/标题）

### database（文档数据库）
- 数据库 CRUD
- 文档节点 CRUD（含移动/回收站/恢复）
- 向量搜索（统计/索引/搜索）
- 节点版本历史
- AI 聊天（SSE 流式）

### worktree（Git Worktree）
- Worktree 列表/创建/删除
- 创建 PR
- 合并
- Diff 查看

## 配置与工具模块

### hooks（Hook）
- Hook CRUD
- 上传 Hook
- 应用 Hook 到其他工作空间

### command（快速命令）
- 命令 CRUD
- 启动/停止

### subscription（订阅）
- 订阅 CRUD
- 配额查询

### notification（通知）
- 通知列表
- 标记已读/清除全部

### speech（语音识别）
- 语音识别配置 CRUD

### code-favorites（代码收藏）
- 代码收藏列表/创建/删除

### prompts（Prompt 模板）
- 模板 CRUD
- Agent 列表
- 应用模板到 Agent

### skills（Skills）
- Skills 列表/保存/删除
- 收藏切换
- 批量导入（store/Git/批量）
- 同步检查与执行
- Skill 文件管理（列表/获取/保存）

### mcps（MCP 服务器）
- MCP 服务器列表/保存/删除
- 收藏切换
- JSON 导入

### npm-settings（NPM 设置）
- 获取/更新 NPM registry 和 proxy 配置

### output-styles（输出风格）
- 模板 CRUD
- Agent 列表
- 应用到 Agent

### tools（内置工具）
- 工具列表
- 启用/禁用

### robot-accounts（机器人账号）
- 账号 CRUD（飞书/微信）
- 微信二维码登录流程

### auth（认证）
- 登录（secretKey）
- Token 验证
- 头像上传
- 修改密钥

### data（数据导入导出）
- ZIP 导入导出（含预览与执行）
- cc-switch 迁移（预览/执行）

### version（版本）
- 当前版本
- 检查更新
- 触发更新

### search（搜索）
- 代码搜索
- 文件搜索

### agent-store（Agent 商店）
- 从外部 URL 获取 Agent 索引

### font（字体）
- 字体列表/上传/删除
- Base64 上传

### inspector（DOM Inspector）
- Inspector 跟踪（免认证）

### avatar（头像）
- 获取/上传头像

### agent-commands（Agent 命令）
- 跨 Agent 命令列表
- Agent 命令 CRUD
- 应用到多个 Agent

### chat（Chat Agent 独立聊天系统）
- Chat Agent CRUD
- 消息管理
- 工作空间/工作目录文件树
- Chat Workspace CRUD
- Chat Session CRUD
- 工作空间状态持久化
