---
name: fix-flex-overflow-scroll
description: 修复 Flex 布局中 overflow-y-auto 不生效（内容溢出但不出现滚动条）的问题
trigger: 用户报告某个区域"不能滚动"、"没有滚动条"、"overflow 不生效"、"内容溢出"
---

# 修复 Flex 布局 overflow 滚动失效

## 问题表现

给子元素加了 `overflow-y-auto`，但内容超出时没有滚动条，整个容器被撑开。

## 根因

`overflow-y-auto` 需要元素有**明确的高度约束**才会生效。在 Flex 布局中，如果中间某一层不是 flex 容器，`flex-1` / `min-h-0` 不会向下传递高度约束，子元素就会按内容撑开。

典型错误结构：

```
flex-col 容器 (max-h / overflow-hidden)
  └─ div (flex-1, min-h-0)          ← 有约束高度，但不是 flex 容器
      └─ div (flex, min-h-0, flex-1) ← flex-1 无效，高度不约束
          ├─ 左侧 (overflow-y-auto)  ← 无效，因为父级没被约束
          └─ 右侧 (overflow-y-auto)  ← 同上
```

## 解决方法

给中间层加上 `flex flex-col overflow-hidden`，让高度约束向下传递：

```
flex-col 容器 (max-h / overflow-hidden)
  └─ div (flex-1, min-h-0, flex, flex-col, overflow-hidden) ← 变成 flex 容器
      └─ div (flex, min-h-0, flex-1) ← flex-1 现在生效，高度被约束
          ├─ 左侧 (overflow-y-auto)  ← 生效
          └─ 右侧 (overflow-y-auto)  ← 生效
```

## 检查清单

遇到 overflow 不生效时，从出问题的元素**往上逐层检查**：

1. **元素自身**是否有 `overflow-y-auto` / `overflow-auto`？
2. **元素自身**是否有高度约束？(`h-*`, `max-h-*`, `flex-1` 在 flex 容器中, `absolute` 定位等)
3. **往上每一层**，是否都是 flex 容器且子元素有 `min-h-0`（flex 默认 `min-height: auto` 会阻止收缩）？
4. 中间是否有**非 flex 的 div** 断裂了高度约束链？

关键规则：
- Flex 子元素默认 `min-height: auto`，会阻止内容收缩 → 需要加 `min-h-0`
- `overflow-y-auto` 需要**被约束的高度**，`auto`/`none` 高度不会触发滚动
- 每一层都必须传递高度约束，断一层就全部失效

## 修复模板

```diff
  <!-- DialogContent: flex-col + max-h + overflow-hidden -->
  <Dialog className="flex flex-col max-h-[85vh] overflow-hidden">
    <Header className="shrink-0" />

-   <div className="flex-1 min-h-0">
+   <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <div className="overflow-y-auto">{/* 左侧 */}</div>
        <div className="flex-1 overflow-y-auto">{/* 右侧 */}</div>
      </div>
    </div>
  </Dialog>
```

## 常见变体

| 场景 | 修复 |
|------|------|
| Dialog/Sheet 内容不滚动 | 给内容包裹层加 `flex flex-col overflow-hidden` |
| 侧边栏列表溢出 | 检查外层 flex 容器是否有 `min-h-0` |
| 嵌套 flex 布局中间断裂 | 每一层都加 `min-h-0` + `overflow-hidden`（flex-col 时） |
