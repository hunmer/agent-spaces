---
name: add-guided-tour
description: >-
  给本项目（@agent-spaces/web）的页面或组件添加 react-joyride 引导介绍。
  Use whenever the user says 添加引导/添加介绍/加指引/onboarding/tour/新手引导/产品引导,
  or wants to highlight UI elements sequentially to explain a feature flow.
  本 skill 已固化本项目的命名约定、i18n 结构、跨页触发机制和 flexlayout tab 锚点方案，
  照做即可快速复用，无需重新摸索 API。
---

# add-guided-tour

给 `packages/web` 下的页面/组件添加 react-joyride v3 引导。本项目已积累一套固定做法，按下面步骤照做。

## 前置：本项目依赖已就绪

`packages/web/package.json` 已含 `"react-joyride": "^3.1.0"`，无需安装。

## 核心方案（4 步）

### 1. 给目标元素加锚点

引导靠 CSS selector 定位元素。本项目有三种锚点方式，按场景选：

| 场景 | 锚点写法 | 示例 |
|------|---------|------|
| 普通 DOM 元素 | 加 className `tour-xxx` 或直接用现有 class/id | `className="tour-workspace-switcher ..."` |
| flexlayout-react 的 tab 按钮 | 在 `renderTabIcon`/`onRenderTab` 返回的 span 上加 `data-tour-tab={comp}` | 见下文「flexlayout tab 锚点」 |
| 通用组件内部按钮 | 给组件加 `data-tour="xxx"` 属性透传 | `<Button data-tour="wf-preview">` |

> flexlayout-react 的 tab 按钮所有同名 class 都是 `.flexlayout__tab_button`，**没有唯一标识**，必须用 `data-tour-tab` 方案。

### 2. 在组件里集成 useJoyride

模板（直接复制改名）：

```tsx
import { useJoyride, STATUS } from "react-joyride";
import type { Status, Step } from "react-joyride";

const TOUR_KEY = "agent-spaces:<scope>-tour-completed"; // 每个引导用独立 key

// 组件内：
const [runTour, setRunTour] = useState(false);
const tTour = useTranslations("<namespace>.tour"); // 见步骤 3

const tourSteps: Step[] = useMemo(() => [
  {
    target: '.tour-xxx',           // 或 '[data-tour-tab="xxx"]' / '[data-tour="xxx"]'
    content: tTour('stepKey'),
    title: tTour('stepKeyTitle'),
    placement: 'right',            // top/bottom/left/right/*-start/*-end/center
    skipBeacon: true,              // 仅第一步设 true，直接显示 tooltip 不显示脉动点
  },
  // ...更多步骤
], [tTour]);

const { Tour } = useJoyride({
  continuous: true,
  run: runTour,
  steps: tourSteps,
  locale: {
    back: tTour('back'),
    close: tTour('close'),
    last: tTour('last'),
    next: tTour('next'),
    skip: tTour('skip'),
  },
  options: {
    showProgress: true,
    buttons: ['back', 'close', 'primary', 'skip'],
  },
  onEvent: (data) => {
    const finished = [STATUS.FINISHED, STATUS.SKIPPED] as readonly Status[];
    if (finished.includes(data.status)) {
      setRunTour(false);
      try { localStorage.setItem(TOUR_KEY, '1'); } catch {}
    }
  },
});

// 首次访问自动启动 + 支持外部强制触发
useEffect(() => {
  if (isMobile) return;
  try {
    const done = localStorage.getItem(TOUR_KEY);
    if (!done) {
      const timer = setTimeout(() => setRunTour(true), 600);
      return () => clearTimeout(timer);
    }
  } catch {}
}, [isMobile]);

// 在组件 JSX 末尾渲染：
{Tour}
```

### 3. 加 i18n 文案

本项目用 `next-intl`，文案在 `packages/web/src/locales/{en,zh}/`。

- 翻译文件是按命名空间拆分的 JSON（`chat.json`、`workflows.json`、`settings.json`、`workspaceShell.json` 等）
- 在对应业务命名空间下加 `tour` 子对象：

```jsonc
// 例如 workflows.json
{
  "editor": { /* 已有 */ },
  "tour": {
    "stepKeyTitle": "Step Title",
    "stepKey": "Step body text shown in tooltip.",
    "back": "Back",
    "close": "Close",
    "last": "Finish",
    "next": "Next",
    "skip": "Skip"
  }
}
```

- **新增命名空间**（如 `workspaceShell`）需同时改 `src/locales/{en,zh}/index.ts` 注册 import + messages。
- 每步需要一对键：`xxx`（正文）+ `xxxTitle`（标题）。按钮文案 5 个键（back/close/last/next/skip）每个引导都要加。

### 4. 加「重放引导」入口（可选但推荐）

在 `packages/web/src/components/sidebar/settings/general-tab.tsx` 的 `tour` Section 加一个按钮，清 localStorage 标记后跳转触发：

```tsx
const XXX_TOUR_KEY = "agent-spaces:<scope>-tour-completed";

const replayXxxTour = () => {
  try { localStorage.removeItem(XXX_TOUR_KEY); } catch {}
  router.push("/<route>"); // 见下「跨页触发」
};
```

同时在 `settings.json`（en/zh）加 `xxxTourDesc` / `replayXxxTour` 描述文案。

## 跨页触发机制

