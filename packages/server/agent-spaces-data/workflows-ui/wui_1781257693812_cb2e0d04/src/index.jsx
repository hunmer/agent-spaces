import { useEffect, useState } from 'react';
import SnippetForm from './components/SnippetForm';
import SnippetCard from './components/SnippetCard';
import FilterBar from './components/FilterBar';
import { useSnippetsDb } from './hooks/useSnippetsDb';
import { useSettings } from './hooks/useSettings';
import { getDb } from './utils/db';
import { SAMPLE_SNIPPETS } from './utils/sampleData';

const {
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Separator,
} = window.AgentSpacesUI;
const { Database, Plus, Download, Sparkles, FileCode } = window.AgentSpacesUI;

export default function App() {
  const dbq = useSnippetsDb();
  const { settings, ready: settingsReady, update: updateSettings } = useSettings();
  const [filter, setFilter] = useState({ q: '', language: 'all' });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [count, setCount] = useState(0);

  // 偏好就绪后恢复上次的过滤语言（JSON config 持久化）
  useEffect(() => {
    if (!settingsReady) return;
    setFilter((f) => (f.language === settings.lastLanguageFilter
      ? f
      : { ...f, language: settings.lastLanguageFilter || 'all' }));
  }, [settingsReady, settings.lastLanguageFilter]);

  // db 就绪 / 过滤变化时刷新列表 + 计数。只依赖稳定标量，避免 dbq 对象引用变化触发循环。
  useEffect(() => {
    if (!dbq.ready) return;
    dbq.refresh(filter);
    dbq.count().then(setCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbq.ready, filter.q, filter.language]);

  // 过滤语言变化时持久化到 settings（下次打开恢复）
  useEffect(() => {
    if (!settingsReady) return;
    if (settings.lastLanguageFilter !== filter.language) {
      updateSettings({ lastLanguageFilter: filter.language });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.language, settingsReady]);

  const run = async (fn) => {
    try {
      await fn();
    } finally {
      await dbq.refresh(filter);
      dbq.count().then(setCount);
    }
  };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (s) => { setEditing(s); setFormOpen(true); };

  const handleSubmit = (data) => run(() =>
    editing ? dbq.updateSnippet(editing.id, data) : dbq.addSnippet(data),
  );
  const handleDelete = (s) => run(() => dbq.deleteSnippet(s.id));
  const handleImport = () => run(() => dbq.importBatch(SAMPLE_SNIPPETS));

  // 导出全部片段为 JSON 到 data/snippets-export.json（saveDataFile —— data 能力）
  const handleExport = async () => {
    const rows = await getDb().all('SELECT * FROM snippets ORDER BY updated_at DESC');
    const payload = JSON.stringify(
      { exportedAt: new Date().toISOString(), count: rows.length, snippets: rows },
      null,
      2,
    );
    await window.AgentSpacesUI.saveDataFile('snippets-export.json', payload);
  };

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-5 text-primary" />
              <CardTitle>代码片段管理器</CardTitle>
            </div>
            <CardDescription>
              同时演示 <strong>SQLite</strong>（CRUD / 过滤 / 批量事务）与 <strong>JSON</strong>（config 偏好 / data 导出）数据能力
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Database className="size-4" />
              SQLite <span className="font-medium text-foreground">{count}</span> 条片段
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={openNew}><Plus className="size-4" />新建片段</Button>
          <Button variant="outline" onClick={handleImport}><Sparkles className="size-4" />导入示例</Button>
          <Button variant="outline" onClick={handleExport}><Download className="size-4" />导出 JSON</Button>
        </div>

        <FilterBar filter={filter} onChange={setFilter} />
        <Separator />

        {/* List */}
        {!dbq.ready ? (
          <div className="flex justify-center py-12 text-sm text-muted-foreground">加载中…</div>
        ) : dbq.error ? (
          <Card><CardContent className="p-4 text-sm text-destructive">db 初始化失败：{dbq.error}</CardContent></Card>
        ) : dbq.snippets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <FileCode className="size-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">暂无片段</p>
            <p className="text-xs text-muted-foreground">点击「新建片段」或「导入示例」开始。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {dbq.snippets.map((s) => (
              <SnippetCard key={s.id} snippet={s} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Footer hint: 数据落盘位置 */}
        <p className="pt-2 text-center text-xs text-muted-foreground">
          数据落盘：<code className="font-mono">data/db/snippets.sqlite</code> · 配置：<code className="font-mono">configs/settings.json</code> · 导出：<code className="font-mono">data/snippets-export.json</code>
        </p>
      </div>

      <SnippetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
