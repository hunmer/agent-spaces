# Item

## 端点概览

| Method | Endpoint                          | Description |
| ------ | --------------------------------- | ----------- |
| GET    | `/api/v2/item/get`                | 列出条目（带筛选）   |
| POST   | `/api/v2/item/get`                | 列出条目（请求体筛选） |
| POST   | `/api/v2/item/query`              | 全文搜索        |
| GET    | `/api/v2/item/countAll`           | 获取条目总数      |
| POST   | `/api/v2/item/add`                | 添加新条目       |
| POST   | `/api/v2/item/update`             | 更新条目        |
| POST   | `/api/v2/item/setCustomThumbnail` | 设置自定义缩略图    |
| POST   | `/api/v2/item/refreshThumbnail`   | 刷新条目缩略图     |

***

## GET /api/v2/item/get <a href="#list" id="list"></a>

列出条目，支持可选筛选。返回分页结果。

### 查询参数

* `id` string（可选）— 按 ID 返回单个条目
* `ids` string（可选）— 逗号分隔的条目 ID
* `isSelected` boolean（可选）— 返回当前选中的条目
* `isUntagged` boolean（可选）— 返回没有标签的条目
* `isUnfiled` boolean（可选）— 返回未归入任何文件夹的条目
* `keywords` string（可选）— 按关键词筛选（逗号分隔）
* `tags` string（可选）— 按标签筛选（逗号分隔）
* `folders` string（可选）— 按文件夹 ID 筛选（逗号分隔）
* `ext` string（可选）— 按文件扩展名筛选（如 `jpg`、`png`）
* `annotation` string（可选）— 按注释文本筛选
* `rating` integer（可选）— 按评分筛选（`0`–`5`）
* `url` string（可选）— 按来源 URL 筛选
* `shape` string（可选）— 按形状筛选：`square`、`portrait`、`panoramic-portrait`、`landscape`、`panoramic-landscape`
* `fields` string（可选）— 逗号分隔的返回字段列表（可提升性能）
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 响应

```json
{
    "status": "success",
    "data": {
        "data": [
            {
                "id": "M3QSGJNQTC2DG",
                "name": "sunset-photo",
                "ext": "jpg",
                "width": 1920,
                "height": 1080,
                "url": "https://example.com/photo.jpg",
                "tags": ["nature", "sunset"],
                "folders": ["FOLDER_ID_1"],
                "star": 4,
                "annotation": "Beautiful sunset at the beach",
                "modificationTime": 1700000000000
            }
        ],
        "total": 1250,
        "offset": 0,
        "limit": 50
    }
}
```

### 示例

```javascript
// 列出前 50 个条目（默认）
await fetch("http://localhost:41595/api/v2/item/get").then(r => r.json());

// 按 ID 获取单个条目
await fetch("http://localhost:41595/api/v2/item/get?id=M3QSGJNQTC2DG").then(r => r.json());

// 按扩展名筛选并分页
await fetch("http://localhost:41595/api/v2/item/get?ext=png&offset=0&limit=100").then(r => r.json());

// 仅返回特定字段以提升性能
await fetch("http://localhost:41595/api/v2/item/get?fields=id,name,tags").then(r => r.json());
```

***

## POST /api/v2/item/get <a href="#list-post" id="list-post"></a>

与 GET 相同，但通过 JSON 请求体接受筛选参数。适用于包含数组的复杂查询。

### 请求体

* `id` string（可选）— 条目 ID
* `ids` string\[]（可选）— 条目 ID 数组
* `isSelected` boolean（可选）— 当前选中的条目
* `isUntagged` boolean（可选）— 没有标签的条目
* `isUnfiled` boolean（可选）— 未归入任何文件夹的条目
* `keywords` string\[]（可选）— 匹配的关键词
* `tags` string\[]（可选）— 匹配的标签
* `folders` string\[]（可选）— 匹配的文件夹 ID
* `smartFolders` string\[]（可选）— 按智能文件夹 ID 筛选（OR 逻辑，匹配任一即包含）
* `ext` string（可选）— 文件扩展名
* `annotation` string（可选）— 注释文本
* `rating` integer（可选）— 评分（`0`–`5`）
* `url` string（可选）— 来源 URL
* `shape` string（可选）— 图片形状
* `fields` string\[]（可选）— 返回的字段
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 示例

