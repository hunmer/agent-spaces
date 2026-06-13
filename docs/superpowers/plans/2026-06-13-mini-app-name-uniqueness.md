# Mini App name 全局唯一校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Mini App 的 `name` 成为业务唯一标识；创建/改名/导入重复 name 时后端返回 409，前端编辑与创建对话框内联红字提示。

**Architecture:** store 层作为单一数据真相源统一查重（自定义 `DuplicateNameError`），route 用 `instanceof` 判别映射为 409 Conflict；前端提取 `ApiError.status===409` 显示 i18n 文案。

**Tech Stack:** TypeScript（server ESM `.js` 后缀 / web `"use client"`）、Express 5、React + next-intl、sonner/tailwind。

**测试策略:** 项目无单测基础设施，采用 `tsc` 类型检查 + 手动验证替代 TDD。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `packages/server/src/storage/mini-app-store.ts` | 数据层：查重不变量 | Modify |
| `packages/server/src/routes/mini-apps.ts` | HTTP：409 映射 | Modify |
| `packages/web/src/lib/api-error.ts` | 前端 ApiError 解析辅助（DRY） | Create |
| `packages/web/src/components/mini-apps/mini-apps-edit-dialog.tsx` | 编辑对话框错误反馈 | Modify |
| `packages/web/src/components/mini-apps/mini-apps-create-dialog.tsx` | 创建对话框错误反馈 | Modify |
| `packages/web/src/locales/zh/mini-apps.json` | 中文文案 | Modify |
| `packages/web/src/locales/en/mini-apps.json` | 英文文案 | Modify |

---

### Task 1: store 层 — 查重不变量

**Files:**
- Modify: `packages/server/src/storage/mini-app-store.ts`

- [ ] **Step 1: 新增 `DuplicateNameError` 与 `assertNameUnique`**

在 `listProjects()` 函数之后、`getProject` 之前插入：

```ts
/** name 与已有项目重复时抛出。route 层用 instanceof 判别并返回 409。 */
export class DuplicateNameError extends Error {
  constructor(public readonly duplicateName: string) {
    super(`Mini app name already exists: ${duplicateName}`);
    this.name = 'DuplicateNameError';
  }
}

/**
 * 校验 name 在全局唯一（trim 后精确匹配、大小写敏感）。
 * @param excludeId 更新场景排除自身，避免未改名误报。
 */
function assertNameUnique(name: string, excludeId?: string): void {
  const target = name.trim();
  const conflict = listProjects().find(
    (p) => p.id !== excludeId && p.name.trim() === target,
  );
  if (conflict) throw new DuplicateNameError(name);
}
```

- [ ] **Step 2: `createProject` 开头查重**

在 `createProject` 函数体第一行（`const id = ...` 之前）加：

```ts
  assertNameUnique(input.name);
```

- [ ] **Step 3: `updateProject` 开头查重（排除自身）**

在 `updateProject` 函数体第一行（`const projects = listProjects();` 之前）加：

```ts
  if (updates.name !== undefined) assertNameUnique(updates.name, projectId);
```

- [ ] **Step 4: `importFromDir` 开头查重**

在 `importFromDir` 函数体第一行（`const id = ...` 之前）加：

```ts
  assertNameUnique(manifest.name);
```

- [ ] **Step 5: 类型检查**

Run: `pnpm --filter @agent-spaces/server exec tsc --noEmit`
Expected: 无错误。

---

### Task 2: route 层 — 409 映射

**Files:**
- Modify: `packages/server/src/routes/mini-apps.ts`

- [ ] **Step 1: import `DuplicateNameError`**

将第 10 行 import 追加 `DuplicateNameError`：

```ts
import { getProject, readAgentsConfig, readAgentConfig, upsertAgentConfig, listAgentChats, clearAgentChats, DuplicateNameError } from '../storage/mini-app-store.js';
```

- [ ] **Step 2: `POST /` catch 加 409 分支**

