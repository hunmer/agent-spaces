## REST API 汇总

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/skills` | 列出全部 Skill（含 `boundAgents`） |
| PUT | `/api/skills/:name` | 更新 `SKILL.md` 内容 |
| DELETE | `/api/skills/:name` | 删除整个 Skill 目录 |
| POST | `/api/skills/:name/favorite` | 切换收藏 |
| GET | `/api/skills/:name/files` | 列出 Skill 内文件树 |
| GET | `/api/skills/:name/files/{*filePath}` | 读取 Skill 内某文件 |
| PUT | `/api/skills/:name/files/{*filePath}` | 写入 Skill 内某文件 |
| POST | `/api/skills/:name/reveal` | 在系统文件管理器中打开 |
| POST | `/api/skills/import` | 单文件导入 |
| POST | `/api/skills/import-batch` | 批量导入 |
| POST | `/api/skills/import-store` | 从内置 Skill Store 导入 |
| POST | `/api/skills/import-git` | 从 Git 仓库导入 |
| GET | `/api/skills/sync-check` | 检查 Agent Skill 副本与全局库的差异 |
| POST | `/api/skills/sync` | 一键同步指定 Skill 到对应 Agent |

所有 Skill 接口均挂载在 `packages/server/src/routes/skill.ts`，受全局 Bearer Token 鉴权保护。

## WebSocket 事件

Skill 系统当前未定义专用的 WebSocket 事件——Skill 的增删改不通过 WS 广播。前端在执行写操作后通过 SDK 返回值或重新拉取 `GET /api/skills` 刷新列表。