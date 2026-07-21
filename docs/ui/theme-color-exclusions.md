# Theme 颜色排除与暗色兜底规范

## 背景

Web 端允许通过 `ThemeStyleInit` 在运行时注入保存的主题 CSS。注入样式晚于 `globals.css`，自定义主题中的 `:root` 变量或组件自身颜色规则可能覆盖默认暗色变量，导致界面已经进入暗色模式，但普通文本和图标仍计算为黑色。

典型信号：

- `color-scheme` 为 `dark`。
- 背景、边框和 `text-muted-foreground` 正常。
- 未显式设色的标题、按钮或图标计算为 `rgb(0, 0, 0)`。
- 单纯在 `body` 添加 `text-foreground` 无效。

## 根级主题规则

暗色根变量使用 `:root.dark`，提高其相对晚加载 `:root` 的优先级：

```css
:root.dark {
  --foreground: #e5e7eb;
}
```

运行时注入的根级 `.dark { ... }` 同样规范为 `:root.dark { ... }`。这可以修复变量层面的覆盖，但不能替代组件局部规则，因为按钮、弹层和第三方组件可能直接声明 `color`。

## 排除原则

以下内容不得使用统一暗色兜底覆盖：

- `text-destructive`、错误、删除和停止操作。
- `text-primary`、选中态、激活态和品牌色。
- `text-muted-foreground` 等已经可见的次要信息。
- Git 状态、执行状态、成功、警告等语义色。
- Monaco、xterm、Markdown 代码高亮等自带主题的内容。
- 图片、Emoji 和自带颜色的 Agent/应用图标。

不要添加 `.dark * { color: ... }` 或全局 `svg` 覆盖。这会破坏上述语义颜色。

## 兜底方式

仅对已确认计算为黑色的普通文本或图标使用：

```tsx
className="dark:!text-gray-200"
```

`text-gray-200` 对应当前默认暗色前景值 `#e5e7eb`，不依赖可能被覆盖的 `--foreground`。`!` 用于覆盖组件变体或运行时样式。

选择作用范围时遵循以下顺序：

1. 单个标题、按钮或图标异常：直接加在该元素上。
2. 组件内所有普通文本均异常：加在内容根容器上。
3. 仅按钮图标异常且没有语义色按钮：使用 `dark:[&_button]:!text-gray-200`。
4. 存在删除、状态或激活颜色：逐个处理普通按钮，不使用容器通配规则。

动态状态必须条件化，避免覆盖激活色：

```tsx
className={cn(
  "...",
  !isActive && "dark:!text-gray-200",
  isActive && "text-primary",
)}
```

## 当前覆盖范围

已加入局部暗色兜底的组件：

- Chat：频道列表、聊天标题和操作按钮、Agent Bar、Composer 附件按钮。
- CLI：会话列表普通按钮和图标。
- Editor：文件树、文件面板菜单和刷新按钮。
- FlexLayout：添加、浮动、预设、重置及普通右键菜单项。
- Git：变更文件名及暂存、打开、丢弃操作。
- Issue：列表、详情标题、普通操作图标、评论标题、发送者名称。
- Settings：工作区统计、自动处理、Hooks、通知、提示词和 Mini App 设置。
- Markdown：普通标题、段落、列表和表格文本。

对应源码位于 `packages/web/src/components`。新增兜底前先搜索现有用法：

```powershell
rg -n "dark:!text-gray-200|dark:\[&_button\]:!text-gray-200" "packages/web/src"
```

## 验收

1. 刷新页面，确保保存的主题 CSS 重新注入。
2. 切换到暗色模式。
3. 在 DevTools 中检查异常元素的 Computed `color`。
4. 普通文本应为 `rgb(229, 231, 235)` 或其他明确的浅色。
5. 删除、错误、选中、状态和品牌颜色应保持原色。
6. 运行目标文件 ESLint 和 `git diff --check`。

## 新增组件检查清单

- 普通文本是否依赖未知父级颜色。
- `Button`、`DropdownMenuContent`、Portal 是否直接设置了主题前景变量。
- 图标是否需要继承普通文本色，还是具有语义颜色。
- 是否能精确修改单个元素，避免扩大覆盖范围。
- 是否同时检查了明色、暗色、激活、禁用和错误状态。