将 `router.post('/', ...)` 的 catch 改为：

```ts
  } catch (error: any) {
    if (error instanceof DuplicateNameError) { res.status(409).json({ error: 'name already exists' }); return; }
    res.status(500).json({ error: error.message });
  }
```

- [ ] **Step 3: `PUT /:id` catch 加 409 分支**

将 `router.put('/:id', ...)` 的 catch 改为：

```ts
  } catch (error: any) {
    if (error instanceof DuplicateNameError) { res.status(409).json({ error: 'name already exists' }); return; }
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
```

- [ ] **Step 4: `POST /import` catch 加 409 分支**

将 `router.post('/import', ...)` 的 catch 改为：

```ts
  } catch (error: any) {
    if (error instanceof DuplicateNameError) { res.status(409).json({ error: 'name already exists' }); return; }
    res.status(500).json({ error: error.message });
  }
```

- [ ] **Step 5: 类型检查**

Run: `pnpm --filter @agent-spaces/server exec tsc --noEmit`
Expected: 无错误。

---

### Task 3: 前端 ApiError 解析辅助

**Files:**
- Create: `packages/web/src/lib/api-error.ts`

- [ ] **Step 1: 创建辅助模块**

```ts
/**
 * 前端 ApiError 解析辅助。不依赖 sdk 是否导出 ApiError 类型，
 * 用结构判别（ApiError 含 readonly status / body）。
 */

/** 取错误对应的 HTTP 状态码；非 ApiError 返回 undefined。 */
export function getApiErrorStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    return (e as { status: number }).status;
  }
  return undefined;
}

/** 解析 ApiError.body 里的 { error } 字段；失败回退到 Error.message 或 String(e)。 */
export function readApiErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'body' in e && typeof (e as { body: unknown }).body === 'string') {
    try {
      const parsed = JSON.parse((e as { body: string }).body);
      if (parsed && typeof parsed.error === 'string') return parsed.error;
    } catch { /* ignore */ }
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
```

---

### Task 4: 编辑对话框错误反馈

**Files:**
- Modify: `packages/web/src/components/mini-apps/mini-apps-edit-dialog.tsx`

- [ ] **Step 1: import 辅助**

在 `import { sdk } from '@/lib/sdk';` 之后加：

```ts
import { getApiErrorStatus, readApiErrorMessage } from '@/lib/api-error';
```

- [ ] **Step 2: 增加 `error` state**

在 `const [saving, setSaving] = useState(false);` 之后加：

```ts
  const [error, setError] = useState('');
```

- [ ] **Step 3: `handleSave` 改 try/catch**

将整个 `handleSave` 替换为：

```ts
  const handleSave = async () => {
    if (!project || !name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await sdk.miniApp.update(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon || undefined,
        ...(avatarCleared ? { avatarUrl: '' } : {}),
      });
      setError('');
      onUpdated?.(updated);
      onOpenChange(false);
    } catch (e: unknown) {
      if (getApiErrorStatus(e) === 409) {
        setError(t('edit.nameExists'));
      } else {
        setError(readApiErrorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 4: name 输入框 onChange 清空 error，并在下方渲染红字**

将 name 输入框区块替换为：

```tsx
            <div className="flex-1 pb-0.5">
              <Label className="text-xs text-muted-foreground mb-1">{t('edit.name')}</Label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                disabled={saving}
                autoFocus
                className="h-7 text-sm"
              />
              {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            </div>
```

---

### Task 5: 创建对话框错误反馈

**Files:**
- Modify: `packages/web/src/components/mini-apps/mini-apps-create-dialog.tsx`

- [ ] **Step 1: import 辅助**

在 `import { sdk } from '@/lib/sdk';` 之后加：

```ts
import { getApiErrorStatus, readApiErrorMessage } from '@/lib/api-error';
```

- [ ] **Step 2: 增加 `error` state**

在 `const [creating, setCreating] = useState(false);` 之后加：

```ts
  const [error, setError] = useState('');
```

- [ ] **Step 3: `handleCreate` 改 try/catch**

将整个 `handleCreate` 替换为：

```ts
  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const project = await sdk.miniApp.create({ name: trimmed, type, description: description.trim() || undefined });
      setError('');
      onOpenChange(false);
      setName('');
      setDescription('');
      setType('react');
      nativeNavigate(router, `/mini-apps/${project.id}`);
    } catch (e: unknown) {
      if (getApiErrorStatus(e) === 409) {
        setError(t('create.nameExists'));
      } else {
        setError(readApiErrorMessage(e));
      }
    } finally {
      setCreating(false);
    }
  };
