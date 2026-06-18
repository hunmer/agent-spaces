import { useEffect, useRef, useState } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Progress, Upload,
} = window.AgentSpacesUI;

// 从 JSON 文件批量导入文案。
//
// JSON 结构：{ items: [{ type, title, tags[], localFilePath, fileName, transcriptionTextPath, ... }] }
// 每条直接 fetch transcriptionTextPath 拉取文案文本，不重新调用 ASR。
// 写入 DB：status=done（文案已就绪），kb_status=pending（与新建一致，可在存储设置里扫描入库）。
// 进度条逐条推进，单条失败不中断，最终汇总成功/失败。
//
// 入口：Toolbar「导入」按钮。onImport(data) 由 index.jsx 落库（dbq.add），onImported() 刷新列表。
export default function ImportJsonDialog({ open, onOpenChange, onImport, onImported }) {
  const fileRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | ready | importing | done
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(0);
  const [currentTitle, setCurrentTitle] = useState('');
  const [failed, setFailed] = useState([]);
  const [parseErr, setParseErr] = useState('');

  const reset = () => {
    setPhase('idle');
    setItems([]);
    setCurrent(0);
    setCurrentTitle('');
    setFailed([]);
    setParseErr('');
    if (fileRef.current) fileRef.current.value = '';
  };

  // 关闭（含点遮罩 / ESC）一律重置，下次打开干净
  useEffect(() => { if (!open) reset(); }, [open]);

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseErr('');
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed?.items) ? parsed.items : [];
      if (!list.length) { setParseErr('JSON 中没有可导入的 items'); return; }
      setItems(list);
      setCurrent(0);
      setFailed([]);
      setPhase('ready');
    } catch (err) {
      setParseErr('解析 JSON 失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const startImport = async () => {
    if (!onImport) return;
    setPhase('importing');
    const failList = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const title = it.title
        || (it.fileName ? String(it.fileName).replace(/\.[^.]+$/, '') : `导入项 ${i + 1}`);
      setCurrent(i + 1);
      setCurrentTitle(title);
      try {
        let transcription = '';
        if (it.transcriptionTextPath) {
          const resp = await fetch(it.transcriptionTextPath);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          transcription = await resp.text();
        }
        await onImport({
          title,
          type: it.type || 'audio',
          tags: Array.isArray(it.tags) ? it.tags.join(',') : (it.tags || ''),
          media_url: it.localFilePath || '',
          transcription,
          status: 'done',
          kb_status: 'pending',
        });
      } catch (err) {
        failList.push({ title, error: err instanceof Error ? err.message : String(err) });
      }
    }
    setFailed(failList);
    setPhase('done');
    onImported?.();
  };

  const total = items.length;
  const percent = total ? Math.round((current / total) * 100) : 0;
  const importing = phase === 'importing';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>从 JSON 导入文案</DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            选择导出的 JSON 文件（含 items 数组），批量导入文案。每条通过 transcriptionTextPath 拉取文案文本，不重新转写。
          </p>

          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />

          {phase === 'idle' && (
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />选择 JSON 文件
            </Button>
          )}

          {phase !== 'idle' && (
            <div className="flex items-center justify-between text-sm">
              <span>已解析 <span className="font-medium text-foreground">{total}</span> 条</span>
              <Button variant="ghost" size="sm" onClick={reset} disabled={importing}>重新选择</Button>
            </div>
          )}

          {parseErr && <p className="text-sm text-destructive">{parseErr}</p>}

          {(phase === 'importing' || phase === 'done') && (
            <div className="space-y-2">
              <Progress value={percent} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate pr-2">
                  {phase === 'importing' ? `正在导入：${currentTitle}` : '导入完成'}
                </span>
                <span className="shrink-0">{current}/{total}（{percent}%）</span>
              </div>
              {phase === 'done' && (
                <p className="text-xs text-muted-foreground">
                  成功 {total - failed.length} 条
                  {failed.length ? `，失败 ${failed.length} 条：${failed.map((f) => f.title).join('、')}` : '。'}
                  {!failed.length && ' 可在「存储设置」中扫描入库。'}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>关闭</Button>
          {phase === 'ready' && <Button onClick={startImport}>开始导入</Button>}
          {phase === 'done' && <Button onClick={() => onOpenChange(false)}>完成</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
