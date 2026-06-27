# Notion 插件

通过 [Notion API](https://developers.notion.com/reference/intro) 操作页面与数据库，覆盖搜索、页面增删改查与移动、数据库增删改查与查询、块内容追加/读取、机器人信息。

## 前置准备

1. 访问 https://www.notion.so/my-integrations 创建一个 **Internal Integration**，获取 `Integration Token`（以 `ntn_` 或 `secret_` 开头）。
2. 在 Notion 中打开需要操作的页面/数据库，点击右上角 `··· → Connections → 添加你的 Integration`，否则 API 会返回 `object_not_found`。
3. 在插件设置里填入 Token。

## 配置项

| 字段 | 说明 |
|------|------|
| Integration Token | 必填，Notion 内部集成 Token |
| Notion-Version | API 版本，默认 `2022-06-28`；移动页面节点会自动提升到 `2026-03-11` |
| 超时(ms) | 单次请求超时 |

## 动作一览

| 动作 | 对应 Notion API |
|------|-----------------|
| `notion_search` | [`POST /v1/search`](https://developers.notion.com/reference/post-search) |
| `notion_page_create` | [`POST /v1/pages`](https://developers.notion.com/reference/post-page) |
| `notion_page_get` | [`GET /v1/pages/{page_id}`](https://developers.notion.com/reference/retrieve-a-page) |
| `notion_page_update` | [`PATCH /v1/pages/{page_id}`](https://developers.notion.com/reference/patch-page) |
| `notion_page_move` | [`PATCH /v1/pages/{page_id}` (parent)](https://developers.notion.com/reference/move-page) |
| `notion_page_archive` | [`POST /v1/pages/{page_id}/trash`](https://developers.notion.com/reference/trash-page)（实际通过 PATCH archived） |
| `notion_database_create` | [`POST /v1/databases`](https://developers.notion.com/reference/create-database) |
| `notion_database_update` | [`PATCH /v1/databases/{database_id}`](https://developers.notion.com/reference/update-database) |
| `notion_database_get` | `GET /v1/databases/{database_id}` |
| `notion_database_query` | `POST /v1/databases/{database_id}/query` |
| `notion_block_append_children` | `PATCH /v1/blocks/{block_id}/children` |
| `notion_block_get_children` | `GET /v1/blocks/{block_id}/children` |
| `notion_block_delete` | `DELETE /v1/blocks/{block_id}` |
| `notion_me` | `GET /v1/users/me` |

## 实现说明

- 所有请求通过 `globalThis.fetch` 发起（统一处理 GET/POST/PATCH/DELETE），与 `ai-image`/`openai` 插件做法一致。
- 请求头自动注入 `Authorization: Bearer <token>` 和 `Notion-Version`。
- `notion_page_move` 会检测到需要更高 API 版本并自动提升到 `2026-03-11`，无需用户手动改配置。
- 所有 JSON 类字段（properties / children / filter 等）都做了防御式解析，支持对象或 JSON 字符串输入。

更多细节见 [docs](./docs)。