```javascript
// 按标签筛选
await fetch("http://localhost:41595/api/v2/item/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        tags: ["design", "inspiration"],
        limit: 20
    })
}).then(r => r.json());

// 按多个 ID 获取条目
await fetch("http://localhost:41595/api/v2/item/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        ids: ["ITEM_ID_1", "ITEM_ID_2", "ITEM_ID_3"]
    })
}).then(r => r.json());

// 筛选特定文件夹中的 JPG 文件，仅返回 id 和 name
await fetch("http://localhost:41595/api/v2/item/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        ext: "jpg",
        folders: ["FOLDER_ID"],
        fields: ["id", "name", "tags"],
        offset: 0,
        limit: 100
    })
}).then(r => r.json());
```

```javascript
// 搭配智能文件夹筛选
await fetch("http://localhost:41595/api/v2/item/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        smartFolders: ["SMART_FOLDER_ID"],
        tags: ["cat"],
        limit: 20
    })
}).then(r => r.json());
```

{% hint style="info" %}
**性能提示：** 使用 `fields` 参数仅返回所需数据。在处理大型资源库时，这可以显著提升响应速度。
{% endhint %}

***

## POST /api/v2/item/query <a href="#query" id="query"></a>

对条目名称、标签、注释、URL、文件夹名等进行全文搜索。支持高级查询语法。返回分页结果。

### 请求体

* `query` string — 搜索查询字符串
* `offset` integer（可选）— 分页偏移量，默认 `0`
* `limit` integer（可选）— 分页限制数，默认 `50`，最大 `1000`

### 查询语法

| Syntax       | Description | Example             |
| ------------ | ----------- | ------------------- |
| `word`       | 必须包含该词      | `cat`               |
| `a b`        | 必须同时包含（AND） | `cat dog`           |
| `a OR b`     | 包含其中之一（OR）  | `cat OR dog`        |
| `a \|\| b`   | 包含其中之一（OR）  | `cat \|\| dog`      |
| `-word`      | 必须不包含       | `cat -dog`          |
| `"phrase"`   | 精确短语匹配      | `"orange cat"`      |
| `(a OR b) c` | 分组          | `(cat OR dog) cute` |

### 示例

```javascript
// 简单搜索
await fetch("http://localhost:41595/api/v2/item/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "sunset" })
}).then(r => r.json());

// 高级搜索：包含 "cat" 或 "dog" 但不包含 "cartoon" 的条目
await fetch("http://localhost:41595/api/v2/item/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        query: "(cat OR dog) -cartoon",
        limit: 20
    })
}).then(r => r.json());

// 分页浏览搜索结果
await fetch("http://localhost:41595/api/v2/item/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "design", offset: 50, limit: 50 })
}).then(r => r.json());
```

***

## GET /api/v2/item/countAll <a href="#count" id="count"></a>

返回资源库中的条目总数。

### 响应

```json
{
    "status": "success",
    "data": 12500
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/item/countAll").then(r => r.json());
```

***

## POST /api/v2/item/add <a href="#add" id="add"></a>

向 Eagle 添加新条目。支持通过 URL、Base64 数据、本地文件路径或书签添加。

### 请求体

* `id` string（可选）— 自定义条目 ID
* `name` string（可选）— 条目名称
* `tags` string\[]（可选）— 分配的标签
* `folders` string\[]（可选）— 添加到的文件夹 ID
* `annotation` string（可选）— 条目注释
* `website` string（可选）— 来源网站 URL

**另外需要以下其中一项：**

* `url` string — 要下载的图片 URL
* `base64` string — Base64 编码的图片数据
* `path` string — 要导入的本地文件路径
* `bookmarkURL` string — 要添加为书签的 URL

### 示例

```javascript
// 从 URL 添加
await fetch("http://localhost:41595/api/v2/item/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        url: "https://example.com/photo.jpg",
        name: "Example Photo",
        tags: ["downloaded", "example"],
        folders: ["FOLDER_ID"]
    })
}).then(r => r.json());

// 从本地文件路径添加
await fetch("http://localhost:41595/api/v2/item/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        path: "C:\\Users\\User\\Downloads\\design.png",
        name: "My Design",
        tags: ["design"]
    })
}).then(r => r.json());

// 添加书签
await fetch("http://localhost:41595/api/v2/item/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        bookmarkURL: "https://www.example.com",
        name: "Example Site",
        tags: ["bookmark"]
    })
}).then(r => r.json());

// 批量添加多个条目（最多 1000 个）
await fetch("http://localhost:41595/api/v2/item/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        items: [
            { url: "https://example.com/photo1.jpg", name: "Photo 1" },
            { path: "C:\\Users\\User\\Downloads\\design.png", name: "Design" },
            { bookmarkURL: "https://www.example.com", name: "Bookmark" }
        ]
    })
}).then(r => r.json());
```

