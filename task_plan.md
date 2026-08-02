# Task Plan

## Goal
为 game-asset-canvas 节点内的图片输入与图片产出增加悬浮大图 HoverCard。

## Phases
- [complete] 1. 定位图片输入、上游连线图和产出的共享渲染入口
- [complete] 2. 为共享入口接入 HoverCard，并覆盖特殊输入预览
- [complete] 3. 执行语法、类型与差异检查

## Decisions
- mini-app 内复用现有 `ImageHoverCard`，保持点击 Gallery、拖拽和操作栏行为。
- 宿主共享 `FileUpload` 增加显式开关，仅由节点 `UploadSection` 注入启用，避免影响其他页面。

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