```

- [ ] **Step 4: name 输入框 onChange 清空 error，并在下方渲染红字**

将 name 输入框区块替换为：

```tsx
          <div className="space-y-2">
            <Label>{t('create.name')}</Label>
            <Input
              placeholder={t('create.namePlaceholder')}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              disabled={creating}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
```

---

### Task 6: i18n 文案

**Files:**
- Modify: `packages/web/src/locales/zh/mini-apps.json`
- Modify: `packages/web/src/locales/en/mini-apps.json`

- [ ] **Step 1: zh `edit` 块加 `nameExists`**

在 zh 的 `"edit": { ... }` 内 `"defaultBackground": "默认背景"` 之后加：

```json
    "nameExists": "该名称已存在，请换一个"
```

（注意把 `defaultBackground` 行尾加逗号）

- [ ] **Step 2: zh `create` 块加 `nameExists`**

在 zh 的 `"create": { ... }` 内 `"submit": "Create"` 之后加：

```json
    "nameExists": "该名称已存在，请换一个"
```

- [ ] **Step 3: en `edit` 块加 `nameExists`**

在 en 的 `"edit": { ... }` 内 `"defaultBackground"` 行后加：

```json
    "nameExists": "This name already exists. Try another."
```

- [ ] **Step 4: en `create` 块加 `nameExists`**

在 en 的 `"create": { ... }` 内 `"submit": "Create"` 之后加：

```json
    "nameExists": "This name already exists. Try another."
```

---

### Task 7: 验证

- [ ] **Step 1: server 类型检查**

Run: `pnpm --filter @agent-spaces/server exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 2: web 类型检查**

Run: `pnpm --filter @agent-spaces/web exec tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: 手动验证（启动 `pnpm dev` 后）**

1. 创建项目 A（name="测试"）→ 成功跳转。
2. 再创建 name="测试" → 创建对话框显示红字"该名称已存在，请换一个"、不跳转。
3. 创建项目 B，编辑 B 把 name 改成 "测试" → 编辑对话框显示红字、不关闭。
4. 编辑 B 不改名直接保存 → 正常保存（排除自身不误报）。
5. 创建 name=" 测试 "（带空格）→ 与 "测试" 判为重复。

Expected: 全部符合预期。

---

## Self-Review

**Spec coverage:**
- §3 store 层 DuplicateNameError + assertNameUnique + 三处调用 → Task 1 ✓
- §4 route 三处 409 → Task 2 ✓
- §5 编辑对话框 → Task 4 ✓
- §6 创建对话框 → Task 5 ✓
- §7 i18n → Task 6 ✓
- §9 验证 → Task 7 ✓
- 前端 ApiError 解析（spec §5/§6 提到"解析 body 兜底"）→ Task 3 抽出 DRY 辅助 ✓（spec 文件清单的合理细化）

**Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整代码。

**Type consistency:** `DuplicateNameError`（Task 1 定义）→ Task 2 import 同名 ✓；`getApiErrorStatus`/`readApiErrorMessage`（Task 3 定义）→ Task 4/5 同名 ✓；i18n key `edit.nameExists`/`create.nameExists`（Task 6 定义）→ Task 4/5 `t()` 引用同名 ✓。
