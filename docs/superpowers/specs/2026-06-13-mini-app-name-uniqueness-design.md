# Mini App name 全局唯一校验 — 设计

- **日期**：2026-06-13
- **范围**：Mini App 项目的 `name` 唯一性约束与重复报错反馈
- **状态**：已确认，待实现

## 1. 背景与目标

Mini App 项目当前以物理 id `wui_{时间戳}_{uuid}` 作为目录名、`manifest.id`、URL `:id` 与 `rebuildIndex` 的 `/^wui_/` 校验对象，`name` 仅是可重复的展示字段。

本次让 `name` 成为**业务唯一标识**（物理 id 不变）：创建、改名、导入时若 `name` 与已有项目重复，后端返回 **409 Conflict**，前端编辑/创建对话框在 name 输入框下方内联显示红字提示，并保持对话框打开。

物理 id 维持 `wui_*` 不变 —— `name` 可能含中文/空格/特殊符号，不适合做文件系统目录名或 URL，故不替换物理 id。

## 2. 关键决策

| 决策点 | 选择 |
|--------|------|
| id 语义 | name 全局唯一校验，物理 id (`wui_*`) 不变 |
| 校验层 | store 层统一校验（单一数据真相源，覆盖 create/update/import 三入口） |
| 后端错误识别 | 自定义 `DuplicateNameError`，route 用 `instanceof` 判别返回 409 |
| HTTP 状态码 | 409 Conflict |
| 比较规则 | trim 后**精确匹配、大小写敏感** |
| 前端覆盖范围 | 编辑对话框 + 创建对话框（内联红字）；商店导入不改 |

## 3. 后端 store 层

文件：`packages/server/src/storage/mini-app-store.ts`

- 新增 `export class DuplicateNameError extends Error`，构造函数接收冲突的 `name`，置 `this.name = 'DuplicateNameError'`。
- 新增私有辅助 `assertNameUnique(name: string, excludeId?: string): void`：
  - `const target = name.trim();`
  - 遍历 `listProjects()`，若存在 `p.id !== excludeId && p.name.trim() === target` 则 `throw new DuplicateNameError(name)`。
- 三处调用：
  - `createProject`：在生成 id 前调用 `assertNameUnique(input.name)`。
  - `updateProject`：函数开头，若 `updates.name !== undefined` 调用 `assertNameUnique(updates.name, projectId)`（`excludeId` 排除自身，避免未改名误报）。
  - `importFromDir`：在生成 id 前调用 `assertNameUnique(manifest.name)`（保证数据不变量）。

## 4. 后端 route 层

文件：`packages/server/src/routes/mini-apps.ts`

- 顶部 import `DuplicateNameError`（从 `../storage/mini-app-store.js`）。
- `POST /`、`PUT /:id`、`POST /import` 的 catch 分支，在现有 `'not found'→404 / 500` 逻辑之前增加：
  ```ts
  if (error instanceof DuplicateNameError) {
    res.status(409).json({ error: 'name already exists' });
    return;
  }
  ```
- 错误消息保持英文（与现有风格一致）；前端实际展示文案来自 i18n，由 `status === 409` 触发，不依赖消息内容。

## 5. 前端编辑对话框

文件：`packages/web/src/components/mini-apps/mini-apps-edit-dialog.tsx`

- 增加 `const [error, setError] = useState('')`。
- name 输入框 `onChange` 时 `setError('')`。
- `handleSave` 改为 try/catch：成功路径才调用 `onUpdated` 与 `onOpenChange(false)`；catch 中：
  - `e?.status === 409` → `setError(t('edit.nameExists'))`
  - 其他 → 解析 `ApiError.body`（`JSON.parse` 取 `error` 字段）兜底，失败回退到通用文案。
- name 输入框下方渲染红字 `<p className="text-xs text-destructive">{error}</p>`（仅非空时显示）。

## 6. 前端创建对话框

文件：`packages/web/src/components/mini-apps/mini-apps-create-dialog.tsx`

- 与编辑对话框相同结构：`error` state、name `onChange` 清空、`handleCreate` try/catch（成功才跳转）、name 下方红字。
- 文案用 `create.nameExists`。

## 7. i18n

文件：`packages/web/src/locales/{zh,en}/mini-apps.json`

新增 key：

| key | zh | en |
|-----|----|----|
| `edit.nameExists` | 该名称已存在，请换一个 | This name already exists. Try another. |
| `create.nameExists` | 该名称已存在，请换一个 | This name already exists. Try another. |

## 8. 范围外（不改）

- 商店导入 `mini-apps-store-dialog.tsx`：后端 import 仍校验并返回 409，但前端不加反馈（沿用现状 try/finally）。

## 9. 验证

手动验证（项目无单测基础设施）：

1. 创建项目 A（name="测试"）→ 成功。
2. 再创建 name="测试" → 创建对话框显示红字、不跳转。
3. 创建项目 B，编辑 B 把 name 改成 "测试" → 编辑对话框显示红字、不关闭。
4. 编辑 B 把 name 改成 B 自身原名 → 正常保存（排除自身不误报）。
5. 创建 name=" 测试 "（带空格）→ 与 "测试" 判为重复。
6. `pnpm build` 通过类型检查。

## 10. 涉及文件

1. `packages/server/src/storage/mini-app-store.ts` — `DuplicateNameError`、`assertNameUnique`、三处调用
2. `packages/server/src/routes/mini-apps.ts` — 三处 catch 加 409 分支
3. `packages/web/src/components/mini-apps/mini-apps-edit-dialog.tsx` — error state + catch + 红字
4. `packages/web/src/components/mini-apps/mini-apps-create-dialog.tsx` — 同上
5. `packages/web/src/locales/zh/mini-apps.json` — `*.nameExists`
6. `packages/web/src/locales/en/mini-apps.json` — `*.nameExists`
