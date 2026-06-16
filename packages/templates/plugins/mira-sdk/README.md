# Mira SDK 插件

> 通过 [Mira App Server SDK](https://www.npmjs.com/package/mira-app-server) 在 Workflow 中调用 Mira 应用服务器的能力：素材库管理、文件上传下载、插件管理、设备通信、系统监控、数据库查询、标签 / 文件夹等。

## 简介

Mira 是一套围绕「素材库 / 设备 / 插件」的本地应用服务器，配套提供了官方的 JS SDK。本插件把 SDK 的常用能力封装为 Workflow 动作节点，让 Agent / 工作流可以直接驱动 Mira 实例。

插件类型：`server`。

## 前置准备

1. 部署 Mira App Server（默认监听 `8081` 端口）
2. 准备一个 Mira 账号
3. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | 是 | `http://localhost:8081` | Mira App Server 地址 |
| `username` | 否 | — | 登录用户名（与 `token` 二选一） |
| `password` | 否 | — | 登录密码 |
| `token` | 否 | — | 已有 Token（与用户名密码二选一） |
| `timeout` | 否 | `15000` | 请求超时（毫秒） |

> 所有节点的「Server URL / Username / Password / Token / Timeout」都会从插件配置继承，单独覆盖即可切换账号 / 服务器。

## 节点清单（按模块）

### 系统

| 节点 | 用途 |
| --- | --- |
| `mira_system_health` | 健康检查 |
| `mira_system_wait_ready` | 等待服务器就绪（带超时与间隔） |
| `mira_system_info` | 获取系统信息 |

### 认证 & 用户

| 节点 | 用途 |
| --- | --- |
| `mira_auth_login` | 用用户名 / 密码登录 |
| `mira_user_info` | 获取当前登录用户信息 |

### 素材库

| 节点 | 用途 |
| --- | --- |
| `mira_libraries_list` | 获取所有素材库 |
| `mira_library_create_local` | 创建本地素材库 |
| `mira_library_create_remote` | 创建远程素材库 |
| `mira_library_start` | 启动素材库 |
| `mira_library_stop` | 停止素材库 |
| `mira_library_restart` | 重启素材库 |

### 文件

| 节点 | 用途 |
| --- | --- |
| `mira_file_upload` | 上传文件到素材库 |
| `mira_file_download` | 下载文件（保存到本地或返回文本） |
| `mira_file_delete` | 删除文件 |
| `mira_file_search` | 按标题搜索文件 |

### 插件

| 节点 | 用途 |
| --- | --- |
| `mira_plugins_list` | 获取所有已安装插件 |
| `mira_plugin_toggle` | 启用 / 禁用指定插件 |

### 数据库

| 节点 | 用途 |
| --- | --- |
| `mira_database_tables` | 获取数据库表列表 |
| `mira_database_query` | 查询表数据 |

### 设备

| 节点 | 用途 |
| --- | --- |
| `mira_devices_list` | 获取已连接设备 |
| `mira_device_send_message` | 向设备发送消息 |
| `mira_device_broadcast` | 向素材库内所有设备广播消息 |

### 标签 & 文件夹

| 节点 | 用途 |
| --- | --- |
| `mira_tags_list` | 获取素材库下的标签 |
| `mira_folders_list` | 获取素材库下的文件夹 |
| `mira_folder_create` | 在素材库下创建文件夹 |

## 节点字段速查

### mira_system_wait_ready

- `timeout`：等待超时（毫秒），默认 30000
- `interval`：检查间隔（毫秒），默认 1000

### mira_auth_login

- `username`、`password`（必填）
- 登录成功后会替换 SDK 单例，**重置 token**

### mira_library_create_local

- `name`（必填）、`path`（必填，本地目录）、`description`

### mira_library_create_remote

- `name`、`path`、`host`、`port`（默认 8080）、`description`

### mira_library_start / stop / restart

- `libraryId`（必填）

### mira_file_upload

- `libraryId`（必填）
- `filePath`：本地文件绝对路径（必填）
- `tags`：英文逗号分隔
- `folderId`：目标文件夹 ID（可选）

### mira_file_download

- `libraryId`、`fileId`（必填）
- `savePath`：填了则保存到本地；留空则返回文本内容

### mira_file_search

- `libraryId`、`keyword`（必填）

### mira_plugin_toggle

- `pluginId`（必填）
- `action`：`enable` / `disable`

### mira_database_query

- `tableName`（必填）

### mira_device_send_message

- `clientId`、`libraryId`、`message`（必填）
- `message` 支持 JSON 字符串或对象

### mira_device_broadcast

- `libraryId`、`message`（必填）

### mira_folder_create

- `libraryId`、`name`（必填）
- `parentId`：父文件夹 ID，留空则在根目录创建

## 使用示例

**示例 1：登录后上传文件**

1. 「Login」节点 → 用户名密码登录
2. 「List Libraries」 → 拿到 `libraryId`
3. 「Upload File」：
   ```
   libraryId = xxx
   filePath  = /Users/me/photo.png
   tags      = travel, 2025
   ```

**示例 2：向某设备推送任务**

1. 「List Devices」 拿 `clientId`
2. 「Send Device Message」：
   ```
   clientId  = dev-001
   libraryId = lib-001
   message   = {"type":"render","payload":{"id":"job-42"}}
   ```

**示例 3：批量向库内所有设备广播**

- 「Broadcast to Library」：`libraryId = lib-001`、`message = {...}`

## 常见问题

- **未登录或 token 过期**：先调一次「Login」，或在插件配置中填好 `token`。
- **Server URL 错误**：浏览器先打开 `http://localhost:8081` 确认 Mira 是否运行。
- **上传超大文件失败**：当前实现一次性读入内存；大文件请使用 Mira 客户端 / 优化分割。
- **广播消息无响应**：确认目标设备已绑定到该 `libraryId`，并保持在线。
- **Token 不安全**：尽量使用「Server URL + Token」组合而不是把用户名 / 密码写在节点里。

## 依赖

- 运行时依赖：`mira-app-server`（SDK）