引导组件挂载在目标页面，设置页跟目标页不同路由，需要中转：

| 目标页路由 | 触发方式 |
|-----------|---------|
| 与设置页同路由或可直接 push | URL 参数：`router.push('/chat?tour=1')`，目标页 effect 读 `searchParams.get('tour')==='1'` |
| 需要先经过列表页才能进（如 `/workflows/[id]`） | sessionStorage 中转：设置页 `sessionStorage.setItem('agent-spaces:xxx-tour-pending','1')` → 跳列表页 → 用户点进详情 → 目标页 effect 读 sessionStorage 后 removeItem |

目标页 effect 模板（支持两种触发）：

```tsx
useEffect(() => {
  if (isMobile) return;
  const force = searchParams.get("tour") === "1";           // URL 方式
  // 或 sessionStorage 方式：
  // const force = sessionStorage.getItem('agent-spaces:xxx-tour-pending') === '1';
  // if (force) sessionStorage.removeItem('agent-spaces:xxx-tour-pending');
  try {
    const done = localStorage.getItem(TOUR_KEY);
    if (force || !done) {
      const timer = setTimeout(() => setRunTour(true), 600);
      return () => clearTimeout(timer);
    }
  } catch {}
}, [isMobile, searchParams]);
```

## flexlayout tab 锚点（本项目特有）

`workspace-shell.tsx` 和 `workflow-editor.tsx` 都用 flexlayout-react，tab 按钮无唯一标识。处理：

**workspace-shell**：锚点已内置在 `packages/web/src/components/layout/tab-config.tsx` 的 `renderTabIcon`，span 上有 `data-tour-tab={comp}`，**直接用 `[data-tour-tab="chat"]` 即可，无需改 tab-config**。

**workflow-editor**：有自己的 `onRenderTab`，需在该回调返回的 span 上加 `data-tour-tab={comp}`（若已加过则复用）。

常见 tab 的 comp 值：
- workspace-shell: `project-settings` `channel-list` `issue-list` `workfolder` `code-editor` `chat` `issue-detail` `terminal` `git-commits` `code-favorites` `worktree-panel` `activity-log`
- workflow-editor: `node-sidebar` `canvas-style` `variables` `canvas` `properties` `history` `node-list` `staging` `execution-bar`

## 本项目已有引导清单（参考实现）

照着这些现成实现抄即可：

| 目标 | 文件 | 命名空间 | localStorage key |
|------|------|---------|-----------------|
| Chat 页（工作区切换/管理 agent/添加 agent/agent 工作区/额外目录） | `app/chat/page.tsx` | `chat.tour` | `agent-spaces:chat-tour-completed` |
| 工作区各 tab | `components/layout/workspace-shell.tsx` | `workspaceShell.tour` | `agent-spaces:workspace-tour-completed` |
| 工作流编辑器（9 tab + 插件管理/预览/触发器/agent 助手） | `components/workflow/workflow-editor.tsx` | `workflows.tour` | `agent-spaces:workflow-tour-completed` |

## API 速查（v3，本项目用到的）

| 字段 | 位置 | 说明 |
|------|------|------|
| `continuous: true` | Props 顶层 | 连续播放，显示 Next 按钮 |
| `run` | Props 顶层 | 控制启停 |
| `steps` | Props 顶层 | `Step[]`，每步需 `target` + `content` |
| `locale` | Props 顶层 | 5 个按钮文案键 back/close/last/next/skip |
| `options.showProgress` | options 内 | 显示「2 of 5」进度 |
| `options.buttons` | options 内 | `['back','close','primary','skip']` 含跳过按钮 |
| `onEvent` | Props 顶层 | 监听结束：`data.status === STATUS.FINISHED/SKIPPED` |
| `target` | Step | CSS selector / HTMLElement / ref / 函数 |
| `placement` | Step | 默认 `bottom`，center 需配 `target:'body'` |
| `skipBeacon` | Step | `true` 跳过脉动点直接显示 tooltip，建议仅第一步 |

> ⚠️ v3 常见坑：`showProgress`/`buttons`/`skipBeacon` 都属于 **options 或 Step 字段**，不是 Props 顶层；没有 `showSkipButton`/`disableBeacon`（那是 v2 的字段名）。

## 检查清单（改完逐项确认）

- [ ] 目标元素已加锚点（className / `data-tour` / `data-tour-tab`）
- [ ] 组件内集成 `useJoyride`，`Tour` 已在 JSX 渲染
- [ ] 首次自动启动 effect 已加（含 `isMobile` 守卫）
- [ ] i18n：en + zh 都加了 `tour` 子对象，每步有 `xxx` + `xxxTitle`，加 5 个按钮键
- [ ] 新命名空间已注册到 `locales/{en,zh}/index.ts`
- [ ] 设置页 general-tab 加了重放入口（含 settings.json 文案）
- [ ] 跨页触发：URL 参数或 sessionStorage 中转已接好
- [ ] `npx tsc --noEmit -p packages/web/tsconfig.json` 无新错误

## 验收

让用户：
1. 首次访问目标页，引导自动弹出，每步 spotlight 正确定位
2. 引导结束/跳过后不再自动弹
3. 设置 → 通用 → 对应「重放」按钮可重新触发
4. 切换中/英文，文案正确
5. 控制台 `localStorage.removeItem('<key>')` 后刷新可再次自动触发
