## 实施计划

### 1. 新建通用组件 `FlexLayoutShell`
**文件**：`packages/web/src/components/common/flex-layout-shell.tsx`

封装 flexlayout-react，对外提供以下 Props：
```ts
interface FlexLayoutShellProps {
  storageKey: string;                       // 必填，实例隔离 key
  components: Record<string, (node: TabNode) => ReactNode>; // 组件注册表（factory）
  defaultLayout: IJsonModel;                // 首次加载默认布局
  addableComponents?: { key: string; name: string; icon?: ReactNode }[]; // 可通过"新建 Tab"打开的页面
  themes?: { key: string; label: string }[]; // 默认提供 light/dark/gray/rounded/underline
  defaultTheme?: string;                    // 默认 "light"
  showToolbar?: boolean;                    // 默认 true
  title?: string;                           // 工具栏标题
  className?: string;
}
```

**实例隔离的 localStorage 派生 key**（保证多实例数据不冲突）：
- 当前布局：`${storageKey}:layout`
- 预设列表：`${storageKey}:templates`
- 当前主题：`${storageKey}:theme`

**功能映射（覆盖 5 项需求）**：
1. **多布局预设（保存/删除/应用）** → 复用 `LayoutManagerDialog` + `layout-templates.ts`，传入 `templatesStorageKey`、`getCurrentLayout = () => model.toJson()`、`onApply = (json) => setModel(Model.fromJson(json))`、`onReset = () => setModel(Model.fromJson(defaultLayout))`。
2. **保留 float/max/close 图标** → `IJsonModel` 配置 `root.config.enableFloat = true`（启用 popout 浮窗）；maximize/close 是 flexlayout 默认渲染的 tab 按钮，无需额外代码。工具栏额外提供"添加浮动窗口"按钮（参考 demo 的 `Actions.createPopout`）。
3. **new tab 注入页面** → 工具栏提供"添加 Tab"下拉（基于 `addableComponents`），点击后调用 `layoutApi.addTabToActiveTabSet({ component, name })`；`factory` 通过 `components[component]` 渲染。
4. **多样式切换** → 工具栏 select 切换 theme，更新容器 div 的 className `flexlayout__theme_${theme}`（flexlayout theme css 的变量作用域在该元素及其后代，多实例不冲突）；组件文件顶部静态 import 所有主题 css。
5. **自定义 key 隔离** → 见上述派生 key 设计。

**布局持久化**：`model` 初始化时从 `${storageKey}:layout` 读取，失败回退 `defaultLayout`；通过 `onAction`/model change listener 写回 localStorage。

**工具栏布局**（参考 demo，精简）：
`[标题] [添加Tab ▼] [添加浮窗] | [预设管理] [重置] |grow| [样式 ▼]`

### 2. 新建 demo 页面
**页面组件**：`packages/web/src/components/playground/playground-page.tsx`
- 消费 `FlexLayoutShell`，`storageKey="playground-demo"`
- 注册 4 个示例组件：`welcome`（欢迎/说明）、`counter`（交互计数器）、`notes`（简易记事本）、`color`（调色板）
- 配置 `defaultLayout`（两列 tabset，含 welcome + counter）
- 提供 `addableComponents` 列表

**路由**：`packages/web/src/app/playground/page.tsx`
```tsx
"use client";
import { PlaygroundPage } from "@/components/playground/playground-page";
export default function Page() { return <PlaygroundPage />; }
```

### 3. 侧边栏接入 playground 入口
**修改**：`packages/web/src/components/sidebar/sidebar-dashboard-routes.tsx`
- 导入图标 `FlaskConical`（lucide-react）
- 在 `mini-apps` 与 `chat` 之间插入：
  ```tsx
  { id: "playground", title: ts("nav.playground"), icon: <FlaskConical className="size-4" />, link: "/playground" }
  ```

### 4. 国际化
**修改**：`packages/web/src/locales/zh/sidebar.json` 与 `packages/web/src/locales/en/sidebar.json`
- 在 `nav` 下添加 `"playground": "操练场"`（zh）/ `"Playground"`（en）

### 不做的事
- 不改 `layout.tsx` 已有的全局 light.css import（FlexLayoutShell 自己 import 主题 css；light 重复 import 无害）。
- 不实现 demo App.tsx 里的复杂特性（external drag、context menu、sublayout、json 视图），按"最小改动优先"原则只满足 5 项需求 + 一个 demo。
- 不改 `workspace-shell.tsx`、`workflow-editor.tsx` 等已有 flexlayout 使用方。

### 影响范围
新增 3 个文件（flex-layout-shell.tsx、playground-page.tsx、app/playground/page.tsx），修改 3 个文件（sidebar-dashboard-routes.tsx、zh/en sidebar.json）。无破坏性改动，不动后端/SDK。