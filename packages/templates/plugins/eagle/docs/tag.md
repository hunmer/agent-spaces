# Tag

## 端点概览

| Method | Endpoint                     | Description |
| ------ | ---------------------------- | ----------- |
| GET    | `/api/v2/tag/get`            | 列出所有标签      |
| POST   | `/api/v2/tag/get`            | 列出标签（请求体）   |
| GET    | `/api/v2/tag/getRecentTags`  | 获取最近使用的标签   |
| GET    | `/api/v2/tag/getStarredTags` | 获取收藏的标签     |
| POST   | `/api/v2/tag/update`         | 重命名标签       |
| POST   | `/api/v2/tag/merge`          | 合并两个标签      |

***

## GET /api/v2/tag/get <a href="#list" id="list"></a>

列出资源库中的所有标签。返回分页结果。

### 查询参数

* `name` string（可选）— 按名称筛选标签（子串匹配）
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 响应

```json
{
    "status": "success",
    "data": {
        "data": [
            {
                "name": "design",
                "count": 150,
                "color": "",
                "groups": ["GROUP_ID_1"],
                "pinyin": "design"
            },
            {
                "name": "photography",
                "count": 89,
                "color": "",
                "groups": [],
                "pinyin": "photography"
            }
        ],
        "total": 340,
        "offset": 0,
        "limit": 50
    }
}
```

### 示例

```javascript
// 列出所有标签（前 50 个）
await fetch("http://localhost:41595/api/v2/tag/get").then(r => r.json());

// 按名称筛选标签
await fetch("http://localhost:41595/api/v2/tag/get?name=design").then(r => r.json());

// 分页浏览标签
await fetch("http://localhost:41595/api/v2/tag/get?offset=50&limit=100").then(r => r.json());
```

***

## POST /api/v2/tag/get <a href="#list-post" id="list-post"></a>

与 GET 相同，但通过 JSON 请求体接受筛选参数。

### 请求体

* `name` string（可选）— 按名称筛选标签（子串匹配）
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tag/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "design", limit: 100 })
}).then(r => r.json());
```

***

## GET /api/v2/tag/getRecentTags <a href="#recent" id="recent"></a>

获取最近使用的标签。返回分页结果。

### 查询参数

* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 响应

```json
{
    "status": "success",
    "data": {
        "data": [
            {
                "name": "ui-design",
                "count": 45,
                "color": "",
                "groups": [],
                "pinyin": "ui-design"
            }
        ],
        "total": 12,
        "offset": 0,
        "limit": 50
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tag/getRecentTags").then(r => r.json());
```

***

## GET /api/v2/tag/getStarredTags <a href="#starred" id="starred"></a>

获取收藏（置顶）的标签。返回分页结果。

### 查询参数

* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 响应

与 `/api/v2/tag/getRecentTags` 格式相同。

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tag/getStarredTags").then(r => r.json());
```

***

## POST /api/v2/tag/update <a href="#update" id="update"></a>

重命名现有标签。所有使用该标签的条目会自动更新。

### 请求体

* `originalName` string（必填）— 当前标签名称
* `name` string（必填）— 新标签名称

### 响应

返回更新后的标签对象。

```json
{
    "status": "success",
    "data": {
        "name": "new-tag-name",
        "count": 45,
        "color": "",
        "groups": [],
        "pinyin": "new-tag-name"
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tag/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        originalName: "old-tag-name",
        name: "new-tag-name"
    })
}).then(r => r.json());
```

***

## POST /api/v2/tag/merge <a href="#merge" id="merge"></a>

将源标签合并到目标标签。所有拥有源标签的条目将被替换为目标标签。合并后源标签会被移除。

### 请求体

* `source` string（必填）— 要合并的源标签名称（将被移除）
* `target` string（必填）— 要合并到的目标标签名称（将被保留）

### 响应

```json
{
    "status": "success",
    "data": {
        "affectedItems": 25,
        "sourceRemoved": true
    }
}
```

### 示例

```javascript
// 将 "photograph" 合并到 "photography"
await fetch("http://localhost:41595/api/v2/tag/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        source: "photograph",
        target: "photography"
    })
}).then(r => r.json());
```

***

## Tag 属性 <a href="#properties" id="properties"></a>

API 返回的标签包含以下属性：

| Property | Type      | Description     |
| -------- | --------- | --------------- |
| `name`   | string    | 标签名称            |
| `count`  | integer   | 使用此标签的条目数量      |
| `color`  | string    | 标签颜色（未设置时为空字符串） |
| `groups` | string\[] | 标签组 ID 数组       |
| `pinyin` | string    | 名称的拼音表示         |