### 批量模式

传入 `items` 数组可一次添加多个条目（最多 1000 个）。数组中每个对象的格式与单一模式相同，支持混合 `path`、`url`、`bookmarkURL`、`base64`。

### 响应

单一模式返回新建条目的 ID：

```json
{
    "status": "success",
    "data": { "id": "M3QSGJNQTC2DG" }
}
```

批量模式返回所有新建条目的 ID：

```json
{
    "status": "success",
    "data": { "ids": ["ITEM_ID_1", "ITEM_ID_2", "ITEM_ID_3"] }
}
```

***

## POST /api/v2/item/update <a href="#update" id="update"></a>

更新现有条目的元数据。只有请求中包含的字段会被修改。

### 请求体

* `id` string（必填）— 要更新的条目 ID

**可修改字段：**

* `name` string（可选）— 新名称
* `tags` string\[]（可选）— 替换标签
* `folders` string\[]（可选）— 替换文件夹归属
* `annotation` string（可选）— 新注释
* `url` string（可选）— 新来源 URL
* `star` integer（可选）— 评分，`0`–`5`
* `modificationTime` integer（可选）— 修改时间戳
* `noThumbnail` boolean（可选）— 标记为无缩略图
* `noPreview` boolean（可选）— 标记为不可预览
* `isDeleted` boolean（可选）— 移入 / 从回收站恢复

### 响应

返回更新后的条目对象。

### 示例

```javascript
// 更新条目名称和标签
await fetch("http://localhost:41595/api/v2/item/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "M3QSGJNQTC2DG",
        name: "Updated Name",
        tags: ["tag1", "tag2"],
        star: 5
    })
}).then(r => r.json());

// 将条目移入回收站
await fetch("http://localhost:41595/api/v2/item/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "M3QSGJNQTC2DG",
        isDeleted: true
    })
}).then(r => r.json());
```

***

## POST /api/v2/item/setCustomThumbnail <a href="#set-thumbnail" id="set-thumbnail"></a>

从本地图片文件为条目设置自定义缩略图。

### 请求体

* `itemId` string（必填）— 条目 ID
* `filePath` string（必填）— 缩略图图片的路径

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/item/setCustomThumbnail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        itemId: "M3QSGJNQTC2DG",
        filePath: "C:\\Users\\User\\thumbnails\\custom.png"
    })
}).then(r => r.json());
```

{% hint style="info" %}
此操作为异步操作。API 会等待最多 10 秒让缩略图生成完成后再返回响应。
{% endhint %}

***

## POST /api/v2/item/refreshThumbnail <a href="#refresh-thumbnail" id="refresh-thumbnail"></a>

重新生成条目的缩略图，同时更新文件大小、尺寸和颜色信息。

### 请求体

* `itemId` string（必填）— 条目 ID

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/item/refreshThumbnail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: "M3QSGJNQTC2DG" })
}).then(r => r.json());
```

***

## GET /api/v2/item/getComments <a href="#get-comments" id="get-comments"></a>

获取条目的所有标注（注解）。返回图片框选标注或视频时间轴注解。

{% hint style="info" %}
\*\*版本要求：\*\*此端点需要 **Eagle 4.0 Build 22** 或更高版本。
{% endhint %}

### 查询参数

* `id` string（必填）— 条目 ID

### 响应

```json
{
    "status": "success",
    "data": [
        {
            "id": "MN3DZC0R7XYSZ",
            "x": 324,
            "y": 810,
            "width": 194,
            "height": 208,
            "annotation": "脸部区域",
            "lastModified": 1774282485915
        }
    ]
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/item/getComments?id=M3QSGJNQTC2DG")
    .then(r => r.json());
```

***

## POST /api/v2/item/addComment <a href="#add-comment" id="add-comment"></a>

添加标注至条目。支持两种类型：

* **图片框选标注** — 提供 `x`、`y`、`width`、`height` 来标记图片上的区域
* **视频时间轴注解** — 提供 `duration` 来标记视频时间轴上的时间点

