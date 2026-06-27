# 飞书 插件

> 通过飞书开放平台 Node SDK（`@larksuiteoapi/node-sdk`）向指定群聊或用户发送消息，支持文本、富文本、图片、消息卡片、文件、音视频等消息类型，并提供文件上传能力。

## 简介

飞书开放平台为应用提供了完整的 IM 消息能力。本插件基于官方 Node SDK 封装，自动处理 tenant_access_token 获取与续期，把「发消息」和「上传文件」封装为 Workflow 动作节点。工作流或 Agent 执行完成后，可把结果以合适的格式推送到指定群聊或个人。

插件类型：`server`。

## 前置准备

1. 前往 [飞书开放平台](https://open.feishu.cn/app/) 创建一个「企业自建应用」
2. 在「凭证与基础信息」页面拿到 **App ID**（`cli_` 开头）和 **App Secret**
3. 在「权限管理」中开通所需权限，至少包含：
   - `im:message:send_as_bot`（以应用身份发消息）
   - `im:resource`（上传文件/图片）
4. （可选）在「机器人」菜单中启用机器人能力，以便在群聊中添加该应用
5. 把目标应用添加进群，或获取目标用户的 `chat_id` / `open_id` / `user_id` / `email`

> SDK 参考文档见 [node-sdk](https://github.com/larksuite/node-sdk)，消息接口总览见 [发送消息](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create)。

## 配置说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `appId` | 是 | 飞书企业自建应用 App ID（`cli_` 开头） |
| `appSecret` | 是 | 飞书企业自建应用 App Secret |
| `domain` | 否 | `feishu`（国内，默认）或 `lark`（海外） |

配置项可在插件设置中统一填写，节点字段会自动从配置继承，也可在每个节点单独覆盖。

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `feishu_send_message` | 向群聊/用户发送一条消息 |
| `feishu_upload_file` | 上传本地/远程文件，返回 `file_key` |

## 节点 `feishu_send_message`

### 通用字段

- `appId` / `appSecret` / `domain`：可从插件配置继承
- `receiveIdType`：`chat_id` / `open_id` / `user_id` / `email`
- `receiveId`：消息接收者 ID
- `msgType`：`text` / `post` / `image` / `interactive` / `share_chat` / `share_user` / `file` / `audio` / `media` / `sticker` / `overflow`

### text 文本

- `text`：纯文本正文
- 可选 `at`（open_id 列表，逗号分隔）、`atAll`

### post 富文本

- `post`：富文本 JSON，结构见 [富文本消息](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/im-v1/message/create-document)
  ```json
  {
    "zh_cn": {
      "title": "标题",
      "content": [
        [{ "tag": "text", "text": "第一行" }],
        [{ "tag": "a", "text": "链接", "href": "https://example.com" }]
      ]
    }
  }
  ```

### image 图片

- `imageKey`：图片 `image_key`（需先通过飞书图片接口或本插件上传得到）

### interactive 消息卡片

- `card`：交互卡片 JSON，可用 [消息卡片搭建工具](https://open.feishu.cn/document/ukTMukTMukTM/uYzM3QjL2MzN04iNzcDN/message-card-builder) 生成

### file / audio / media / sticker

- `fileKey`：`file_key`
- `media` 额外需要 `imgKey`（视频封面）

### share_chat / share_user

- `shareChatId` / `shareUserId`

## 节点 `feishu_upload_file`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `filePath` | 是 | 本地文件路径或 `http(s)` 链接 |
| `fileType` | 否 | `opus`=音频、`mp4`=视频、`pdf`/`doc`/`xls`/`ppt`/`stream`，默认 `stream` |
| `fileName` | 否 | 文件名（含扩展名），默认 `file` |

返回 `data.file_key`，可继续用于发图片/文件/视频消息。

## 使用示例

**示例 1：发送纯文本到群**

```
receiveIdType = chat_id
receiveId = oc_xxxxxxxxxxxxxxxx
msgType = text
text = 任务已完成
```

**示例 2：@某人 + 文本**

```
receiveIdType = chat_id
receiveId = oc_xxxxxxxxxxxxxxxx
msgType = text
text = 请确认
at = ou_xxxxxxxx
```

**示例 3：发送 Markdown 卡片**

```
receiveIdType = chat_id
receiveId = oc_xxxxxxxxxxxxxxxx
msgType = interactive
card = {
  "header": { "template": "blue", "title": { "content": "每日报告", "tag": "plain_text" } },
  "elements": [ { "tag": "markdown", "content": "- 订单：1234\n- 金额：¥5678" } ]
}
```

**示例 4：上传文件并发送**

1. `feishu_upload_file`：`filePath = /data/report.pdf`，得到 `file_key`
2. `feishu_send_message`：`msgType = file`，`fileKey = {{ 上一步.data.file_key }}`

## 常见问题

- **`99991663` / `99991661` token 错误**：App ID / App Secret 填错，或应用未发布可见范围。
- **`230002` 权限错误**：应用未开通 `im:message:send_as_bot`，或机器人未加入目标群。
- **`230001` 无权限**：`receive_id` 不属于当前应用可见范围，确认应用已加入对应群/对应用户可见。
- **图片/文件消息 `file_key` 无效**：`file_key` 必须通过飞书接口上传得到，不能用普通 URL。
- **海外租户**：`domain` 选 `lark`，并确认域名能访问 `open.larksuite.com`。

## 依赖

- `@larksuiteoapi/node-sdk`（首次使用时会自动安装）
- 运行环境需能访问 `open.feishu.cn`（国内）或 `open.larksuite.com`（海外）
