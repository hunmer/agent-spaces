# Mini-app 商店详情页（README 介绍）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 mini-app 模板可附带 README 介绍，商店卡片可点进详情页（左元信息 / 右 Markdown 渲染 README）。

**Architecture:** pack-mini-apps.mjs 检测 `{id}/README.md` → 写 `hasIntro` 到 zip manifest + 复制到商店 `mini-app/intro/{id}.md`；generate-index.mjs 透出 `hasIntro/version/tags` 到商店 index.json；前端商店对话框读 `hasIntro`，fetch `intro/{id}.md` 用 Markdown 组件渲染。

**Tech Stack:** Node ESM 脚本（零依赖）、Next.js 16 + React + TypeScript、shadcn/ui、Tailwind、next-intl、react-markdown。

**Testing approach:** 项目无单测框架。脚本改动用**实际运行 + node 内联断言检查产物**验证；前端改动用 `lint` + `build` + 手动验证。每个 Task 末尾提交。

**Spec:** [docs/superpowers/specs/2026-06-16-mini-app-intro-detail-page-design.md](../specs/2026-06-16-mini-app-intro-detail-page-design.md)

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/templates/pack-mini-apps.mjs` | Modify | 检测 README、写 `hasIntro` 到 manifest、复制 README 到 `intro/{id}.md` |
| `packages/templates/generate-index.mjs` | Modify | `scanMiniAppStore` 透出 `hasIntro/version/tags` |
| `packages/web/src/locales/zh/mini-apps.json` | Modify | 新增 `detail.*` 中文翻译 |
| `packages/web/src/locales/en/mini-apps.json` | Modify | 新增 `detail.*` 英文翻译 |
| `packages/web/src/components/mini-apps/mini-apps-store-dialog.tsx` | Modify | `MiniAppIndexItem` 扩展字段、详情页视图（状态/fetch/两栏布局/Markdown） |
| `packages/server/agent-spaces-data/mini-apps/podcast_generator/README.md` | Create（验证用） | 端到端验证样例 README |

---

### Task 1: pack-mini-apps.mjs — 检测 README 并产出 hasIntro + intro 文件

**Files:**
- Modify: `packages/templates/pack-mini-apps.mjs:119-128`（`KEEP_FIELDS`）、`packages/templates/pack-mini-apps.mjs:184-209`（manifest 构建与 zip 写入之间）

- [ ] **Step 1: 在 `KEEP_FIELDS` 加 `hasIntro`**

在 `packages/templates/pack-mini-apps.mjs` 找到 `KEEP_FIELDS` 数组（约 119 行），把 `'hasIntro'` 加入末尾：

```js
const KEEP_FIELDS = [
  'name', 'description', 'version', 'type', 'tags', 'mainFile',
  'enabledPlugins', 'enableAgents', 'icon', 'avatarUrl', 'backgroundUrl',
  'hasIntro',
];
```

- [ ] **Step 2: 在 manifest 构建后、entries 构建前，加入 README 检测 + 复制逻辑**

在 `const manifest = buildManifest(id, diskManifest, meta);`（约 184 行）之后、`const entries = [...]`（约 185 行）之前，插入：

```js
    // README 介绍：检测到则标记 hasIntro 并复制到商店 mini-app/intro/{id}.md
    const readmePath = join(projectDir, 'README.md');
    if (existsSync(readmePath) && statSync(readmePath).isFile()) {
      manifest.hasIntro = true;
      const introDir = join(out, 'intro');
      mkdirSync(introDir, { recursive: true });
      writeFileSync(join(introDir, `${id}.md`), readFileSync(readmePath));
    }
```

- [ ] **Step 3: 先放一个样例 README 触发分支（验证用，本 Task 内临时）**

创建 `packages/server/agent-spaces-data/mini-apps/podcast_generator/README.md`：

```markdown
# 电子书转播客

上传 EPUB 电子书，选择章节，AI 阅读后生成双人播客对话脚本。

## 功能

