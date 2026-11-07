# 腾讯云 COS 插件

> 在 Workflow 中调用腾讯云对象存储 COS，支持文件上传、下载、删除、批量删除、列举、签名 URL、跨桶复制、文件元信息查询等。

## 简介

腾讯云 COS（Cloud Object Storage）是腾讯云提供的海量、安全、低成本、高可靠的云存储服务。本插件把 COS 的核心能力封装为一组 Workflow 动作节点。

插件类型：`server`。

## 前置准备

1. 拥有腾讯云账号并开通 COS 服务
2. 创建一个 **存储桶（Bucket）**，记录：
   - Bucket 名称（格式：`bucket-appid`，例如 `mybucket-1250000000`）
   - 所在 **地域（Region）**，例如 `ap-guangzhou` / `ap-shanghai` / `ap-beijing`
3. 在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 创建 **SecretId / SecretKey**
4. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `secretId` | 是 | 腾讯云 API SecretId |
| `secretKey` | 是 | 腾讯云 API SecretKey |
| `bucket` | 是 | 存储桶名称，格式 `bucket-appid` |
| `region` | 是 | 存储桶地域，例如 `ap-guangzhou` |

> 建议为该插件单独创建只读 / 按需授权的子账号密钥，避免主账号密钥泄露。

## 节点清单

| 节点 | 用途 | 工具可用 |
| --- | --- | --- |
| `cos_upload_file` | 上传本地文件到 COS | ❌ |
| `cos_upload_content` | 上传文本内容到 COS | ❌ |
| `cos_upload_buffer` | 上传 Base64 二进制到 COS | ❌ |
| `cos_upload` | 统一上传（Agent 工具，支持 filePath / content / base64Data） | ✅ |
| `cos_download` | 下载 COS 文件到本地 | ❌ |
| `cos_get_content` | 读取 COS 文本内容或下载到本地 | ✅ |
| `cos_delete` | 删除单个文件 | ❌ |
| `cos_delete_tool` | 统一删除（Agent 工具，支持单删 / 批量） | ✅ |
| `cos_delete_multi` | 批量删除文件 | ❌ |
| `cos_list` | 按前缀列举对象 | ✅ |
| `cos_sign_url` | 生成临时签名 URL | ✅ |
| `cos_copy` | 跨桶 / 同桶内复制对象 | ✅ |
| `cos_head` | 查询文件元信息（不存在返回 `exists=false`） | ✅ |

## 节点字段

### 上传类

- `key`：COS 中的对象路径（必填）
- `filePath`（`cos_upload_file`）：本地文件绝对路径
- `content`（`cos_upload_content`）：文本内容
- `base64Data`（`cos_upload_buffer`）：Base64 编码的二进制
- `contentType`：MIME，如 `image/jpeg` / `application/pdf`
- 出参 `data`：`Key`、`ETag`、`Location`、部分节点还包含 `url`

### 下载 / 读取

- `key`（必填）
- `filePath`：填了则保存到本地；留空则 `cos_get_content` 返回文本
- 出参 `data`：`filePath` / `content` / `contentType` / `contentLength`

### 删除

- 单删：传 `key`
- 批量：传 `keys`（字符串数组 / JSON 字符串）
- 出参 `data.deleted`、`data.errors`（仅 `cos_delete_multi` / `cos_delete_tool`）

### 列举

- `prefix`、`delimiter`、`maxKeys`（默认 100）、`marker`（分页游标）
- 出参 `data`：`objects[]`、`commonPrefixes`、`nextMarker`、`isTruncated`

### 签名 URL

- `key`、`expires`（默认 3600 秒）、`method`（GET / PUT）
- 可选 `responseContentType` / `responseContentDisposition`
- 出参 `data.url`

### 复制

- `key`（目标路径）、`sourceKey`（源路径）
- 可选 `sourceBucket` / `sourceRegion`（不填则与目标桶相同）

### 元信息

- `key`
- 出参 `data.exists`、`data.size`、`data.contentType`、`data.lastModified`、`data.etag`

## 使用示例

**示例 1：上传文件 + 生成临时链接**

1. 拖入「COS Upload File」：
   ```
   key      = uploads/2025/06/report.pdf
   filePath = /Users/me/report.pdf
   ```
2. 拖入「COS Signed URL」：
   ```
   key     = uploads/2025/06/report.pdf
   expires = 3600
   method  = GET
   ```
3. 把 `data.url` 发给用户即可

**示例 2：批量清理过期文件**

1. 拖入「COS List Files」按 `prefix=uploads/old/` 列出
2. 把 `objects` 中的 `key` 收集为数组
3. 拖入「COS Batch Delete」一次性删除

**示例 3：跨桶迁移**

1. 「COS Copy File」：
   ```
   key           = archive/2025/file.zip
   sourceKey     = 2025/file.zip
   sourceBucket  = mybucket-source-12345
   sourceRegion  = ap-shanghai
   ```

## 常见问题

- **签名错误 / 403**：检查 `SecretId` / `SecretKey` 是否对应正确账号，Bucket 名称是否含 `-appid` 后缀。
- **`NoSuchBucket`**：Bucket 名拼写错误或 Region 与 Bucket 实际所在地域不一致。
- **CORS / 跨域**：浏览器直接访问对象时遇到 CORS 错误，需要在 COS 控制台配置跨域规则。
- **签名 URL 立即失效**：`expires` 单位为秒，请按需调整。
- **大文件上传慢**：内部已用分片上传（`sliceUploadFile`），无需额外配置；如需加速可开启「COS 传输加速」并加 `domain` 参数（需自行扩展）。
- **删除不存在对象会报错吗**：单删 404 会抛错；元信息节点 `cos_head` 会把 404 转成 `exists: false`。

## 依赖

- 运行时依赖：`cos-nodejs-sdk-v5` ^2.14.0
