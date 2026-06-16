# 网络请求 插件

> 通用 HTTP 网络请求插件，支持抓取网页文本、下载网络文件（图片 / 音频 / 二进制）以及批量并发下载。

## 简介

本插件在 Workflow 中暴露最常用的两类网络能力：**文本抓取** 和 **文件下载**。无需写代码即可拉取远端数据，适合对接 API、抓取网页、采集素材等场景。

插件类型：`server`。

## 配置说明

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultTimeout` | `30000` | 全局请求超时（毫秒） |
| `userAgent` | `workflow/1.0` | 默认 `User-Agent` 请求头 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `fetch_text` | 请求 URL 并返回文本内容（HTML / JSON / 纯文本） |
| `fetch_buffer` | 下载网络文件并返回 Buffer（图片 / 音频 / 二进制） |
| `fetch_buffers` | 并发批量下载多个文件，逐项返回结果 |

## 节点字段

### fetch_text

- 入参：
  - `url`：目标 URL（必填）
  - `headers`：自定义请求头（JSON 对象）
  - `encoding`：响应编码，默认 `utf-8`
  - `timeout`：超时（毫秒），默认 30000
- 出参 `data`：
  - `text`：响应正文
  - `url`：原 URL

### fetch_buffer

- 入参：
  - `url`：文件 URL（必填）
  - `headers`：自定义请求头
  - `timeout`：超时（毫秒），默认 60000
- 出参 `data`：
  - `buffer`：二进制内容
  - `size`：字节数
  - `mimeType`：MIME 类型
  - `url`：原 URL

### fetch_buffers

- 入参：
  - `urls`：URL 数组（必填），例：`["https://a/1.png", "https://a/2.png"]`
  - `headers`：自定义请求头
  - `timeout`：单文件超时，默认 60000
- 出参 `data`：
  - `results`：每项含 `{ url, success, size, mimeType, error? }`
  - `total`：总数
  - `successCount`：成功数

## 使用示例

**示例 1：抓取网页 HTML**

1. 拖入「Fetch Web Content」节点
2. `url = https://example.com`
3. 把 `data.text` 丢给后续的 HTML 解析节点

**示例 2：下载单张图片**

1. 拖入「Download File」节点，`url` 填图片地址
2. 拿到 `data.buffer` 后用「File System」节点写入本地

**示例 3：批量下载素材**

1. 拖入「Batch Download Files」节点，`urls` 填入数组
2. 通过 `data.successCount` 判断是否有失败
3. 失败的项可从 `data.results[i].error` 拿到原因

## 常见问题

- **403 / 401 Unauthorized**：网站做了反爬，请在 `headers` 里加 `User-Agent`、`Referer`、`Cookie` 等。
- **SSL 错误**：自签证书或过期证书会导致抓取失败，请联系对方更新证书。
- **下载超大文件**：`fetch_buffer` 会把整份内容加载到内存；大文件请使用支持流式下载的节点（如 `ffmpeg` 配合 `http(s)` 输入）。
- **并发过高被封**：`fetch_buffers` 是并发执行，如目标站点有频率限制，请降低并发或自行排队。
- **响应是 gzip / br 压缩**：插件会自动解压，无需手动处理。

## 适用场景

- 调用第三方 HTTP / REST API
- 抓取公开网页内容
- 批量下载素材（图片、音频、模型权重等）