- EPUB 章节解析
- AI 双人对话脚本生成
- 历史记录管理
```

- [ ] **Step 4: 运行 pack 并验证产物**

Run:
```bash
cd g:/agent_spaces && node packages/templates/pack-mini-apps.mjs
```
Expected: 控制台打印 `[pack] podcast_generator -> ... (N files)`；

验证脚本（Node 内联断言）：
```bash
node -e "const fs=require('fs');const p=require('node:zlib').inflateRawSync(fs.readFileSync('packages/templates/mini-app/podcast_generator.zip'));/* zip 解析略，改用 generate-index 验证 manifest */"
```
（zip 内 manifest 校验在 Task 2 末尾通过 generate-index 间接验证；此处先验证 intro 文件已生成）

验证 intro 文件：
```bash
ls packages/templates/mini-app/intro/podcast_generator.md
```
Expected: 文件存在，内容为 Step 3 的 README 文本。

- [ ] **Step 5: Commit**

```bash
git add packages/templates/pack-mini-apps.mjs packages/server/agent-spaces-data/mini-apps/podcast_generator/README.md
git commit -m "feat(templates): pack README into mini-app manifest hasIntro + intro/{id}.md"
```

---

### Task 2: generate-index.mjs — 透出 hasIntro/version/tags

**Files:**
- Modify: `packages/templates/generate-index.mjs:414-423`（manifest 解析）、`packages/templates/generate-index.mjs:439`（index.push）

- [ ] **Step 1: 在 manifest 解析处提取新字段**

在 `scanMiniAppStore` 中，找到解析 manifest 的 try 块（约 414-423 行）：

```js
    const manifestBuf = zip.read('manifest.json');
    if (manifestBuf) {
      try {
        const manifest = JSON.parse(manifestBuf.toString('utf-8'));
        name = manifest.name || name;
        icon = manifest.icon;
        description = manifest.description;
        type = manifest.type;
      } catch { /* ignore */ }
    }
```

改为（增加 version/tags/hasIntro 局部变量提取）：

```js
    const manifestBuf = zip.read('manifest.json');
    let version;
    let tags;
    let hasIntro = false;
    if (manifestBuf) {
      try {
        const manifest = JSON.parse(manifestBuf.toString('utf-8'));
        name = manifest.name || name;
        icon = manifest.icon;
        description = manifest.description;
        type = manifest.type;
        version = manifest.version;
        tags = Array.isArray(manifest.tags) ? manifest.tags : [];
        hasIntro = manifest.hasIntro === true;
      } catch { /* ignore */ }
    }
```

- [ ] **Step 2: 把新字段写入 index.push**

找到 `index.push({ id, name, type, icon, iconUrl, description, zipUrl: ..., md5, updatedAt });`（约 439 行），改为：

```js
    index.push({
      id, name, type, icon, iconUrl, description,
      hasIntro, version, tags,
      zipUrl: `mini-app/${entry.name}`, md5, updatedAt,
    });
```

- [ ] **Step 3: 运行 generate-index 并验证 index.json 字段**

Run:
```bash
cd g:/agent_spaces && node packages/templates/generate-index.mjs
```
Expected: 控制台打印 `[mini-app] N templates` 等。

验证 podcast_generator 项含 `hasIntro:true` 且 version/tags 存在；tts 项（无 README）`hasIntro:false`：
```bash
node -e "const a=require('./packages/templates/mini-app/index.json');const byId=i=>a.find(x=>x.id===i);console.log('podcast:',JSON.stringify({hasIntro:byId('podcast_generator').hasIntro,version:byId('podcast_generator').version,tags:byId('podcast_generator').tags}));console.log('tts:',JSON.stringify({hasIntro:byId('tts').hasIntro}));"
```
Expected:
```
podcast: {"hasIntro":true,"version":"1.0.0","tags":["电子书","播客","EPUB","AI"]}
tts: {"hasIntro":false}
```

- [ ] **Step 4: 验证 zip 内 manifest 含 hasIntro（Task 1 的间接验证）**

```bash
node -e "const fs=require('fs');const zlib=require('node:zlib');const buf=fs.readFileSync('packages/templates/mini-app/podcast_generator.zip');for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){if(buf[i]===0x50&&buf[i+1]===0x4b&&buf[i+2]===0x05&&buf[i+3]===0x06){const cdOff=buf.readUInt32LE(i+16);const cnt=buf.readUInt16LE(i+10);let p=cdOff;for(let j=0;j<cnt;j++){const nameLen=buf.readUInt16LE(p+28);const extraLen=buf.readUInt16LE(p+30);const name=buf.toString('utf8',p+46,p+46+nameLen);const lh=buf.readUInt32LE(p+42);const dStart=lh+30+buf.readUInt16LE(lh+26)+buf.readUInt16LE(lh+28);const compMethod=buf.readUInt16LE(p+10);const compSize=buf.readUInt32LE(p+20);if(name==='manifest.json'){const raw=buf.subarray(dStart,dStart+compSize);const txt=(compMethod===8?zlib.inflateRawSync(raw):raw).toString();const m=JSON.parse(txt);console.log('manifest hasIntro:',m.hasIntro,'version:',m.version);break;}p+=46+nameLen+extraLen+buf.readUInt16LE(p+32);}break;}}"
```
Expected: `manifest hasIntro: true version: 1.0.0`

- [ ] **Step 5: Commit**

```bash
git add packages/templates/generate-index.mjs
git commit -m "feat(templates): expose hasIntro/version/tags in mini-app store index"
```

---

### Task 3: i18n — 新增 detail.* 翻译（中/英）

**Files:**
- Modify: `packages/web/src/locales/zh/mini-apps.json`、`packages/web/src/locales/en/mini-apps.json`

- [ ] **Step 1: 中文 — 在 `store` 对象后追加 `detail` 对象**

在 `packages/web/src/locales/zh/mini-apps.json` 中，找到 `"store": { ... }` 对象（其结尾是 `"update": "更新"` 后的 `}`），在其后、下一个顶层 key（`"editor"`）之前，插入 `detail` 对象：

```json
  "detail": {
    "back": "返回列表",
    "loading": "加载中…",
    "error": "加载失败",
    "empty": "暂无介绍",
    "type": "类型",
    "version": "版本",
    "tags": "标签",
    "updatedAt": "更新时间"
  },
