# 简介

欢迎使用 **Eagle Web API V2** 文档。此 API 允许任何 HTTP 客户端（脚本、应用、浏览器扩展、自动化工具）通过本地 HTTP 服务器与 Eagle 应用进行交互。

{% hint style="info" %}
**在找 V1 API？** 旧版 V1 API 文档请访问 <https://api.eagle.cool/>。V2 基于 Plugin API 能力提供了更全面的功能集。
{% endhint %}

{% hint style="warning" %}
**版本要求：** V2 Web API 需要 **Eagle 4.0 Build 21** 或更高版本。
{% endhint %}

***

## Web API 与 Plugin API <a href="#web-api-vs-plugin-api" id="web-api-vs-plugin-api"></a>

Eagle 为开发者提供两种不同的 API：

* **Web API**（即本文档）— 一套 RESTful HTTP API，用于构建在 Eagle 应用程序**外部**运行的工具、服务、脚本或集成方案。适合开发浏览器扩展、自动化工作流、第三方应用，或任何独立于 Eagle 运行的工具。
* [**Plugin API**](https://developer.eagle.cool/plugin-api) — 一套 JavaScript API，用于构建在 Eagle **内部**运行的插件。插件可以直接访问 Eagle 的界面、创建自定义面板、响应用户操作，并与应用程序深度集成。适合想要扩展 Eagle 内置功能的开发者。

|      | Web API               | Plugin API                                                                 |
| ---- | --------------------- | -------------------------------------------------------------------------- |
| 运行位置 | Eagle 外部（任何 HTTP 客户端） | Eagle 内部（作为插件）                                                             |
| 协议   | HTTP REST             | JavaScript API                                                             |
| 适用场景 | 外部工具、脚本、自动化           | Eagle 插件、自定义面板、界面扩展                                                        |
| 文档   | 本站                    | [developer.eagle.cool/plugin-api](https://developer.eagle.cool/plugin-api) |

***

## V2 新特性 <a href="#whats-new" id="whats-new"></a>

V2 API（`/api/v2/...`）相比 V1（`/api/...`）提供了大量新端点，包括：

* **全文搜索** — 支持高级查询语法（AND、OR、NOT）
* **AI 语义搜索** — 通过文字描述或图片相似度进行搜索
* **标签管理** — 创建、重命名、合并标签和管理标签组
* **文件夹管理** — 创建、移动和整理文件夹
* **自动分页** — 所有列表端点默认分页返回，确保性能
* [**API Playground**](/web-api/zh-cn/get-started/playground.md) — 内置交互式测试工具，直接在浏览器中测试所有端点

***

## 前置条件 <a href="#prerequisites" id="prerequisites"></a>

Eagle 是一款本地应用程序 — API 服务器会在 Eagle 应用打开时自动启动。**你必须先运行 Eagle**，才能访问任何 API 端点。

***

## 基础 URL <a href="#base-url" id="base-url"></a>

```
http://localhost:41595/api/v2/
```

Eagle API 服务器默认运行在端口 **41595**。所有 V2 端点的前缀均为 `/api/v2/`。

***

## 身份验证 <a href="#authentication" id="authentication"></a>

### 本地访问（localhost）

如果你在运行 Eagle 的同一台机器上发送请求，**无需身份验证**。来自 `localhost`、`127.0.0.1` 或 `0.0.0.0` 的请求会被自动信任 — 你可以直接调用 API。

```javascript
// 本地访问 — 无需 token
await fetch("http://localhost:41595/api/v2/library/info").then(r => r.json());
```

### 远程访问（局域网 / 网络）

如果你希望从局域网中的其他设备（如手机、平板或另一台电脑）调用 Eagle API，则每个请求都必须包含 **API Token**。

#### 如何获取 API Token

1. 打开 Eagle，进入**偏好设置**（设置）
2. 点击左侧边栏的**开发者**
3. 页面顶部会显示你的 **API Token**
4. 点击 token 旁边的复制按钮将其复制到剪贴板

你也可以点击**重新生成 Token** 随时生成新的 token。注意，重新生成 token 会使之前的 token 失效。

#### 使用 Token

将 `token` 参数附加到任何请求 URL 中：

```javascript
// 使用 token 进行远程访问
const TOKEN = "f366c476-7533-4f33-b454-2bc720a1d0ea";

await fetch(`http://192.168.1.100:41595/api/v2/library/info?token=${TOKEN}`)
    .then(r => r.json());

// POST 请求同样适用
await fetch(`http://192.168.1.100:41595/api/v2/item/get?token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags: ["design"], limit: 20 })
}).then(r => r.json());
```

{% hint style="warning" %}
**请妥善保管你的 token。** 任何持有你 API Token 的人都可以通过网络访问和修改你的 Eagle 资源库。请勿公开分享或将其提交到版本控制系统中。
{% endhint %}

***

## 响应格式 <a href="#response-format" id="response-format"></a>

所有端点均以 [JSend](https://github.com/omniti-labs/jsend) 格式返回响应：

**成功：**

```json
{
    "status": "success",
    "data": { ... }
}
```

**错误：**

```json
{
    "status": "error",
    "message": "Error description"
}
```

***

## 分页 <a href="#pagination" id="pagination"></a>

所有列表端点（`item/get`、`item/query`、`folder/get`、`tag/get` 等）默认返回分页结果。

| Parameter | Type    | Default | Max    | Description |
| --------- | ------- | ------- | ------ | ----------- |
| `offset`  | Integer | `0`     | —      | 跳过的条目数      |
| `limit`   | Integer | `50`    | `1000` | 返回的条目数      |

**分页响应：**

```json
{
    "status": "success",
    "data": {
        "data": [ ... ],
        "total": 8500,
        "offset": 100,
        "limit": 50
    }
}
```

* `total` — 匹配的总条目数（分页前）
* `offset` — 使用的偏移量
* `limit` — 使用的限制数
* `data` — 分页后的结果数组

**示例：遍历所有条目**

```javascript
// 第 1 页：条目 0-49
const page1 = await fetch("http://localhost:41595/api/v2/item/get?limit=50").then(r => r.json());

// 第 2 页：条目 50-99
const page2 = await fetch("http://localhost:41595/api/v2/item/get?offset=50&limit=50").then(r => r.json());

// 持续翻页直到 data.data.length < limit（最后一页）
```

***

## 快速开始 <a href="#quick-start" id="quick-start"></a>

```javascript
// 检查 Eagle 是否在运行
await fetch("http://localhost:41595/api/v2/app/info").then(r => r.json());

// 获取资源库信息
await fetch("http://localhost:41595/api/v2/library/info").then(r => r.json());

// 列出前 50 个条目
await fetch("http://localhost:41595/api/v2/item/get").then(r => r.json());

// 按标签搜索条目
await fetch("http://localhost:41595/api/v2/item/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags: ["design"] })
}).then(r => r.json());

// 全文搜索
await fetch("http://localhost:41595/api/v2/item/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "sunset landscape" })
}).then(r => r.json());

// AI 语义搜索
await fetch("http://localhost:41595/api/v2/aiSearch/searchByText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "an orange cat", options: { limit: 10 } })
}).then(r => r.json());
```

***

## API 模块 <a href="#api-sections" id="api-sections"></a>

| 模块                                           | 说明            |
| -------------------------------------------- | ------------- |
| [Item](/web-api/zh-cn/api/item.md)           | 查询、添加、修改和管理条目 |
| [Folder](/web-api/zh-cn/api/folder.md)       | 创建、列出和整理文件夹   |
| [Tag](/web-api/zh-cn/api/tag.md)             | 列出、重命名和合并标签   |
| [Tag Group](/web-api/zh-cn/api/tag-group.md) | 管理标签组         |
| [Library](/web-api/zh-cn/api/library.md)     | 获取资源库元数据      |
| [App](/web-api/zh-cn/api/app.md)             | 应用程序信息        |
| [AI Search](/web-api/zh-cn/api/ai-search.md) | AI 语义搜索和以图搜图  |

***

## CORS <a href="#cors" id="cors"></a>

如果你从网页中调用 Eagle API（例如通过 **Tampermonkey** 或 **Violentmonkey** 等用户脚本管理器），标准的 `fetch` 请求可能会被浏览器的跨域资源共享（CORS）策略阻止。此时请使用 `GM_xmlhttpRequest` 代替：

```javascript
GM_xmlhttpRequest({
    method: "GET",
    url: "http://localhost:41595/api/v2/item/get",
    onload: function (response) {
        const data = JSON.parse(response.responseText);
        console.log(data);
    }
});
```

{% hint style="info" %}
这仅适用于在网页内运行的脚本。如果你从 Node.js、Electron、浏览器扩展的后台脚本或直接从 DevTools 调用 API，则不受 CORS 限制，可以正常使用 `fetch`。
{% endhint %}

***

## 速率限制 <a href="#rate-limits" id="rate-limits"></a>

API 调用**没有速率限制**。由于 API 服务器在你的本地机器上运行，所有请求都会直接处理，不会进行任何限流。但请注意，服务器的性能取决于你的设备硬件 — 对非常大的资源库进行大量操作时，响应可能需要更长时间。
