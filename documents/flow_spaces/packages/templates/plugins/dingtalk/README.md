# 钉钉 插件

> 通过钉钉自定义机器人 Webhook，向钉钉群发送 text / markdown / link / actionCard / feedCard 五种类型的消息。

## 简介

钉钉为群机器人提供了基于 Webhook 的消息推送能力，本插件将这一能力封装为 Workflow 动作节点。Agent / 工作流执行完成后，可以把结果以合适的格式推送到指定群聊。

插件类型：`server`。

## 前置准备

1. 在钉钉群中添加「自定义机器人」，复制系统生成的 **Webhook URL**
2. 从 URL 中获取 `access_token` 部分（必填）
3. 若机器人开启了「加签」安全设置，复制 **加签密钥**（可选，但推荐）
4. 在插件中心安装并启用本插件

> 自定义机器人的加签方式请参考 [钉钉开放文档](https://open.dingtalk.com/document/orgapp/custom-robot-access)。

## 配置说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `accessToken` | 是 | Webhook URL 中的 `access_token` 参数 |
| `secret` | 否 | 加签密钥；若机器人开启了「加签」必须填写 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `dingtalk_send` | 向钉钉群发送一条消息，支持 5 种消息类型 |

## 节点 `dingtalk_send` 字段

通用字段：

- `accessToken`、`secret`：可从插件配置继承
- `msgtype`：`text` / `markdown` / `link` / `actionCard` / `feedCard`
- `content`：消息正文（`text` 时为纯文本，`markdown` 时为 Markdown）

### text 文本

- 可选 `@atMobiles`（手机号，逗号分隔）、`@atUserIds`（userId，逗号分隔）、`isAtAll`

### markdown 文本

- 额外需要 `title`（消息标题）

### link 链接

- 必填：`title`、`messageUrl`
- 可选：`picUrl`（封面图）

### actionCard 整体跳转卡片

- 必填：`title`、`content`
- 整体按钮：填写 `singleTitle` + `singleURL`
- 多个按钮：填写 `btns`，JSON 数组，例如：
  ```json
  [{"title":"查看","actionURL":"https://example.com/a"},{"title":"关闭","actionURL":"https://example.com/b"}]
  ```
- 可选：`hideAvatar`、`btnOrientation`（水平排布）

### feedCard 多链接

- 必填：`links`，JSON 数组，例如：
  ```json
  [{"title":"新闻1","messageURL":"https://...","picURL":"https://..."},{"title":"新闻2","messageURL":"https://...","picURL":"https://..."}]
  ```

## 使用示例

**示例 1：发送一条纯文本**

```
msgtype = text
content = 任务完成
atMobiles = 13800000000
isAtAll = false
```

**示例 2：发送 Markdown 报告**

```
msgtype = markdown
title = 今日数据
content =
# 销售数据
- 总订单：1234
- 总金额：¥567,890
```

**示例 3：带按钮的 actionCard 告警**

```
msgtype = actionCard
title = 服务告警
content = ### CPU 使用率 95%
singleTitle = 立即查看
singleURL = https://grafana.example.com/d/xxx
```

## 常见问题

- **签名校验失败（310000 / sign not match）**：开启加签后必须配置 `secret`，且保证服务端时间准确。
- **`invalid robotCode` / `not your robot`**：AccessToken 错误或被复制时多 / 少了字符。
- **群里完全收不到消息**：
  1. 机器人是否被移除或停用
  2. 自定义关键词、安全设置 IP 白名单是否限制了来源
  3. 钉钉版本是否过低
- **@ 不到指定人**：`atMobiles` 必须是群里成员的手机号；`atUserIds` 是钉钉 userId（不是工号 / 邮箱）。
- **每分钟限频 20 条**：超出后会被 `isv.OverLimit` 限流，建议工作流内做节流或合并消息。

## 依赖

- 仅依赖网络访问 `https://oapi.dingtalk.com`
