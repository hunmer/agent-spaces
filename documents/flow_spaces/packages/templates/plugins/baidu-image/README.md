# 百度AI图像处理

对接百度智能云图像处理 API，提供两个工作流节点：

- **智能抠图**（`baidu_image_segment`）：检测图像主体并擦除背景，返回透明背景的主体图或单通道蒙版图。支持自动识别主体（`auto`）与手动框选主体（`control`）两种方式。
- **图像无损放大**（`baidu_image_enhance`）：在尽量保持图像质量的条件下，将图像长宽各放大两倍。

## 配置

在插件设置中填入百度智能云应用凭证：

| 字段 | 说明 |
|------|------|
| `apiKey` | 百度智能云应用的 API Key |
| `secretKey` | 百度智能云应用的 Secret Key |

凭证可在 [百度智能云控制台](https://console.bce.baidu.com/) 创建应用后获取。插件会用 `client_credentials` 换取 `access_token`，进程内缓存复用（有效期约 30 天）。

## 智能抠图

| 参数 | 必填 | 说明 |
|------|------|------|
| `image` | 是 | URL / 本地路径 / base64 data URI，或 JSON 数组（批量）。base64 后 ≤ 10M，最短边 ≥ 128px，最长边 ≤ 3000px，支持 JPG/JPEG/PNG/WEBP/BMP |
| `method` | 是 | `auto`（自动识别，默认）/ `control`（手动框选） |
| `returnForm` | 否 | `rgba`（透明背景主体，默认）/ `mask`（单通道二值蒙版图） |
| `refineMask` | 否 | 是否对边缘平滑处理，默认 `true` |
| `position` | 否 | `method=control` 时必填，外框坐标，如 `[[[x1,y1],[x2,y2]]]`，支持多个框。矩形不能与图片边缘重合，尺寸需 ≥ 10×10 |

## 图像无损放大

| 参数 | 必填 | 说明 |
|------|------|------|
| `image` | 是 | URL / 本地路径 / base64 data URI，或 JSON 数组（批量）。base64 后 ≤ 4M，长宽乘积 ≤ 2000×2000，支持 JPG/PNG/BMP |

> 该接口固定将图像长宽各放大两倍，无放大倍数参数。

## 实现说明

- 智能抠图接口（`/rest/2.0/image-process/v1/segment`）要求 `Content-Type: application/json`，通过 `ctx.api.postJson` 或 `globalThis.fetch` 提交。
- 图像放大接口（`/rest/2.0/image-process/v1/image_quality_enhance`）要求 `Content-Type: application/x-www-form-urlencoded`，由于 `ctx.api` 仅提供 `postJson`，这里使用注入的 `globalThis.fetch` 配合 `URLSearchParams` 手动构造请求体。
- 结果图像 base64 经 `ctx.api.savePublicFile` 落盘，返回 `httpPath` 供后续节点或预览使用。
