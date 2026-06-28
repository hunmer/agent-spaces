# Workflow 节点输出字段类型

节点输出字段（`OutputField`）通过 `type` 声明值的类型，决定了工作流编辑器中的展示方式和节点执行后的渲染行为。

## 类型一览

| 类型 | 分类 | 值格式 | 说明 |
|------|------|--------|------|
| `string` | 标量 | 字符串 | 普通文本输出 |
| `number` | 标量 | 数字 | 数值输出 |
| `boolean` | 标量 | `true` / `false` | 布尔输出 |
| `object` | 标量 | JSON 对象 | 嵌套结构，通过 `children` 定义子字段 |
| `file` | 标量 | 文件路径字符串 | 文件引用 |
| `image` | 媒体 | URL 字符串 | 图片资源，节点执行后展示缩略图预览 |
| `audio` | 媒体 | URL 字符串 | 音频资源，节点执行后展示音频图标 |
| `video` | 媒体 | URL 字符串 | 视频资源，节点执行后展示视频图标 |
| `any` | 标量 | 任意 | 不确定类型 |
| `string[]` | 数组 | 字符串数组 | 文本列表 |
| `number[]` | 数组 | 数字数组 | 数值列表 |
| `file[]` | 数组 | 文件路径数组 | 文件列表 |
| `image[]` | 数组 | URL 数组 | 图片列表，节点执行后展示所有缩略图 |
| `any[]` | 数组 | 任意数组 | 不确定类型的列表 |

## 媒体类型行为

当节点定义了 `image`、`audio`、`video` 或 `image[]` 类型的输出字段时：

1. **编辑阶段**：属性面板中按对应类型渲染输入控件
2. **执行完毕后**：节点底部自动展示媒体预览条
   - `image` / `image[]` — 显示缩略图
   - `audio` — 显示音符图标
   - `video` — 显示播放图标
3. **点击预览**：通过 lightGallery 弹窗查看/播放媒体资源

### 递归提取

媒体资源支持从 `object` 类型的嵌套结构中递归提取。例如：

```js
outputs: [
  { key: 'data', type: 'object', children: [
    { key: 'imageUrl', type: 'image' },
    { key: 'audioUrl', type: 'audio' },
  ] },
]
```

节点执行后会自动从 `output.data.imageUrl` 和 `output.data.audioUrl` 提取媒体 URL。

## 插件中的使用

在插件的 `outputs` 数组中指定字段类型：

```js
outputs: [
  { key: 'success', type: 'boolean' },
  { key: 'message', type: 'string' },
  { key: 'data', type: 'object', children: [
    { key: 'imageUrl', type: 'image' },    // 单张图片
    { key: 'images', type: 'image[]' },     // 多张图片
    { key: 'audioUrl', type: 'audio' },     // 音频 URL
    { key: 'videoUrl', type: 'video' },     // 视频 URL
  ] },
]
```

`run` 函数返回值中的对应字段填写实际 URL 即可：

```js
return {
  success: true,
  message: '生成完成',
  data: {
    imageUrl: 'https://example.com/image.png',
    images: ['https://example.com/1.png', 'https://example.com/2.png'],
    audioUrl: 'https://example.com/audio.mp3',
    videoUrl: 'https://example.com/video.mp4',
  },
}
```

## 类型定义位置

- TypeScript 类型：`packages/shared/src/types/workflow.ts` — `OutputField.type`
- 前端字段列表：`packages/web/src/components/workflow/workflow-properties-utils.ts` — `FIELD_TYPES`
- 辅助函数：
  - `isArrayOutputFieldType(type)` — 判断是否为数组类型
  - `isFileOutputFieldType(type)` — 判断是否为文件类型
  - `isMediaOutputFieldType(type)` — 判断是否为媒体类型

## 媒体预览组件

- 组件文件：`packages/web/src/components/ui/media-gallery.tsx`
- 依赖：`lightgallery@2.9.x` + plugins（zoom、video、thumbnail）
- 导出：
  - `MediaGallery` — 声明式组件
  - `openMediaGallery(items, startIndex)` — 命令式弹窗
  - `NodeMediaPreview` — 节点底部缩略图条