```

（注意前后逗号：`store` 对象的闭合 `}` 后要有 `,`，`detail` 对象闭合 `}` 后要有 `,` 接 `editor`。）

- [ ] **Step 2: 英文 — 同结构追加**

在 `packages/web/src/locales/en/mini-apps.json` 同位置插入：

```json
  "detail": {
    "back": "Back",
    "loading": "Loading...",
    "error": "Failed to load",
    "empty": "No introduction",
    "type": "Type",
    "version": "Version",
    "tags": "Tags",
    "updatedAt": "Updated"
  },
```

- [ ] **Step 3: 验证 JSON 合法**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('packages/web/src/locales/zh/mini-apps.json','utf8'));JSON.parse(require('fs').readFileSync('packages/web/src/locales/en/mini-apps.json','utf8'));console.log('json ok')"
```
Expected: `json ok`

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/locales/zh/mini-apps.json packages/web/src/locales/en/mini-apps.json
git commit -m "feat(web): add mini-app store detail i18n keys"
```

---

### Task 4: 前端 — 类型扩展 + 状态 + 列表卡片可点击

**Files:**
- Modify: `packages/web/src/components/mini-apps/mini-apps-store-dialog.tsx`

- [ ] **Step 1: 扩展 `MiniAppIndexItem` 接口**

在 `mini-apps-store-dialog.tsx` 找到 `interface MiniAppIndexItem`（约 25 行），追加三个可选字段：

```ts
interface MiniAppIndexItem {
  id: string;
  name: string;
  type?: 'react' | 'html';
  icon?: string;
  iconUrl?: string;
  description?: string;
  zipUrl?: string;
  md5?: string;
  updatedAt?: string;
  hasIntro?: boolean;
  version?: string;
  tags?: string[];
}
```

- [ ] **Step 2: 调整 import 引入详情页所需图标与组件**

修改文件顶部 import（约 1-17 行）：

- `lucide-react` 那行加入 `ArrowLeft`：
```ts
import { Download, Store, Check, RefreshCw, ArrowLeft } from 'lucide-react';
```
- 在 `import { sdk } from '@/lib/sdk';` 之后新增一行：
```ts
import { Markdown } from '@/components/ui/markdown';
```

- [ ] **Step 3: 在 `miniAppStoreDialog` 组件内加 `selected` 状态 + 关闭时重置**

在 `const [installedMap, setInstalledMap] = useState<Record<string, string>>({});`（约 45 行）之后新增：

```ts
  // 当前查看详情的插件；null = 列表视图，非 null = 详情视图
  const [selected, setSelected] = useState<MiniAppIndexItem | null>(null);
```

在 `return (` 之前（`handleImport` 函数之后），新增关闭时重置 selected 的包装：

```ts
  const handleOpenChange = (open: boolean) => {
    if (!open) setSelected(null);
    onOpenChange(open);
  };
```

- [ ] **Step 4: Dialog 用 handleOpenChange，并新增日期格式化工具函数**

把 `return` 里的 `<Dialog open={open} onOpenChange={onOpenChange}>` 改为：

```tsx
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
```

在文件顶层（`interface MiniAppIndexItem` 之后、`type InstallStatus` 之前或之后均可）新增日期格式化辅助函数：

```ts
function formatLocalDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}
```

- [ ] **Step 5: 列表卡片根 div 可点击，导入按钮 stopPropagation**

找到卡片根 div（约 144-147 行）：

```tsx
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors flex flex-col gap-3"
                  >
