# Tag Group

## 端点概览

| Method | Endpoint                      | Description |
| ------ | ----------------------------- | ----------- |
| GET    | `/api/v2/tagGroup/get`        | 列出所有标签组     |
| POST   | `/api/v2/tagGroup/create`     | 创建新标签组      |
| POST   | `/api/v2/tagGroup/update`     | 更新标签组       |
| POST   | `/api/v2/tagGroup/remove`     | 删除标签组       |
| POST   | `/api/v2/tagGroup/addTags`    | 向标签组添加标签    |
| POST   | `/api/v2/tagGroup/removeTags` | 从标签组移除标签    |

***

## GET /api/v2/tagGroup/get <a href="#list" id="list"></a>

列出所有标签组。返回分页结果。

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
                "id": "TG_001",
                "name": "Design Styles",
                "color": "blue",
                "tags": ["flat", "material", "skeuomorphic"],
                "description": "Visual design styles"
            }
        ],
        "total": 5,
        "offset": 0,
        "limit": 50
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tagGroup/get").then(r => r.json());
```

***

## POST /api/v2/tagGroup/create <a href="#create" id="create"></a>

创建新标签组。

### 请求体

* `name` string（必填）— 组名
* `tags` string\[]（必填）— 要包含的标签名称数组
* `color` string（可选）— 组颜色
* `description` string（可选）— 组描述

### 响应

返回新创建的标签组对象。

```json
{
    "status": "success",
    "data": {
        "id": "NEW_GROUP_ID",
        "name": "Color Palette",
        "color": "",
        "tags": ["warm", "cool", "neutral"],
        "description": "Tags for color palettes"
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tagGroup/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        name: "Color Palette",
        tags: ["warm", "cool", "neutral"],
        description: "Tags for color palettes"
    })
}).then(r => r.json());
```

***

## POST /api/v2/tagGroup/update <a href="#update" id="update"></a>

更新现有标签组。

### 请求体

* `id` string（必填）— 要更新的标签组 ID
* `name` string（必填）— 组名
* `tags` string\[]（必填）— 完整的标签名称数组（替换现有标签）
* `color` string（可选）— 组颜色
* `description` string（可选）— 组描述

### 响应

返回更新后的标签组对象。

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tagGroup/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "TG_001",
        name: "Updated Group Name",
        tags: ["tag1", "tag2", "tag3"],
        color: "green"
    })
}).then(r => r.json());
```

***

## POST /api/v2/tagGroup/remove <a href="#remove" id="remove"></a>

删除标签组。此操作仅移除组本身 — 组内的标签不会被删除。

### 请求体

* `id` string（必填）— 要删除的标签组 ID

### 响应

```json
{
    "status": "success",
    "data": true
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tagGroup/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "TG_001" })
}).then(r => r.json());
```

***

## POST /api/v2/tagGroup/addTags <a href="#add-tags" id="add-tags"></a>

向现有标签组添加标签。

### 请求体

* `groupId` string（必填）— 标签组 ID
* `tags` string\[]（必填）— 要添加的标签名称
* `removeFromSource` boolean（可选）— 如果为 `true`，则在添加到此组之前先将标签从其当前所在的组中移除

### 响应

返回更新后的标签组对象。

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tagGroup/addTags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        groupId: "TG_001",
        tags: ["minimalist", "modern"]
    })
}).then(r => r.json());
```

***

## POST /api/v2/tagGroup/removeTags <a href="#remove-tags" id="remove-tags"></a>

从标签组中移除标签。标签本身不会被删除，仅从组中移除。

### 请求体

* `groupId` string（必填）— 标签组 ID
* `tags` string\[]（必填）— 要从组中移除的标签名称

### 响应

返回更新后的标签组对象。

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/tagGroup/removeTags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        groupId: "TG_001",
        tags: ["outdated-tag"]
    })
}).then(r => r.json());
```

***

## Tag Group 属性 <a href="#properties" id="properties"></a>

API 返回的标签组包含以下属性：

| Property      | Type      | Description |
| ------------- | --------- | ----------- |
| `id`          | string    | 唯一标签组 ID    |
| `name`        | string    | 组名          |
| `color`       | string    | 组颜色         |
| `tags`        | string\[] | 组内标签名称数组    |
| `description` | string    | 组描述         |
