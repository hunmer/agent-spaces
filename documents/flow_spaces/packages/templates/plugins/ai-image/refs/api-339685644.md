# 所有图像编辑(异步) 

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/images/edits:
    post:
      summary: '所有图像编辑(异步) '
      deprecated: false
      description: |-
        支持所有画图模型异步请求，仅需添加 query 参数 async=true，请求body 与之前一致即可；
        async 为 true 时，将异步提交
        响应中返回一个 task_id，此 task_id 用于后续查询图像生成状态。

        查询图像生成结果：
        使用 GET /v1/images/tasks/{task_id} 查询生成任务的状态。如果任务完成，响应会包含生成的图像 URL。
      tags:
        - 绘图模型/OpenAI Dall-e 格式
      parameters:
        - name: async
          in: query
          description: 启用异步模式
          required: true
          example: 'true'
          schema:
            type: string
        - name: webhook
          in: query
          description: ''
          required: false
          example: https://www.baidu.com/notify
          schema:
            type: string
        - name: Authorization
          in: header
          description: ''
          required: false
          example: Bearer {{YOUR_API_KEY}}
          schema:
            type: string
            default: Bearer {{YOUR_API_KEY}}
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                image:
                  description: 支持多图
                  example: E:\\Desktop\\gpt\\icon_samll2.png
                  type: string
                  format: binary
                prompt:
                  example: 带上眼镜
                  type: string
                model:
                  description: 支持 gpt-image-1、flux-kontext-pro、flux-kontext-max
                  example: gpt-image-1
                  type: string
              required:
                - image
                - prompt
                - model
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 绘图模型/OpenAI Dall-e 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-339685644-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```
