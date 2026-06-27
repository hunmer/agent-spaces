# Folder

## 端点概览

| Method | Endpoint                | Description |
| ------ | ----------------------- | ----------- |
| GET    | `/api/v2/folder/get`    | 列出所有文件夹     |
| POST   | `/api/v2/folder/get`    | 列出文件夹（请求体）  |
| POST   | `/api/v2/folder/create` | 创建新文件夹      |
| POST   | `/api/v2/folder/update` | 更新文件夹       |

***

## GET /api/v2/folder/get <a href="#list" id="list"></a>

列出文件夹，支持可选筛选。返回分页结果。

### 查询参数

* `id` string（可选）— 按 ID 返回单个文件夹
* `ids` string（可选）— 逗号分隔的文件夹 ID
* `isSelected` boolean（可选）— 返回当前选中的文件夹
* `isRecent` boolean（可选）— 返回最近使用的文件夹
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 响应

```json
{
    "status": "success",
    "data": {
        "data": [
            {
                "id": "LRK3AQGN7VCB1",
                "name": "Design References",
                "description": "UI/UX design references",
                "children": [],
                "modificationTime": 1700000000000,
                "tags": [],
                "iconColor": "blue",
                "imageCount": 42
            }
        ],
        "total": 25,
        "offset": 0,
        "limit": 50
    }
}
```

### 示例

```javascript
// 列出所有文件夹（前 50 个）
await fetch("http://localhost:41595/api/v2/folder/get").then(r => r.json());

// 按 ID 获取单个文件夹
await fetch("http://localhost:41595/api/v2/folder/get?id=LRK3AQGN7VCB1").then(r => r.json());

// 获取最近使用的文件夹
await fetch("http://localhost:41595/api/v2/folder/get?isRecent=true").then(r => r.json());
```

***

## POST /api/v2/folder/get <a href="#list-post" id="list-post"></a>

与 GET 相同，但通过 JSON 请求体接受筛选参数。

### 请求体

* `id` string（可选）— 文件夹 ID
* `ids` string\[]（可选）— 文件夹 ID 数组
* `isSelected` boolean（可选）— 当前选中的文件夹
* `isRecent` boolean（可选）— 最近使用的文件夹
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 示例

```javascript
// 按多个 ID 获取文件夹
await fetch("http://localhost:41595/api/v2/folder/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        ids: ["FOLDER_ID_1", "FOLDER_ID_2"]
    })
}).then(r => r.json());
```

***

## POST /api/v2/folder/create <a href="#create" id="create"></a>

在资源库中创建新文件夹。

### 请求体

* `name` string（必填）— 文件夹名称
* `description` string（可选）— 文件夹描述
* `parent` string（可选）— 父文件夹 ID。省略则创建在根级别。

### 响应

返回新创建的文件夹对象。

```json
{
    "status": "success",
    "data": {
        "id": "NEW_FOLDER_ID",
        "name": "My New Folder",
        "description": "",
        "children": [],
        "modificationTime": 1700000000000,
        "tags": []
    }
}
```

### 示例

```javascript
// 创建根级文件夹
await fetch("http://localhost:41595/api/v2/folder/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "My New Folder" })
}).then(r => r.json());

// 创建子文件夹
await fetch("http://localhost:41595/api/v2/folder/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        name: "Subfolder",
        description: "A subfolder for organizing",
        parent: "PARENT_FOLDER_ID"
    })
}).then(r => r.json());
```

***

## POST /api/v2/folder/update <a href="#update" id="update"></a>

更新现有文件夹的元数据。只有请求中包含的字段会被修改。

### 请求体

* `id` string（必填）— 要更新的文件夹 ID

**可修改字段：**

* `name` string（可选）— 新文件夹名称
* `description` string（可选）— 新描述
* `tags` string\[]（可选）— 替换文件夹标签
* `iconColor` string（可选）— 文件夹图标颜色。可选值：`red`、`orange`、`yellow`、`green`、`aqua`、`blue`、`purple`、`pink`
* `parent` string | null（可选）— 将文件夹移动到新的父文件夹。设为 `null` 可移动到根级别。

### 响应

返回更新后的文件夹对象。

### 示例

```javascript
// 重命名文件夹并设置图标颜色
await fetch("http://localhost:41595/api/v2/folder/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "LRK3AQGN7VCB1",
        name: "Renamed Folder",
        iconColor: "green"
    })
}).then(r => r.json());

// 将文件夹移动到其他父文件夹
await fetch("http://localhost:41595/api/v2/folder/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "LRK3AQGN7VCB1",
        parent: "NEW_PARENT_ID"
    })
}).then(r => r.json());

// 将文件夹移动到根级别
await fetch("http://localhost:41595/api/v2/folder/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "LRK3AQGN7VCB1",
        parent: null
    })
}).then(r => r.json());
```

***

## Folder 属性 <a href="#properties" id="properties"></a>

API 返回的文件夹包含以下属性：

| Property           | Type      | Description |
| ------------------ | --------- | ----------- |
| `id`               | string    | 唯一文件夹 ID    |
| `name`             | string    | 文件夹名称       |
| `description`      | string    | 文件夹描述       |
| `children`         | Object\[] | 子文件夹对象数组    |
| `modificationTime` | integer   | 最后修改时间戳     |
| `tags`             | string\[] | 标签名称数组      |
| `iconColor`        | string    | 图标颜色名称      |
| `imageCount`       | integer   | 此文件夹中的条目数量  |
