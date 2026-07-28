# 发现

- 当前目标文件包含上一轮实时网格改动，本轮在其上增量修改。
- 固定节流位于 `scheduleGridSplit` 的 `120 - elapsed`。
- 动态公式采用 `min(1000, 80 + cols*rows*2)ms`：小网格保持灵敏，20×20 为 880ms。
- `deleteRectAt` 当前只删除 Fabric slice；网格态应直接 splice `curState().rects` 并调用 renderList。
- 列表删除按钮被 `!gridMode` 隐藏，需要取消条件。