```

改为：

```tsx
                  <div
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors flex flex-col gap-3 cursor-pointer"
                  >
```

找到导入 Button 的 `onClick={() => handleImport(item)}`（约 165 行），改为带 stopPropagation：

```tsx
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImport(item);
                      }}
```

- [ ] **Step 6: lint 验证（此 Task 改动可独立 lint）**

Run:
```bash
cd g:/agent_spaces/packages/web && pnpm lint
```
Expected: 无新增错误（若 detail 视图 UI 尚未用到 ArrowLeft/Markdown，会出现 unused 警告——属于正常，下一 Task 会用上；若有 unused 报错为 error 级，可暂时保留 Task 5 完成后再统一 lint）。

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/mini-apps/mini-apps-store-dialog.tsx
git commit -m "feat(web): make mini-app store card clickable & extend item type"
```

---

### Task 5: 前端 — 详情页视图（返回 + 两栏 + Markdown 渲染）

**Files:**
- Modify: `packages/web/src/components/mini-apps/mini-apps-store-dialog.tsx`

- [ ] **Step 1: 在文件顶层新增 `Meta` 与 `MiniAppDetail` 子组件**

在 `export function miniAppStoreDialog(...)` 之前新增两个组件：

```tsx
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full text-left text-sm">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{value}</span>
    </div>
  );
}

function MiniAppDetail({ item, onBack }: { item: MiniAppIndexItem; onBack: () => void }) {
  const t = useTranslations('mini-apps');
  const [intro, setIntro] = useState<{ loading: boolean; content: string; error: boolean }>({
    loading: false,
    content: '',
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!item.hasIntro) {
      setIntro({ loading: false, content: '', error: false });
      return;
    }
    setIntro({ loading: true, content: '', error: false });
    fetch(resolveStoreUrl(`mini-app/intro/${item.id}.md`))
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setIntro({ loading: false, content: text, error: false });
      })
      .catch(() => {
        if (!cancelled) setIntro({ loading: false, content: '', error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.hasIntro]);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" />
        {t('detail.back')}
      </Button>
      <div className="flex gap-6">
        {/* 左栏：插件信息 */}
        <aside className="w-60 shrink-0 flex flex-col items-center text-center gap-3 rounded-xl border border-border bg-background p-4 self-start">
          <AgentIcon
            name={item.name}
            avatarUrl={item.iconUrl ? resolveStoreUrl(item.iconUrl) : undefined}
            icon={item.icon}
            className="size-16 rounded"
          />
          <span className="font-semibold text-base break-all">{item.name}</span>
          {item.description && (
            <p className="text-xs text-muted-foreground break-all">{item.description}</p>
          )}
          <div className="w-full border-t my-1" />
          <Meta label={t('detail.type')} value={item.type || '-'} />
          <Meta label={t('detail.version')} value={item.version || '-'} />
          <Meta
            label={t('detail.tags')}
            value={Array.isArray(item.tags) && item.tags.length ? item.tags.join(', ') : '-'}
          />
          <Meta label={t('detail.updatedAt')} value={formatLocalDate(item.updatedAt) || '-'} />
        </aside>
        {/* 右栏：Markdown 介绍 */}
        <div className="flex-1 min-w-0">
          {item.hasIntro ? (
            intro.loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('detail.loading')}
              </div>
            ) : intro.error ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {t('detail.error')}
              </div>
            ) : (
              <Markdown content={intro.content} />
            )
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {t('detail.empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 ScrollArea 内根据 `selected` 切换列表/详情视图**

找到 ScrollArea 内的三元渲染（约 134-191 行）：

```tsx
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.loading')}</div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.empty')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-2">
              ...
            </div>
          )}
        </ScrollArea>
```

在最外层包一层 `selected` 判断——改为：

```tsx
        <ScrollArea className="flex-1 -mx-6 px-6">
          {selected ? (
            <MiniAppDetail item={selected} onBack={() => setSelected(null)} />
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.loading')}</div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.empty')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-2">
              {/* 原有卡片渲染保持不变 */}
              ...
            </div>
          )}
        </ScrollArea>
```

（即：把原来的 `loading ? ... : empty ? ... : grid` 整体作为 `selected ? <Detail/> : (原三元)` 的 else 分支。卡片 grid 内部代码不动。）

- [ ] **Step 3: lint + build 验证**

Run:
```bash
cd g:/agent_spaces/packages/web && pnpm lint
```
Expected: 无错误（ArrowLeft、Markdown 均已被使用）。

Run:
```bash
cd g:/agent_spaces/packages/web && pnpm build
```
Expected: 构建成功，无类型错误。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/mini-apps/mini-apps-store-dialog.tsx
git commit -m "feat(web): mini-app store detail page with markdown intro"
```

