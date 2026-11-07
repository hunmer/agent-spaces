# 订阅源解析 插件

> 订阅源（Feed）解析器：抓取并解析 RSS / Atom / RDF / JSON Feed，返回结构化内容。设计参考 [Feedsmith](https://feedsmith.dev)，核心能力是「保留原始结构 + 智能归一化」。

## 简介

本插件在 Workflow 中提供两个节点，覆盖「抓取 → 解析」完整链路：

- **抓取订阅源（feed_fetch）**：输入 URL，抓取原始文本，自动探测格式
- **解析订阅源内容（feed_parse）**：把原始文本解析为结构化对象（标题 / 条目 / 作者 / 日期等）

支持 RSS 2.0、Atom 1.0、RDF (RSS 1.0)、JSON Feed 1.x 四种主流格式，可自动识别也可手动指定。

插件类型：`server`。解析能力由 [feedsmith](https://feedsmith.dev) 提供，通过 `package.json` 的 `dependencies` 声明，加载时由宿主自动 `npm install`。

## 配置说明

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultTimeout` | `30000` | 全局抓取超时（毫秒） |
| `userAgent` | `AgentSpaces-Feed/1.0` | 默认 `User-Agent` 请求头 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `feed_fetch` | 抓取订阅源 URL，返回原始内容 + 探测到的格式 |
| `feed_parse` | 把订阅源文本解析为结构化对象 |

## 节点字段

### feed_fetch

- 入参：
  - `url`：订阅源地址（必填），例：`https://example.com/feed.xml`
  - `type`：订阅源类型，可选 `auto / rss / atom / rdf / json`，默认 `auto`
  - `limit`：条目上限，`0` 表示保留全部
  - `timeout`：超时（毫秒），默认 `30000`
  - `headers`：自定义请求头（JSON 对象）
  - `encoding`：响应编码，默认 `utf-8`
  - `proxy`：HTTP(S) 代理地址，例：`http://user:pass@host:8080`；留空直连
- 出参 `data`：
  - `format`：解析格式（`rss / atom / rdf / json`，无法识别时为空）
  - `title`：订阅源标题
  - `description`：描述
  - `link`：主页链接
  - `itemCount`：条目数量
  - `feed`：完整结构化对象（见下方「解析输出结构」）
  - `content`：响应正文（原始文本，便于排查或交给 feed_parse 手动重试）
  - `url`：原 URL

> 抓取后即解析，单节点直接输出结构化对象。若解析失败仍会返回 `content`，可接到 `feed_parse` 节点手动指定格式重试。

### feed_parse

- 入参：
  - `content`：订阅源原始文本（必填），XML 或 JSON
  - `type`：订阅源类型，可选 `auto / rss / atom / rdf / json`，默认 `auto`
  - `limit`：条目上限，`0` 表示保留全部
- 出参 `data`：
  - `format`：实际解析格式
  - `title`：订阅源标题
  - `description`：描述
  - `link`：主页链接
  - `itemCount`：条目数量
  - `feed`：完整结构化对象

## 解析输出结构

不同格式的 `feed` 字段略有差异，但都保证以下公共字段：

| 字段 | 说明 |
| --- | --- |
| `format` | `rss / atom / rdf / json` |
| `title` | 订阅源标题 |
| `items` | 条目数组（各格式统一） |

**RSS 条目**（`items[]`）：`title / link / description / content / pubDate / author / guid / categories / enclosures / links`

**Atom 条目**（`items[]`）：`id / title / link / summary / content / published / updated / authors / categories / links`

**RDF 条目**（`items[]`）：`title / link / description / pubDate / dc.creator`

**JSON Feed 条目**（`items[]`）：`id / url / title / content_html / content_text / summary / date_published / authors / tags`

## 使用示例

**示例 1：抓取并解析一个 RSS**

1. 拖入「抓取订阅源」节点，`url = https://example.com/feed.xml`
2. 拖入「解析订阅源内容」节点，`content` 连接上一步的 `data.content`
3. 从 `data.feed.items[0].title` 读取最新文章标题

**示例 2：强制按 Atom 解析已知格式**

1. 拖入「解析订阅源内容」节点
2. `content` 填入 Atom XML 文本
3. `type = atom`（避免探测偏差）

**示例 3：只取最新 10 条**

1. 在「解析订阅源内容」节点设置 `limit = 10`
2. `data.feed.items` 最多保留 10 条

## 常见问题

- **403 / 401**：源站做了反爬，请在 `headers` 里加 `User-Agent`、`Cookie` 等
- **中文乱码**：部分源用 `gbk`，把 `encoding` 设为 `gbk`
- **格式识别失败**：`format` 为空时改用 `type` 手动指定具体格式
- **条目太多内存高**：用 `limit` 限制条目数量

## 适用场景

- 订阅博客、新闻、播客、视频更新等 RSS / Atom 源
- 聚合多个订阅源做内容采集
- 配合下游 AI 节点做内容摘要、翻译、分类
