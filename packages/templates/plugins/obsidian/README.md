# Obsidian 插件

通过 [Obsidian Local REST API](https://coddingtonbear.github.io/obsidian-local-rest-api/) 连接 Obsidian Vault，支持在 WorkFox 工作流和 Agent 工具中读写笔记、搜索、补丁、执行命令。

## 前置条件

1. 在 Obsidian 中安装并启用 **Local REST API** 社区插件。
2. 打开 **Settings → Local REST API**，复制 API Key。
3. 默认 HTTPS 端口 `27124`（自签名证书）。若无法信任证书，可在此页面开启 **Enable HTTP server**，使用端口 `27123`。

## 插件配置

| 字段 | 说明 | 默认 |
|------|------|------|
| API Key | Local REST API 鉴权令牌（必填） | — |
| 协议 | `https` 或 `http` | `https` |
| 主机 | Obsidian 主机 | `127.0.0.1` |
| 端口 | HTTPS `27124` / HTTP `27123` | `27124` |
| 校验 TLS 证书 | 默认关闭（Obsidian 自签名证书） | `false` |
| 超时(ms) | 请求超时 | `30000` |

## 提供的节点 / 工具

| Action | 说明 |
|---|---|
| `obsidian_status` | 检查服务连通性与 API Key |
| `obsidian_vault_list` | 列出目录内容 |
| `obsidian_vault_read` | 读取笔记（可指定 heading/block/frontmatter） |
| `obsidian_vault_write` | 创建或覆盖笔记（可仅替换某 section） |
| `obsidian_vault_append` | 追加内容 |
| `obsidian_vault_patch` | 精细补丁（append/prepend/replace × heading/block/frontmatter） |
| `obsidian_vault_delete` | 删除文件 |
| `obsidian_search_simple` | 全文模糊搜索 |
| `obsidian_search_query` | JsonLogic 结构化搜索（仅工作流节点） |
| `obsidian_command_list` | 列出命令面板命令 |
| `obsidian_command_execute` | 执行命令 |
| `obsidian_tags_list` | 列出标签 |
| `obsidian_open_file` | 在 Obsidian 中打开文件 |
| `obsidian_active_file` | 获取当前活动文件路径 |

## 关于自签名证书

Obsidian Local REST API 的 HTTPS 端点使用自签名证书。本插件默认关闭 TLS 校验（`rejectUnauthorized=false`），通过 `undici.Agent` 注入到 fetch。

如需严格校验，可在配置中开启「校验 TLS 证书」并先在系统中信任 Obsidian 证书（从 `https://127.0.0.1:27124/obsidian-local-rest-api.crt` 下载）。
