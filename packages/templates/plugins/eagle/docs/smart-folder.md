# Smart Folder

{% hint style="danger" %}
**此功能尚未发布**：此 API 需要 Eagle 4.0 Build 22 或更高版本。详细发布时间请关注 Eagle 官网。
{% endhint %}

## 端点概览

| 方法   | 端点                             | 说明             |
| ---- | ------------------------------ | -------------- |
| GET  | `/api/v2/smartFolder/get`      | 列出智能文件夹        |
| POST | `/api/v2/smartFolder/get`      | 列出智能文件夹（请求体）   |
| POST | `/api/v2/smartFolder/create`   | 创建智能文件夹        |
| POST | `/api/v2/smartFolder/update`   | 更新智能文件夹        |
| POST | `/api/v2/smartFolder/remove`   | 删除智能文件夹        |
| GET  | `/api/v2/smartFolder/getItems` | 获取符合条件的条目      |
| POST | `/api/v2/smartFolder/getItems` | 获取符合条件的条目（请求体） |
| GET  | `/api/v2/smartFolder/getRules` | 获取可用规则 schema  |

***

## GET /api/v2/smartFolder/get <a href="#list" id="list"></a>

列出所有智能文件夹，或按 ID 筛选。

### 查询参数

* `id` string（可选）— 按 ID 返回单个智能文件夹
* `ids` string（可选）— 逗号分隔的智能文件夹 ID

### 响应

```json
{
    "status": "success",
    "data": [
        {
            "id": "LRK3AQGN7VCB1",
            "name": "大尺寸图片",
            "conditions": [
                {
                    "rules": [
                        { "property": "width", "method": ">", "value": [1920] }
                    ],
                    "match": "AND",
                    "boolean": "TRUE"
                }
            ],
            "description": "",
            "icon": "",
            "iconColor": "blue",
            "children": [],
            "modificationTime": 1700000000000,
            "imageCount": 42
        }
    ]
}
```

### 示例

```javascript
// 列出所有智能文件夹
await fetch("http://localhost:41595/api/v2/smartFolder/get").then(r => r.json());

// 按 ID 获取单个智能文件夹
await fetch("http://localhost:41595/api/v2/smartFolder/get?id=LRK3AQGN7VCB1").then(r => r.json());
```

***

## POST /api/v2/smartFolder/get <a href="#list-post" id="list-post"></a>

与 GET 相同，但在 JSON 请求体中接受筛选参数。

### 请求体

* `id` string（可选）— 智能文件夹 ID
* `ids` string\[]（可选）— 智能文件夹 ID 数组

### 示例

```javascript
// 按多个 ID 获取智能文件夹
await fetch("http://localhost:41595/api/v2/smartFolder/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        ids: ["SMART_FOLDER_ID_1", "SMART_FOLDER_ID_2"]
    })
}).then(r => r.json());
```

***

## POST /api/v2/smartFolder/create <a href="#create" id="create"></a>

创建新的智能文件夹。

### 请求体

