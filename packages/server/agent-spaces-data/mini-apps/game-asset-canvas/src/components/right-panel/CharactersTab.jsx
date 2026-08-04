import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Upload, WandSparkles, Star, Loader2 } from '@agent-spaces/ui';
import { generateImages } from '../../utils/workflow';
import { storyboardId } from '../../utils/storyboard';
import { CharacterImageGenerationDialog } from '../StoryboardGenerationDialog';

export default function CharactersTab({ characters, onSave, onDelete, settings, embedded = false, embeddedHeight = 380 }) {
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const selected = useMemo(() => characters.find((item) => item.id === selectedId) || characters[0] || null, [characters, selectedId]);

  useEffect(() => {
    if (!selected) { setDraft(null); return; }
    setSelectedId(selected.id);
    setDraft({ ...selected, images: [...(selected.images || [])] });
  }, [selected?.id, characters]);

  useEffect(() => {
    if (!draft) return undefined;
    const stored = characters.find((item) => item.id === draft.id);
    if (JSON.stringify(stored) === JSON.stringify(draft)) return undefined;
    const timer = setTimeout(() => onSave?.(draft), 500);
    return () => clearTimeout(timer);
  }, [draft, characters, onSave]);

  const addCharacter = async () => {
    const item = { id: storyboardId('char'), name: `角色 ${characters.length + 1}`, prompt: '', images: [] };
    await onSave?.(item);
    setSelectedId(item.id);
  };

  const uploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!draft || !files.length) return;
    setBusy(true);
    try {
      const uploaded = await Promise.all(files.map((file) => window.AgentSpaces.uploadFile(file)));
      const fresh = uploaded.map((item) => item?.url || item?.httpPath).filter(Boolean).map((url) => ({ id: storyboardId('charimg'), url, selected: false }));
      const images = [...(draft.images || []), ...fresh];
      if (images.length && !images.some((item) => item.selected)) images[0] = { ...images[0], selected: true };
      setDraft((prev) => ({ ...prev, images }));
    } finally {
      setBusy(false);
    }
  };

  const generateCharacter = async ({ mode, prompt, preset, referenceImages, generationParams }) => {
    if (!prompt) return;
    setGenerateOpen(false);
    setDraft((prev) => ({ ...prev, prompt, generationParams }));
    setBusy(true);
    try {
      const isEdit = mode === 'editImage';
      const result = await generateImages(isEdit ? settings?.editImageWorkflowId : settings?.textToImageWorkflowId, {
        ...(isEdit ? { images: referenceImages } : {}),
        prompt,
        model: preset.model,
        aspect: preset.aspect,
        size: preset.size,
        count: Math.max(1, Number(preset.count) || 1),
        concurrency: Math.max(1, Number(preset.concurrency) || 1),
      });
      setDraft((prev) => {
        const images = [...(prev.images || []), ...result.urls.map((url) => ({ id: storyboardId('charimg'), url, selected: false }))];
        if (images.length && !images.some((item) => item.selected)) images[0] = { ...images[0], selected: true };
        return { ...prev, images };
      });
    } catch (error) {
      window.alert?.(error?.message || '角色图片生成失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex min-h-0 flex-col ${embedded ? 'rounded-md border border-border bg-background' : 'h-full'}`}
      style={embedded ? { height: embeddedHeight } : undefined}
    >
      <div className="flex items-center gap-2 border-b border-border p-2">
        <span className="text-sm font-semibold">角色库</span>
        <span className="text-xs text-muted-foreground">{characters.length}</span>
        <button type="button" className="ml-auto flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary hover:text-primary" onClick={addCharacter}>
          <Plus className="h-3.5 w-3.5" />新增
        </button>
      </div>
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: embedded ? '96px minmax(0, 1fr)' : '112px minmax(0, 1fr)' }}>
        <div className="overflow-auto border-r border-border p-2">
          {characters.map((item) => (
            <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`mb-1 w-full rounded px-2 py-2 text-left text-xs ${item.id === selected?.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              <span className="block truncate font-medium">{item.name || '未命名'}</span>
              <span className="block opacity-70">{item.images?.length || 0} 张图</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 overflow-auto p-3">
          {!draft ? <p className="text-xs text-muted-foreground">新增角色后开始编辑</p> : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs"><span className="text-muted-foreground">名称</span><input className="rounded border border-border bg-background px-2 py-1.5" value={draft.name || ''} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} /></label>
              <label className="flex flex-col gap-1 text-xs"><span className="text-muted-foreground">视觉提示词</span><textarea className="min-h-24 resize-y rounded border border-border bg-background px-2 py-1.5" value={draft.prompt || ''} onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))} /></label>
              <div className="flex gap-2">
                <label className="flex h-8 cursor-pointer items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary"><Upload className="h-3.5 w-3.5" />上传<input type="file" accept="image/*" multiple className="hidden" onChange={uploadImages} /></label>
                <button type="button" disabled={busy} onClick={() => setGenerateOpen(true)} className="flex h-8 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}生图
                </button>
                <button type="button" className="ml-auto flex h-8 items-center rounded px-2 text-xs text-red-500 hover:bg-red-500/10" onClick={() => onDelete?.(draft.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(draft.images || []).map((image) => (
                  <div key={image.id} className="group relative aspect-square overflow-hidden rounded border border-border bg-muted">
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                    <button type="button" title="设为主参考图" className={`absolute left-1 top-1 rounded p-1 ${image.selected ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-muted-foreground'}`} onClick={() => setDraft((prev) => ({ ...prev, images: prev.images.map((item) => ({ ...item, selected: item.id === image.id })) }))}><Star className="h-3 w-3" /></button>
                    <button type="button" title="删除图片" className="absolute right-1 top-1 rounded bg-background/80 p-1 text-red-500 opacity-0 group-hover:opacity-100" onClick={() => setDraft((prev) => ({ ...prev, images: prev.images.filter((item) => item.id !== image.id) }))}><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <CharacterImageGenerationDialog
        open={generateOpen}
        value={draft?.generationParams}
        prompt={draft?.prompt}
        images={draft?.images}
        settings={settings}
        onCancel={() => setGenerateOpen(false)}
        onSubmit={generateCharacter}
      />
    </div>
  );
}
