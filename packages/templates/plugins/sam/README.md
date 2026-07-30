# SAM Box 分割插件

对接独立 `sam_server.py` HTTP 服务。一次请求提交整张图片和全部区域框，服务只计算一次图片 embedding，再返回每个区域的灰度 PNG mask。

## 服务契约

- 健康检查：`GET /health`
- 分割：`POST /segment_with_boxes`
- 默认地址：`http://127.0.0.1:30231`
- 默认超时：`600000ms`

请求体：

```json
{
  "image_base64": "<png-or-jpg-base64>",
  "boxes": [
    { "slot_id": "head", "x_min": 10, "y_min": 20, "x_max": 110, "y_max": 160 }
  ]
}
```

插件动作 `sam_segment_with_boxes` 接受 `image`（URL、本地路径或 data URI）与 `boxes`。服务返回的 `mask_b64` 会由插件保存为公共 PNG，不会传到浏览器。

输出：

```json
{
  "success": true,
  "data": {
    "masks": [
      { "slotId": "head", "score": 0.98, "maskUrl": "/public/uploads/...png" }
    ],
    "total": 1
  }
}
```

mask 是灰度图，前景为白色。调用方应使用灰度值控制生成图 alpha，不能把 mask PNG 当作材质 RGB。
