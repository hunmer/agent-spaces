# Findings

- CodeGraph 当前不可用，已按项目规则回退到 `rg`。
- `useImageOutputs.buildImageNodes`、`useNodeCrud.addImageNodesAt`、`handleDropFiles` 都先按固定 `260x240` 创建节点。
- `ImageDisplayNode` 在 `<img onLoad>` 后调用 `handleAutoSize`，因此会先显示错误比例再跳变。
- 图片已有 `object-contain`，旋转时还需交换节点显示比例，才能避免大量留白。
- `RotateCw` 已由 `@agent-spaces/ui` 暴露，可直接用于 toolbar。
