# App

## 端点概览

| Method | Endpoint           | Description |
| ------ | ------------------ | ----------- |
| GET    | `/api/v2/app/info` | 获取应用程序信息    |

***

## GET /api/v2/app/info <a href="#info" id="info"></a>

返回正在运行的 Eagle 应用程序信息，包括版本号和平台详情。

### 响应

```json
{
    "status": "success",
    "data": {
        "version": "4.0.0",
        "prereleaseVersion": null,
        "buildVersion": "build12",
        "platform": "win32"
    }
}
```

### 示例

```javascript
await fetch("http://localhost:41595/api/v2/app/info").then(r => r.json());
```

***

## App 属性 <a href="#properties" id="properties"></a>

| Property            | Type           | Description                                |
| ------------------- | -------------- | ------------------------------------------ |
| `version`           | string         | Eagle 版本号（如 `"4.0.0"`）                     |
| `prereleaseVersion` | string \| null | 预发布版本标识符，稳定版为 `null`                       |
| `buildVersion`      | string \| null | 构建版本标识符（如 `"build12"`）                     |
| `platform`          | string         | 操作系统：`"win32"`（Windows）或 `"darwin"`（macOS） |