* `name` string（必填）— 智能文件夹名称
* `conditions` Object\[]（必填）— 筛选条件（格式请参考下方 [conditions 格式说明](#conditions)）
* `description` string（可选）— 说明
* `icon` string（可选）— 图标
* `iconColor` string（可选）— 图标颜色。可选值：`red`、`orange`、`yellow`、`green`、`aqua`、`blue`、`purple`、`pink`
* `parent` string（可选）— 父智能文件夹 ID。省略则创建在根层级。

### 响应

返回新创建的智能文件夹对象。

```json
{
    "status": "success",
    "data": {
        "id": "NEW_SMART_FOLDER_ID",
        "name": "大尺寸图片",
        "conditions": [
            {
                "rules": [
                    { "property": "width", "method": ">", "value": [1920] }
                ],
                "match": "AND"
            }
        ],
        "description": "",
        "icon": "",
        "iconColor": "",
        "children": [],
        "modificationTime": 1700000000000,
        "imageCount": 150
    }
}
```

### 示例

```javascript
// 创建筛选宽度大于 1920 的 PNG 图片的智能文件夹
await fetch("http://localhost:41595/api/v2/smartFolder/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        name: "大尺寸 PNG",
        conditions: [
            {
                "rules": [
                    { "property": "width", "method": ">", "value": [1920] },
                    { "property": "type", "method": "equal", "value": "png" }
                ],
                "match": "AND"
            }
        ],
        iconColor: "blue"
    })
}).then(r => r.json());
```

***

## POST /api/v2/smartFolder/update <a href="#update" id="update"></a>

更新现有智能文件夹的元数据。只有包含的字段会被修改。

### 请求体

* `id` string（必填）— 要更新的智能文件夹 ID

**可修改的字段：**

* `name` string（可选）— 新名称
* `conditions` Object\[]（可选）— 新筛选条件
* `description` string（可选）— 新说明
* `icon` string（可选）— 新图标
* `iconColor` string（可选）— 新图标颜色

### 响应

返回更新后的智能文件夹对象。

### 示例

```javascript
// 更新名称和图标颜色
await fetch("http://localhost:41595/api/v2/smartFolder/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "LRK3AQGN7VCB1",
        name: "超大尺寸图片",
        iconColor: "green"
    })
}).then(r => r.json());

// 更新筛选条件
await fetch("http://localhost:41595/api/v2/smartFolder/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "LRK3AQGN7VCB1",
        conditions: [
            {
                "rules": [
                    { "property": "width", "method": ">", "value": [3840] }
                ],
                "match": "AND"
            }
        ]
    })
}).then(r => r.json());
```

***

## POST /api/v2/smartFolder/remove <a href="#remove" id="remove"></a>

删除智能文件夹。同时会删除其所有子智能文件夹。

### 请求体

* `id` string（必填）— 要删除的智能文件夹 ID

### 响应

```json
{
    "status": "success",
    "data": true
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/smartFolder/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "LRK3AQGN7VCB1" })
}).then(r => r.json());
```

***

## GET /api/v2/smartFolder/getItems <a href="#get-items" id="get-items"></a>

获取符合智能文件夹筛选条件的条目。

### 查询参数

* `smartFolderId` string（必填）— 智能文件夹 ID
* `orderBy` string（可选）— 排序字段
* `fields` string（可选）— 逗号分隔的返回字段列表

### 响应

```json
{
    "status": "success",
    "data": [
        {
            "id": "M3QSGJNQTC2DG",
            "name": "wallpaper",
            "ext": "png",
            "width": 3840,
            "height": 2160,
            "tags": ["wallpaper"],
            "folders": []
        }
    ]
}
```

### 示例

```javascript
// 获取智能文件夹中的所有条目
await fetch("http://localhost:41595/api/v2/smartFolder/getItems?smartFolderId=LRK3AQGN7VCB1")
    .then(r => r.json());

// 只返回特定字段
await fetch("http://localhost:41595/api/v2/smartFolder/getItems?smartFolderId=LRK3AQGN7VCB1&fields=id,name,tags")
    .then(r => r.json());
```

***

## POST /api/v2/smartFolder/getItems <a href="#get-items-post" id="get-items-post"></a>

与 GET 相同，但在 JSON 请求体中接受参数。

### 请求体

* `smartFolderId` string（必填）— 智能文件夹 ID
* `orderBy` string（可选）— 排序字段
* `fields` string\[]（可选）— 返回的字段

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/smartFolder/getItems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        smartFolderId: "LRK3AQGN7VCB1",
        fields: ["id", "name", "ext", "width", "height"]
    })
}).then(r => r.json());
```

***

## GET /api/v2/smartFolder/getRules <a href="#get-rules" id="get-rules"></a>

获取可用的筛选规则 schema。返回每个 property 支持的 methods、valueType、options 等信息，让调用者可以动态构建合法的 conditions。

### 响应

```json
{
    "status": "success",
    "data": {
        "name": {
            "methods": ["contain", "uncontain", "equal", "startWith", "endWith", "empty", "not-empty", "regex"],
            "valueType": "string"
        },
        "width": {
            "methods": ["=", ">=", "<=", ">", "<", "between"],
            "valueType": "number"
        },
        "type": {
            "methods": ["equal", "unequal"],
            "valueType": "string",
            "options": ["jpg", "png", "gif", "svg", "bmp", "webp", "..."]
        }
    }
}
```

### 示例

```javascript
// 获取可用规则，用于动态构建 conditions
await fetch("http://localhost:41595/api/v2/smartFolder/getRules").then(r => r.json());
```

{% hint style="info" %}
**使用提示：** 先调用 `getRules` 获取所有可用的 property 和 method，再根据返回的 schema 构建 `conditions` 传入 `create` 或 `update`，可避免无效的筛选条件。
{% endhint %}

***

## Conditions 格式说明 <a href="#conditions" id="conditions"></a>

智能文件夹的 `conditions` 是一个条件组数组，每个组包含多条规则：

```json
[
    {
        "rules": [
            { "property": "name", "method": "contain", "value": "cat" },
            { "property": "width", "method": ">", "value": [1920] }
        ],
        "match": "AND",
        "boolean": "TRUE"
    }
]
```

### 条件组属性

| 属性        | 类型        | 说明                                       |
| --------- | --------- | ---------------------------------------- |
| `rules`   | Object\[] | 规则数组                                     |
| `match`   | string    | 规则间的逻辑运算。`"AND"`：全部符合；`"OR"`：任一符合        |
| `boolean` | string    | 组的包含/排除逻辑。`"TRUE"`（包含，默认）或 `"FALSE"`（排除） |

### 规则属性

| 属性         | 类型     | 说明                            |
| ---------- | ------ | ----------------------------- |
| `property` | string | 筛选属性（如 `name`、`width`、`type`） |
| `method`   | string | 筛选方法（如 `contain`、`>`、`equal`） |
| `value`    | any    | 筛选值（格式依属性和方法而定）               |

{% hint style="info" %}
**提示：** 使用 `GET /api/v2/smartFolder/getRules` 可查询所有可用的 property、method 及其对应的 valueType。
{% endhint %}

***

## SmartFolder 属性 <a href="#properties" id="properties"></a>

API 返回的智能文件夹包含以下属性：

| 属性                 | 类型        | 说明         |
| ------------------ | --------- | ---------- |
| `id`               | string    | 唯一智能文件夹 ID |
| `name`             | string    | 名称         |
| `conditions`       | Object\[] | 筛选条件       |
| `description`      | string    | 说明         |
| `icon`             | string    | 图标         |
| `iconColor`        | string    | 图标颜色       |
| `children`         | Object\[] | 子智能文件夹     |
| `modificationTime` | integer   | 最后修改时间戳    |
| `imageCount`       | integer   | 符合条件的条目数量  |