---

### Task 6: 端到端手动验证

**Files:** 无（验证 Task 1 留下的样例 README 是否端到端生效）

- [ ] **Step 1: 确认商店 index.json / intro 文件就绪**

Run:
```bash
cd g:/agent_spaces && node packages/templates/pack-mini-apps.mjs && node packages/templates/generate-index.mjs
node -e "const a=require('./packages/templates/mini-app/index.json');console.log(JSON.stringify(a.find(x=>x.id==='podcast_generator'),null,2))"
```
Expected: podcast_generator 项含 `"hasIntro": true`、`"version": "1.0.0"`、`"tags": [...]`；`intro/podcast_generator.md` 存在。

- [ ] **Step 2: 启动 dev 并打开商店详情页**

Run:
```bash
cd g:/agent_spaces && pnpm dev
```
（server 3100 / web 3000）

浏览器手动操作：
1. 进入 Mini Apps 页 → 打开「模板商店」对话框。
2. 点击 `podcast_generator` 卡片（**非导入按钮**）→ 进入详情页。
3. 核对左侧：图标 + 名称「电子书转播客」+ description + 类型/版本/标签/更新时间（更新时间为 `YYYY/MM/DD`）。
4. 核对右侧：渲染 README（标题、功能列表）。
5. 点击「← 返回列表」→ 回到卡片网格。
6. 点击 `tts` 卡片（无 README）→ 右侧显示「暂无介绍」，左侧元信息照常展示。
7. 点击导入按钮 → 触发导入（**不应**进入详情页，验证 stopPropagation）。

Expected: 全部符合预期。

- [ ] **Step 3: 移除验证用 README（如不打算长期保留）—— 可选**

若 `packages/server/agent-spaces-data/mini-apps/podcast_generator/README.md` 仅用于验证、不想进仓库：

```bash
rm packages/server/agent-spaces-data/mini-apps/podcast_generator/README.md
cd g:/agent_spaces && node packages/templates/pack-mini-apps.mjs && node packages/templates/generate-index.mjs
node -e "console.log('podcast hasIntro:', require('./packages/templates/mini-app/index.json').find(x=>x.id==='podcast_generator').hasIntro)"
```
Expected: `podcast hasIntro: false`，且 `intro/podcast_generator.md` 不再被刷新（如需删除旧产物：`rm packages/templates/mini-app/intro/podcast_generator.md`）。

> 决策点交由用户：样例 README 保留或删除，取决于是否希望 podcast_generator 在商店带介绍。

- [ ] **Step 4: 最终 lint 全量**

Run:
```bash
cd g:/agent_spaces && pnpm lint
```
Expected: 全包无错误。

---

## Self-Review

**Spec coverage:**
- §4.1 pack README 检测/复制/KEEP_FIELDS → Task 1 ✓
- §4.2 generate-index 透出 hasIntro/version/tags → Task 2 ✓
- §5.1 类型扩展 → Task 4 Step 1 ✓
- §5.1 状态（selected/intro）+ fetch + hasIntro=false 占位 → Task 5 Step 1 ✓
- §5.1 卡片可点击 + stopPropagation → Task 4 Step 5 ✓
- §5.1 两栏布局、左栏元信息、description 在名称下、updatedAt 本地日期 → Task 5 Step 1 ✓
- §5.1 Markdown 组件复用 → Task 5 Step 1 ✓
- §5.2 i18n detail.* 中英 → Task 3 ✓
- §6 验证 → Task 6 ✓

**Placeholder scan:** 无 TBD/TODO；每步含完整代码或确切命令 + expected。

**Type consistency:** `MiniAppIndexItem` 的 `hasIntro?: boolean / version?: string / tags?: string[]` 在 Task 4 定义、Task 5 使用一致；`formatLocalDate` 在 Task 4 Step 4 定义、Task 5 Step 1 使用一致；`MiniAppDetail` / `Meta` 在 Task 5 Step 1 定义、Step 2 使用一致。

**备注：**
- Task 4 Step 6 的 lint 可能因 ArrowLeft/Markdown 暂未使用而告警；若项目 ESLint 把 unused 当 error，可在该步先注释 import、Task 5 再启用——多数 shadcn 项目 unused 为 warn，照计划走即可。
- README 样例的去留（Task 6 Step 3）由用户决定。
