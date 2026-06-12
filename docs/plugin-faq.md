# Plugin FAQ

本文档说明插件节点遇到“必须使用公网资源 URL”时，如何快速实现从本地文件到公网 URL 的闭环，以及应参考的目标插件。

## 问题：节点只接受公网 URL，本地上传文件不能直接用

很多三方生成 API 不接受本地路径、浏览器 `File`、base64 或内网 URL，只接受公网可访问的 `imageUrl`、`videoUrl`、`audioUrl`。

典型例子：

- 阿里云 AI 扩图：`aliyun_image_out_painting` 需要 `imageUrl`
- 阿里云 AI 视频编辑：`aliyun_video_editing` 需要 `videoUrl`，可选 `referenceImages`
- 阿里云 AI 数字人：`aliyun_videoretalk` 需要 `videoUrl` 和 `audioUrl`

推荐数据流：

```text
浏览器 FileUpload
  -> 提交时 POST /api/upload 落盘
  -> 得到 server 可读的绝对 path
  -> 调 OSS/COS 插件上传到公网
  -> 得到公网 URL
  -> 把 URL 传给目标生成节点
```

不要把浏览器侧的 `File.path` 直接传给服务端插件。它可能只是相对文件名，服务端会按当前工作目录解析，容易出现 `ENOENT stat packages/server/<filename>`。

## 快速实现步骤

### 1. Workflow UI 提交时落盘

在 Workflow UI 中使用 host 暴露的上传能力：

```js
const uploaded = await window.AgentSpacesUI.uploadFile(file);
```

返回值来自 `/api/upload`：

```js
{
  name,
  path,      // server 本机可读的绝对路径
  url,       // /static/uploads/xxx
  httpPath,  // http://host/static/uploads/xxx
  size,
  type
}
```

提交按钮必须在上传完成前禁用。推荐做法：

```js
setSubmittingUpload(true);
try {
  const uploaded = await window.AgentSpacesUI.uploadFile(file);
  formData.imagePath = uploaded.path;
  formData.imageUrl = uploaded.httpPath || uploaded.url;
} finally {
  setSubmittingUpload(false);
}
```

### 2. 转存到公网对象存储

如果目标 API 要求公网 URL，继续调用对象存储插件。

阿里云 OSS：

```js
const result = await window.AgentSpaces.callPluginTool(
  'workflow.aliyun-oss',
  'oss_upload_file',
  { filePath }
);

const publicUrl = result?.data?.url;
```

腾讯云 COS：

```js
const result = await window.AgentSpaces.callPluginTool(
  'workflow.tencent-cos',
  'cos_upload_file',
  {
    key: `uploads/${date}/${id}.mp4`,
    filePath,
  }
);

const publicUrl = result?.data?.url || result?.data?.Location;
```

凭据由插件配置注入，不要在 Workflow UI 表单里收集或传递 AccessKey、SecretId、SecretKey。

### 3. 用公网 URL 调目标插件

示例：扩图。

```js
await window.AgentSpaces.callPluginTool(
  'workflow.aliyun-ai',
  'aliyun_image_out_painting',
  {
    imageUrl: publicUrl,
    expandMode: 'ratio',
    outputRatio: '16:9',
  }
);
```

示例：视频编辑。

```js
await window.AgentSpaces.callPluginTool(
  'workflow.aliyun-ai',
  'aliyun_video_editing',
  {
    prompt,
    videoUrl: publicVideoUrl,
    referenceImages: publicReferenceImageUrls,
    resolution: '720P',
  }
);
```

示例：数字人。

```js
await window.AgentSpaces.callPluginTool(
  'workflow.aliyun-ai',
  'aliyun_videoretalk',
  {
    videoUrl: publicVideoUrl,
    audioUrl: publicAudioUrl,
  }
);
```

## 参考目标插件

优先参考以下插件源码：

```text
packages/templates/plugins/aliyun-ai/actions.js
packages/templates/plugins/aliyun-ai/tools-image.js
packages/templates/plugins/aliyun-ai/tools-video.js
packages/templates/plugins/aliyun_oss/actions.js
packages/templates/plugins/tencent_cos/actions.js
```

重点看：

- `workflow.aliyun-ai`
  - `aliyun_image_out_painting`
  - `aliyun_video_editing`
  - `aliyun_videoretalk`
- `workflow.aliyun-oss`
  - `oss_upload_file`
- `workflow.tencent-cos`
  - `cos_upload_file`
  - `cos_upload`

## 实现位置参考

Workflow UI host API：

```text
packages/web/src/components/mini-apps/use-mini-app-host-api.ts
```

这里负责向 preview 注入：

- `window.AgentSpacesUI.uploadFile`
- `window.AgentSpacesUI.FileUpload`
- `window.AgentSpaces.callPluginTool`

通用 FileUpload：

```text
packages/web/src/components/ui/file-upload.tsx
```

如果项目需要“选择即上传”，传 `autoUpload={true}`。如果希望“提交时上传”，传 `autoUpload={false}`，并在提交函数里显式调用 `uploadFile(file)`。

后端上传接口：

```text
packages/server/src/app.ts
```

接口：

```text
POST /api/upload
```

该接口把文件写入 `public/uploads/`，并返回 `path/url/httpPath`。

## 常见坑

### 把浏览器 File.path 当成本地绝对路径

错误示例：

```js
const filePath = file.path;
```

`File.path` 不可靠，可能只是文件名。正确做法是使用 `/api/upload` 返回的 `path`，并建议保存为 `uploadedPath`，避免和浏览器字段混淆。

### 没等上传完成就提交

提交按钮必须在上传完成前禁用。否则生成工具可能拿到空路径、旧路径或相对路径。

### 只用 `/static/uploads/...` 作为公网 URL

`url` 是相对地址，很多三方 API 无法访问。优先使用 `httpPath`，更稳的是转存 OSS/COS 后使用对象存储公网 URL。

### 远程部署时 server path 不可读

`/api/upload` 返回的 `path` 只对当前 server 进程所在机器有效。OSS/COS 插件也必须在同一台机器或同一文件系统上执行。否则应改为让上传插件支持从 `httpPath` 拉取再上传。

### 对象存储对象不可公网访问

目标生成 API 必须能访问 URL。COS/OSS bucket、对象 ACL、CDN 或签名 URL 策略必须满足三方服务拉取要求。

## 推荐抽象

在 Workflow UI 项目里保留一个小工具函数，避免每个模式重复云上传逻辑：

```js
export async function uploadToCloud(filePath, provider, fileName) {
  if (provider === 'aliyun') {
    const result = await window.AgentSpaces.callPluginTool(
      'workflow.aliyun-oss',
      'oss_upload_file',
      { filePath }
    );
    return result?.data?.url;
  }

  const result = await window.AgentSpaces.callPluginTool(
    'workflow.tencent-cos',
    'cos_upload_file',
    { key: createObjectKey(fileName), filePath }
  );
  return result?.data?.url || result?.data?.Location;
}
```

这个函数只负责“本地绝对 path -> 公网 URL”。业务模式负责把 URL 映射到 `imageUrl`、`videoUrl`、`audioUrl` 等目标参数。

