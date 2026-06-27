# AI Search

{% hint style="info" %}
**需要** [**AI Search**](https://eagle.cool/support/article/ai-search) **插件。** AI Search 功能需要安装并运行 Eagle AI Search 插件。在执行搜索前，请使用状态端点检查可用性。
{% endhint %}

## 端点概览

| Method | Endpoint                              | Description           |
| ------ | ------------------------------------- | --------------------- |
| GET    | `/api/v2/aiSearch/isInstalled`        | 检查 AI Search 是否已安装    |
| GET    | `/api/v2/aiSearch/isReady`            | 检查 AI Search 是否就绪     |
| GET    | `/api/v2/aiSearch/isStarting`         | 检查 AI Search 是否正在启动   |
| GET    | `/api/v2/aiSearch/isSyncing`          | 检查 AI Search 是否正在同步数据 |
| GET    | `/api/v2/aiSearch/getSyncStatus`      | 获取详细的同步状态             |
| GET    | `/api/v2/aiSearch/checkServiceHealth` | 检查服务健康状态              |
| POST   | `/api/v2/aiSearch/searchByText`       | 通过文字描述搜索              |
| POST   | `/api/v2/aiSearch/searchByBase64`     | 通过图片搜索（Base64）        |
| POST   | `/api/v2/aiSearch/searchByItemId`     | 通过条目 ID 查找相似条目        |

***

## 状态端点

### GET /api/v2/aiSearch/isInstalled <a href="#is-installed" id="is-installed"></a>

检查 AI Search 插件是否已安装。

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/isInstalled").then(r => r.json());
```

**响应：**

```json
{
    "status": "success",
    "data": true
}
```

***

### GET /api/v2/aiSearch/isReady <a href="#is-ready" id="is-ready"></a>

检查 AI Search 是否已完全初始化并准备好接受搜索查询。

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/isReady").then(r => r.json());
```

**响应：**

```json
{
    "status": "success",
    "data": true
}
```

***

### GET /api/v2/aiSearch/isStarting <a href="#is-starting" id="is-starting"></a>

检查 AI Search 服务是否正在启动中。

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/isStarting").then(r => r.json());
```

**响应：**

```json
{
    "status": "success",
    "data": false
}
```

***

### GET /api/v2/aiSearch/isSyncing <a href="#is-syncing" id="is-syncing"></a>

检查 AI Search 是否正在同步（索引）资源库数据。

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/isSyncing").then(r => r.json());
```

**响应：**

```json
{
    "status": "success",
    "data": false
}
```

***

### GET /api/v2/aiSearch/getSyncStatus <a href="#sync-status" id="sync-status"></a>

获取详细的同步状态，包括进度信息。

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/getSyncStatus").then(r => r.json());
```

**响应：**

```json
{
    "status": "success",
    "data": {
        "isSyncing": false,
        "syncedCount": 12500,
        "totalCount": 12500,
        "progress": 1.0
    }
}
```

***

### GET /api/v2/aiSearch/checkServiceHealth <a href="#health" id="health"></a>

对 AI Search 服务执行健康检查。

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/checkServiceHealth").then(r => r.json());
```

**响应：**

```json
{
    "status": "success",
    "data": {
        "healthy": true
    }
}
```

***

## 搜索端点

### POST /api/v2/aiSearch/searchByText <a href="#search-by-text" id="search-by-text"></a>

使用自然语言文字描述搜索条目。AI 模型会查找视觉或语义上匹配的条目。

#### 请求体

* `query` string（必填）— 要搜索的文字描述
* `options` Object（可选）
  * `limit` integer — 最大结果数量（默认值取决于 AI Search 配置）

#### 响应

```json
{
    "status": "success",
    "data": {
        "results": [
            {
                "item": {
                    "id": "M3QSGJNQTC2DG",
                    "name": "sunset-beach",
                    "ext": "jpg",
                    "width": 1920,
                    "height": 1080,
                    "tags": ["nature", "sunset"],
                    "star": 4
                },
                "score": 0.892
            },
            {
                "item": {
                    "id": "K7XPWQBN9TC3F",
                    "name": "golden-hour",
                    "ext": "png",
                    "width": 2560,
                    "height": 1440,
                    "tags": ["photography"],
                    "star": 3
                },
                "score": 0.756
            }
        ]
    }
}
```

#### 示例

```javascript
// 通过文字描述搜索
await fetch("http://localhost:41595/api/v2/aiSearch/searchByText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "an orange cat sitting on a windowsill" })
}).then(r => r.json());

// 搜索并限制结果数量
await fetch("http://localhost:41595/api/v2/aiSearch/searchByText", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        query: "minimalist logo design",
        options: { limit: 20 }
    })
}).then(r => r.json());
```

***

### POST /api/v2/aiSearch/searchByBase64 <a href="#search-by-image" id="search-by-image"></a>

通过提供 Base64 编码的图片查找视觉相似的条目。

#### 请求体

* `base64` string（必填）— Base64 编码的图片数据
* `options` Object（可选）
  * `limit` integer — 最大结果数量

#### 响应

与 `searchByText` 格式相同 — 返回按相似度排序的 `{ item, score }` 结果数组。

#### 示例

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/searchByBase64", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        base64: "/9j/4AAQSkZJRg...",
        options: { limit: 10 }
    })
}).then(r => r.json());
```

***

### POST /api/v2/aiSearch/searchByItemId <a href="#search-by-item" id="search-by-item"></a>

查找与资源库中现有条目视觉相似的条目。

#### 请求体

* `itemId` string（必填）— 要查找相似条目的条目 ID
* `options` Object（可选）
  * `limit` integer — 最大结果数量

#### 响应

与 `searchByText` 格式相同 — 返回按相似度排序的 `{ item, score }` 结果数组。

#### 示例

```javascript
await fetch("http://localhost:41595/api/v2/aiSearch/searchByItemId", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        itemId: "M3QSGJNQTC2DG",
        options: { limit: 10 }
    })
}).then(r => r.json());
```

***

## 推荐工作流程

1. **检查可用性** — 在搜索前先调用 `isInstalled` 和 `isReady`
2. **等待启动完成** — 如果 `isStarting` 返回 `true`，轮询直到 `isReady` 变为 `true`
3. **检查同步状态** — 使用 `syncStatus` 验证索引是否为最新
4. **执行搜索** — 使用 `searchByText` 进行文字描述搜索，使用 `searchByBase64` 进行以图搜图，或使用 `searchByItemId` 查找相似条目

```javascript
// 第 1 步：验证 AI Search 是否就绪
const { data: isReady } = await fetch("http://localhost:41595/api/v2/aiSearch/isReady")
    .then(r => r.json());

if (isReady) {
    // 第 2 步：执行搜索
    const results = await fetch("http://localhost:41595/api/v2/aiSearch/searchByText", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "sunset landscape", options: { limit: 10 } })
    }).then(r => r.json());

    console.log(results.data.results);
}
```
