# Eagle 插件

> 通过本地 [Eagle Web API v2](./docs/readme.md) 操作 Eagle 资源库：条目查询 / 全文搜索 / 添加 / 更新、文件夹与智能文件夹、标签与标签组、资源库切换，以及 AI 语义搜索。

## 简介

Eagle 是一款本地素材管理应用。本插件把它的 Web API v2 封装成 Workflow 节点和 Agent 工具，无需写代码即可在流程里检索、整理、归档 Eagle 资源库。

插件类型：`server`。

> **前置条件**：V2 Web API 需要 **Eagle 4.0 Build 21+**，且必须先运行 Eagle（API 服务随应用启动）。标注 / 智能文件夹相关节点需要 **Build 22+**；AI 搜索相关节点需要安装并运行 [AI Search 插件](https://eagle.cool/support/article/ai-search)。

## 配置说明

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://localhost:41595` | Eagle API 地址，会自动补全到 `/api/v2/` |
| `token` | （空） | 仅远程（局域网）访问需要；本地访问留空 |
| `timeout` | `60000` | 单次请求超时（毫秒） |

本地访问无需 token；远程访问请在 Eagle「偏好设置 → 开发者」里获取 API Token。

## 节点清单

共 **38 个节点**，按模块分组：

| 模块 | 节点（前缀 `eagle_`） |
| --- | --- |
| Item 条目 | `item_list` `item_query` `item_count` `item_add` `item_update` `item_set_thumbnail` `item_refresh_thumbnail` `item_get_comments` `item_add_comment` `item_update_comment` `item_remove_comment` |
| Folder 文件夹 | `folder_list` `folder_create` `folder_update` |
| Smart Folder 智能文件夹 | `smart_folder_list` `smart_folder_rules` `smart_folder_create` `smart_folder_update` `smart_folder_remove` `smart_folder_items` |
| Tag 标签 | `tag_list` `tag_recent` `tag_starred` `tag_rename` `tag_merge` |
| Tag Group 标签组 | `tag_group_list` `tag_group_create` `tag_group_update` `tag_group_remove` `tag_group_add_tags` `tag_group_remove_tags` |
| Library 资源库 | `library_info` `library_history` `library_switch` |
| App 应用 | `app_info` |
| AI Search 语义搜索 | `ai_status` `ai_search_text` `ai_search_base64` `ai_search_item` |

> 仅 Workflow 高频使用的节点默认同时暴露为 Agent tool（带输入源的节点）；标注、缩略图等纯 Workflow 操作设为 `tool: false`，避免污染 tool schema。

## 节点字段示例

### eagle_item_list（条件筛选列出条目）

- 入参：
  - `tags` / `folders` / `ids`：JSON 数组或逗号分隔
  - `ext`：扩展名，如 `jpg`
  - `isUntagged` / `isUnfiled`：布尔
  - `fields`：逗号分隔的返回字段（提升性能）
  - `limit`（≤1000）/ `offset`：分页
- 出参 `data`：`{ items, total, offset, limit }`

### eagle_item_query（全文搜索）

- 入参 `query` 支持高级语法：`cat dog`（AND）、`cat OR dog`（OR）、`-cartoon`（NOT）、`"orange cat"`（短语）、`(cat OR dog) cute`（分组）
- 出参 `data`：`{ items, total }`

### eagle_item_add（添加条目）

- 单条：提供 `url` / `path` / `base64` / `bookmarkURL` 之一，可选 `name` `tags` `folders` `annotation`
- 批量：`items` 填 JSON 数组（最多 1000），会覆盖单条字段
- 出参 `data`：单条返回 `{ id }`，批量返回 `{ ids }`

### eagle_smart_folder_create（创建智能文件夹）

- `conditions` 为条件组 JSON 数组，结构见 `eagle_smart_folder_rules` 输出
- 建议先用 `eagle_smart_folder_rules` 获取可用 property/method/valueType，再据此构建 conditions

### eagle_ai_status（AI 搜索就绪检查）

- 并发拉取 installed / ready / starting / syncing / syncStatus / serviceHealth
- AI 搜索前先跑这个节点确认就绪

## 使用示例

**示例 1：按标签列出条目**

1. 拖入「Eagle List Items」节点
2. `tags` 填 `["design", "inspiration"]`，`limit` 填 `20`
3. `data.items` 即为结果

**示例 2：全文搜索并归档**

1. 「Eagle Full-text Search」节点，`query = sunset`
2. 用 `data.items` 驱动后续「Eagle Update Item」批量打标签 / 移文件夹

**示例 3：AI 以图搜图**

1. 「Eagle AI Search Status」确认 ready
2. 「Eagle AI Search By Image」，`base64` 填图片数据
3. `data.results` 返回按相似度排序的 `{ item, score }`

## 常见问题

- **连接失败 / ECONNREFUSED**：Eagle 未运行，或端口被改。先 `eagle_app_info` 探活。
- **远程访问 401**：远程必须带 token；本地（localhost/127.0.0.1）免 token。
- **AI 搜索节点报错**：未安装 AI Search 插件或未就绪，先用 `eagle_ai_status` 检查。
- **智能文件夹 / 标注节点报错**：需要 Eagle 4.0 Build 22+，旧版不支持。
- **数组入参**：`tags`/`folders`/`ids` 等支持 JSON 数组字符串或逗号分隔，插件内部做了防御式解析。

## 适用场景

- 素材检索与整理自动化（按标签 / 文件夹 / 全文批量改元数据）
- 以图搜图、语义搜索驱动的素材推荐
- 资源库切换、标签合并、标签组维护
- 与 AI 出图 / 抓取流程联动，自动归档产出到 Eagle
