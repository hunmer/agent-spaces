# 阿里云 OSS 插件

> 在 Workflow 中调用阿里云 OSS 对象存储服务，支持文件上传、下载、删除、列举、签名 URL、跨桶复制等常见操作。

## 简介

阿里云 OSS（Object Storage Service）是阿里云提供的海量、安全、低成本、高可靠的云存储服务。本插件把 OSS 的核心能力封装为一组 Workflow 动作节点，Agent / Workflow 编排时可以直接拖拽使用，无需手写 SDK 调用代码。

插件类型：`server`（包含工作流动作和 Agent 工具）。

## 核心能力

- **文件上传**：本地文件 / 文本内容一键上传到 OSS
- **文件下载**：将 OSS 对象下载到本地，或直接读取为文本
- **删除文件**：支持单文件删除与批量删除
- **列举文件**：按前缀、分页、最大条数等条件列出对象
- **签名 URL**：生成带过期时间的临时访问 / 上传 URL
- **跨桶复制**：在 OSS 内部或跨 Bucket 复制对象

## 前置准备

1. 拥有阿里云账号，并开通 OSS 服务
2. 创建一个 Bucket，记录 **Bucket 名称** 与 **所在地域**（例如 `oss-cn-hangzhou`）
3. 创建或获取一对 **AccessKey ID / AccessKey Secret**
4. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

进入插件的「设置」页面，填写以下参数：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `bucket` | 是 | OSS Bucket 名称 |
| `region` | 是 | Bucket 所在地域，例如 `oss-cn-hangzhou` |
| `accessKeyId` | 是 | 阿里云 AccessKey ID |
| `accessKeySecret` | 是 | 阿里云 AccessKey Secret |
| `endpoint` | 否 | 自定义 Endpoint，填写后忽略 `region` |
| `secure` | 否 | 是否使用 HTTPS，默认 `true` |

> 建议为该插件单独创建一对只读 / 按需授权的 AccessKey，避免使用主账号密钥。

## 动作节点

| 节点名 | 用途 | 工具可用 |
| --- | --- | --- |
| `oss_upload_file` | 上传本地文件或文本内容到 OSS | ✅ |
| `oss_upload_content` | 上传文本内容到 OSS | ❌ |
| `oss_download` | 下载 OSS 文件到本地，或读取文本 | ✅ |
| `oss_get_content` | 读取 OSS 对象的文本内容 | ❌ |
| `oss_delete` | 删除单个对象（支持批量） | ✅ |
| `oss_delete_multi` | 批量删除对象 | ❌ |
| `oss_list` | 列举指定前缀下的对象 | ✅ |
| `oss_sign_url` | 生成临时签名 URL（GET / PUT） | ✅ |
| `oss_copy` | 跨桶或同桶内复制对象 | ✅ |

### 节点输入输出示例

**oss_upload_file**

- 入参：
  - `objectKey`：OSS 中的对象路径，留空时自动生成 `uploads/YYYY-MM-DD/<uuid>.bin`
  - `filePath`：本地文件完整路径
  - `content`：（可选）直接上传文本内容，与 `filePath` 二选一
- 出参 `data`：
  - `name`：OSS 中保存的对象名
  - `url`：可访问的 OSS URL

**oss_sign_url**

- 入参：
  - `objectKey`：对象路径（必填）
  - `expires`：URL 有效期（秒），默认 `3600`
  - `method`：`GET` 或 `PUT`
  - `responseContentType`、`responseContentDisposition`：可选项，用于强制下载或指定响应头
- 出参 `data.url`：生成的临时访问链接

**oss_list**

- 入参：`prefix`、`delimiter`、`maxKeys`（默认 100）、`marker`（分页游标）
- 出参 `data`：`objects`、`prefixes`、`nextMarker`、`isTruncated`

## 使用示例

在 Workflow 中拖入「OSS Upload File」节点，配置本地文件路径与目标 Key 即可完成上传；通过「OSS Signed URL」节点生成 1 小时有效的下载链接返回给用户。

## 常见问题

- **403 / AccessDenied**：检查 AccessKey 是否有对应 Bucket 的读写权限，以及 `bucket` / `region` 是否正确。
- **上传失败提示路径不存在**：确认本地文件路径是绝对路径，且程序对文件有读取权限。
- **签名 URL 立即失效**：`expires` 单位为秒，默认 3600 秒，请按需调整。
- **跨地域访问慢**：在配置中填写就近的 `endpoint` 可优化访问速度。

## 依赖

- 运行时依赖：`ali-oss` ^6.21.0
- 授权：阿里云 OSS 服务