服务器会自动生成 `id` 和 `lastModified` 字段。

{% hint style="info" %}
\*\*版本要求：\*\*此端点需要 **Eagle 4.0 Build 22** 或更高版本。
{% endhint %}

### 请求体

* `id` string（必填）— 条目 ID
* `annotation` string（可选）— 标注文本
* `x` number（可选）— 框选 X 坐标（图片标注）
* `y` number（可选）— 框选 Y 坐标（图片标注）
* `width` number（可选）— 框选宽度，必须 > 0（图片标注）
* `height` number（可选）— 框选高度，必须 > 0（图片标注）
* `duration` number（可选）— 视频时间戳（秒），必须 >= 0（视频注解）

{% hint style="warning" %}
必须提供 `duration`（视频）或完整的 `x`/`y`/`width`/`height`（图片）。同时提供或都不提供将返回错误。
{% endhint %}

### 示例

```javascript
// 添加图片框选标注
await fetch("http://localhost:41595/api/v2/item/addComment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "M3QSGJNQTC2DG",
        x: 350, y: 480, width: 380, height: 400,
        annotation: "白色毛绒玩具的脸"
    })
}).then(r => r.json());

// 添加视频时间轴注解
await fetch("http://localhost:41595/api/v2/item/addComment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "VIDEO_ITEM_ID",
        duration: 65.5,
        annotation: "重要场景"
    })
}).then(r => r.json());
```

***

## POST /api/v2/item/updateComment <a href="#update-comment" id="update-comment"></a>

更新现有标注。仅更新提供的字段；`lastModified` 会自动更新。

{% hint style="info" %}
\*\*版本要求：\*\*此端点需要 **Eagle 4.0 Build 22** 或更高版本。
{% endhint %}

### 请求体

* `id` string（必填）— 条目 ID
* `commentId` string（必填）— 要更新的标注 ID
* `annotation` string（可选）— 新的标注文本
* `x` number（可选）— 新的 X 坐标（仅限图片标注）
* `y` number（可选）— 新的 Y 坐标（仅限图片标注）
* `width` number（可选）— 新的宽度，必须 > 0（仅限图片标注）
* `height` number（可选）— 新的高度，必须 > 0（仅限图片标注）
* `duration` number（可选）— 新的时间戳，必须 >= 0（仅限视频注解）

{% hint style="warning" %}
图片标注只能更新 `x`/`y`/`width`/`height`，视频注解只能更新 `duration`。跨类型更新会返回错误。
{% endhint %}

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/item/updateComment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "M3QSGJNQTC2DG",
        commentId: "MN3DZC0R7XYSZ",
        annotation: "更新后的标注文字"
    })
}).then(r => r.json());
```

***

## POST /api/v2/item/removeComment <a href="#remove-comment" id="remove-comment"></a>

从条目中移除标注。

{% hint style="info" %}
\*\*版本要求：\*\*此端点需要 **Eagle 4.0 Build 22** 或更高版本。
{% endhint %}

### 请求体

* `id` string（必填）— 条目 ID
* `commentId` string（必填）— 要移除的标注 ID

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/item/removeComment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: "M3QSGJNQTC2DG",
        commentId: "MN3DZC0R7XYSZ"
    })
}).then(r => r.json());
```

***

## Item 属性 <a href="#properties" id="properties"></a>

API 返回的条目包含以下属性：

| Property           | Type      | Description |
| ------------------ | --------- | ----------- |
| `id`               | string    | 唯一条目 ID     |
| `name`             | string    | 条目名称        |
| `ext`              | string    | 文件扩展名       |
| `width`            | integer   | 图片宽度（像素）    |
| `height`           | integer   | 图片高度（像素）    |
| `url`              | string    | 来源 URL      |
| `isDeleted`        | boolean   | 是否在回收站中     |
| `annotation`       | string    | 条目注释/备注     |
| `tags`             | string\[] | 标签名称数组      |
| `folders`          | string\[] | 文件夹 ID 数组   |
| `palettes`         | Object\[] | 颜色信息        |
| `size`             | integer   | 文件大小（字节）    |
| `star`             | integer   | 评分（0–5）     |
| `modificationTime` | integer   | 最后修改时间戳     |
| `noThumbnail`      | boolean   | 文件是否没有缩略图   |
| `noPreview`        | boolean   | 是否禁用双击预览    |
