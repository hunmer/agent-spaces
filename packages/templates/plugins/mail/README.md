# 邮件发送 插件

> 通过 SMTP 协议发送邮件，支持 HTML / 纯文本、附件、抄送 / 密送。

## 简介

本插件基于 [nodemailer](https://nodemailer.com/) 封装 Workflow 邮件发送节点，可以对接任意标准 SMTP 服务（Gmail / Outlook / QQ 邮箱 / 阿里邮箱 / 自建 SMTP 等）。

插件类型：`server`。

## 前置准备

1. 准备一个可用的 SMTP 账号（用户名 + 密码 / 授权码）
2. 确认 SMTP 服务地址与端口：
   - `465`：SSL（默认）
   - `587`：STARTTLS
3. 在 Agent Spaces 插件中心安装并启用本插件

> 各大邮箱通常需要在「设置 → 账户」中开启 SMTP 服务并生成专用「授权码」（不是登录密码）。

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `host` | 是 | — | SMTP 服务器地址，如 `smtp.gmail.com` |
| `port` | 否 | `465` | SMTP 端口，`465=SSL`，`587=TLS` |
| `user` | 是 | — | SMTP 登录用户名 |
| `pass` | 是 | — | SMTP 登录密码或授权码 |
| `from` | 否 | — | 默认发件人地址，形如 `Name <email@example.com>` |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `mail_send` | 通过 SMTP 发送一封邮件 |

## 节点 `mail_send` 字段

**入参**：

- `host`、`port`、`user`、`pass`、`from`：可从插件配置继承
- `to`：收件人，多个用英文逗号分隔（必填）
- `cc`：抄送，多个用逗号分隔
- `bcc`：密送，多个用逗号分隔
- `subject`：主题（必填）
- `body`：正文（必填）
- `html`：是否按 HTML 渲染正文，默认 `false`（纯文本）
- `attachments`：JSON 数组，元素为文件绝对路径，例：`["/path/to/a.pdf"]`

**出参 `data`**：

- `messageId`：SMTP 返回的 Message-ID
- `response`：服务器响应字符串

## 使用示例

**示例 1：发送纯文本通知**

```
to      = user@example.com
subject = 任务完成
body    = 你的工作流已成功执行完毕
```

**示例 2：发送 HTML 报告**

```
to      = boss@example.com
subject = 周报
html    = true
body    = <h1>本周数据</h1><ul><li>订单：1234</li><li>金额：¥567,890</li></ul>
```

**示例 3：发送带附件的邮件**

```
to          = partner@example.com
subject     = 项目交付物
body        = 详见附件。
attachments = ["/tmp/report.pdf", "/tmp/data.xlsx"]
```

## 常见问题

- **535 Authentication failed**：用户名 / 授权码错误，或邮箱未开启 SMTP / 未生成授权码。
- **Gmail 拒绝登录**：Gmail 自 2022 年起不再支持「安全性较低的应用」，必须使用 **App Password**。
- **自签证书报错**：在 `port=587` 时可尝试 `secure: false`（依赖 STARTTLS）。
- **被识别为垃圾邮件**：避免大量链接、敏感词；使用真实发件域名并配置 SPF / DKIM。
- **附件太大被拒**：SMTP 协议 + 邮件服务商通常限制在 20~50 MB。

## 常用 SMTP 配置参考

| 服务商 | Host | 端口 |
| --- | --- | --- |
| Gmail | `smtp.gmail.com` | `465` |
| Outlook / Office 365 | `smtp.office365.com` | `587` |
| QQ 邮箱 | `smtp.qq.com` | `465` |
| 163 邮箱 | `smtp.163.com` | `465` / `994` |
| 阿里云邮箱 | `smtp.aliyun.com` | `465` |

## 依赖

- 运行时依赖：`nodemailer` ^8.0.7
