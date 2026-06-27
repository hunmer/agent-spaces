# Library

## 端点概览

| Method | Endpoint                  | Description |
| ------ | ------------------------- | ----------- |
| GET    | `/api/v2/library/info`    | 获取资源库元数据    |
| GET    | `/api/v2/library/history` | 获取历史资源库列表   |
| POST   | `/api/v2/library/switch`  | 切换到指定资源库    |
| GET    | `/api/v2/library/icon`    | 获取资源库图标     |

***

## GET /api/v2/library/info <a href="#info" id="info"></a>

返回当前打开的 Eagle 资源库的元数据，包括名称、路径和配置信息。

### 响应

```json
{
    "status": "success",
    "data": {
        "name": "My Design Library",
        "path": "D:\\Eagle Libraries\\My Design Library.library",
        "modificationTime": 1700000000000,
        "applicationVersion": "4.0",
        "folders": [],
        "smartFolders": [],
        "quickAccess": [],
        "tagGroups": []
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/library/info").then(r => r.json());
```

***

## GET /api/v2/library/history <a href="#history" id="history"></a>

获取历史资源库列表。返回分页结果。

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
                "name": "My Design Library",
                "path": "D:\\Eagle Libraries\\My Design Library.library"
            }
        ],
        "total": 3,
        "offset": 0,
        "limit": 50
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/library/history").then(r => r.json());

// 分页获取
await fetch("http://localhost:41595/api/v2/library/history?offset=0&limit=10").then(r => r.json());
```

***

## POST /api/v2/library/switch <a href="#switch" id="switch"></a>

切换到指定资源库。

### 请求体

* `libraryPath` string（必填）— 要切换到的资源库路径

### 响应

```json
{
    "status": "success",
    "data": true
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/library/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        libraryPath: "D:\\Eagle Libraries\\My Design Library.library"
    })
}).then(r => r.json());
```

***

## GET /api/v2/library/icon <a href="#icon" id="icon"></a>

获取资源库图标。

### 查询参数

* `libraryPath` string（必填）— 资源库路径

### 响应

返回图标的图片数据。

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/library/icon?libraryPath=D%3A%5CEagle%20Libraries%5CMy%20Design%20Library.library")
    .then(r => r.blob());
```

***

## Library 属性 <a href="#properties" id="properties"></a>

资源库对象包含以下属性：

| Property             | Type      | Description        |
| -------------------- | --------- | ------------------ |
| `name`               | string    | 资源库显示名称            |
| `path`               | string    | `.library` 目录的完整路径 |
| `modificationTime`   | integer   | 最后修改时间戳            |
| `applicationVersion` | string    | 创建此资源库的 Eagle 版本   |
| `folders`            | Object\[] | 顶级文件夹结构            |
| `smartFolders`       | Object\[] | 智能文件夹配置            |
| `quickAccess`        | Object\[] | 快速访问项目             |
| `tagGroups`          | Object\[] | 标签组定义              |
