# 拆分多语言文件为多文件

## Context

`zh.json` 和 `en.json` 各 ~1290 行、45KB，维护困难。按顶层 key 拆分为独立文件。

## 方案

### 目录结构

```
src/locales/
  zh/
    common.json
    settings.json
    login.json
    workspaces.json
    workspace.json
    sidebar.json
    agent.json
    models.json
    providers.json
    chat.json
    issue.json
    task.json
    home.json
    editor.json
    terminal.json
    git.json
    projectSettings.json
    composer.json
    folderPicker.json
    commands.json
    skills.json
    prompts.json
    outputStyles.json
    mcps.json
    commandPalette.json
    database.json
    kanban.json
    tools.json
    index.ts          # 聚合导出
  en/
    (同上 28 个文件)
    index.ts
  zh.json             # 删除
  en.json             # 删除
```

### 修改文件

1. **生成 zh/ 和 en/ 下的 28 个 JSON 文件** — 从原 JSON 提取每个顶层 key
2. **新增 `zh/index.ts`** — 聚合所有 JSON 并导出完整 messages 对象
3. **新增 `en/index.ts`** — 同上
4. **修改 `src/components/locale-provider.tsx`** — `import zh from '@/locales/zh'` 改为 `import zh from '@/locales/zh/index'`（路径不变，TypeScript 自动解析 index.ts）
5. **修改 `src/i18n/request.ts`** — `import('@/locales/zh.json')` 改为 `import('@/locales/zh')`
6. **删除 `src/locales/zh.json` 和 `src/locales/en.json`**

### index.ts 模板

```typescript
import common from './common.json';
import settings from './settings.json';
// ... 其他 import

export default {
  common,
  settings,
  // ...
};
```

### 验证

1. `pnpm dev` 启动无报错
2. 中英文切换正常
3. `pnpm build` 构建通过
