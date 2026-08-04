import { useEffect, useMemo, useState } from 'react';
import {
  Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Label, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@agent-spaces/ui';
import CountAndConcurrency from './nodes/CountAndConcurrency';
import {
  ASPECT_OPTIONS, DEFAULT_MODEL, DEFAULT_VIDEO_MODEL, SIZE_OPTIONS,
  VIDEO_ASPECT_OPTIONS, VIDEO_DURATION_OPTIONS, VIDEO_MODEL_OPTIONS,
  VIDEO_QUALITY_OPTIONS, VOICE_PROVIDER_OPTIONS, modelValuesToOptions,
} from '../utils/constants';
import { resolveStoryboardGenerationParams } from '../utils/storyboard-generation';

const VIDEO_OPTIONS = VIDEO_MODEL_OPTIONS.flatMap((group) => group.options.map((item) => ({
  ...item, label: `${group.group} · ${item.label}`,
})));

export function StoryboardGenerationDialog({ open, mode, value, settings, onCancel, onSubmit }) {
  const [draft, setDraft] = useState(value || {});
  useEffect(() => { if (open) setDraft(value || {}); }, [open, value]);
  if (!mode) return null;

  const title = { textToImage: '文生图参数', editImage: '图生图参数', video: '生成视频参数', voice: '生成配音参数' }[mode];
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0" style={{ width: '480px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' }}>
        <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="nodrag nopan nowheel flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
          <PresetFields mode={mode} value={draft} settings={settings} onChange={setDraft} />
        </div>
        <DialogFooter className="border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={() => onSubmit?.(draft)}>保存参数</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CharacterImageGenerationDialog({ open, value, prompt, images, settings, onCancel, onSubmit }) {
  const resolved = useMemo(() => resolveStoryboardGenerationParams(value || {}, settings), [value, settings]);
  const [tab, setTab] = useState('textToImage');
  const [draftPrompt, setDraftPrompt] = useState(prompt || '');
  const [presets, setPresets] = useState(resolved);
  const [references, setReferences] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(value?.generationMode === 'editImage' ? 'editImage' : 'textToImage');
    setDraftPrompt(prompt || '');
    setPresets(resolveStoryboardGenerationParams(value || {}, settings));
    const remembered = Array.isArray(value?.referenceImages) ? value.referenceImages : [];
    const selected = (images || []).filter((item) => item?.selected && item?.url).map((item) => item.url);
    setReferences(remembered.length ? remembered : selected);
  }, [open, value, prompt, images, settings]);

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((file) => window.AgentSpaces.uploadFile(file)));
      const urls = uploaded.map((item) => item?.url || item?.httpPath).filter(Boolean);
      setReferences((prev) => [...new Set([...prev, ...urls])]);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => onSubmit?.({
    mode: tab,
    prompt: draftPrompt.trim(),
    preset: presets[tab],
    referenceImages: tab === 'editImage' ? references : [],
    generationParams: {
      textToImage: presets.textToImage,
      editImage: presets.editImage,
      generationMode: tab,
      referenceImages: tab === 'editImage' ? references : [],
    },
  });
  const disabled = uploading || !draftPrompt.trim() || (tab === 'editImage' && !references.length);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0" style={{ width: '560px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)' }}>
        <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>图片生成</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="nodrag nopan nowheel flex min-h-0 flex-1 flex-col">
          <div className="px-5 pt-4"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="textToImage">文生图</TabsTrigger><TabsTrigger value="editImage">图生图</TabsTrigger></TabsList></div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <FormField label="角色提示词"><textarea className="min-h-24 w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm" value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} /></FormField>
            <TabsContent value="textToImage" className="mt-4"><PresetFields mode="textToImage" value={presets.textToImage} settings={settings} onChange={(next) => setPresets((prev) => ({ ...prev, textToImage: next }))} /></TabsContent>
            <TabsContent value="editImage" className="mt-4 flex flex-col gap-4">
              <FormField label="参考图">
                <div className="grid grid-cols-4 gap-2">
                  {references.map((url) => <button key={url} type="button" title="移除参考图" onClick={() => setReferences((prev) => prev.filter((item) => item !== url))} className="aspect-square overflow-hidden rounded border border-primary"><img src={url} alt="" className="h-full w-full object-cover" /></button>)}
                </div>
                <label className="mt-2 flex h-8 cursor-pointer items-center justify-center rounded border border-border px-2 text-xs hover:border-primary">{uploading ? '上传中...' : '添加参考图'}<input type="file" accept="image/*" multiple className="hidden" onChange={upload} /></label>
              </FormField>
              <PresetFields mode="editImage" value={presets.editImage} settings={settings} onChange={(next) => setPresets((prev) => ({ ...prev, editImage: next }))} />
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter className="border-t border-border px-5 py-4"><Button variant="outline" onClick={onCancel}>取消</Button><Button disabled={disabled} onClick={submit}>开始生成</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PresetFields({ mode, value, settings, onChange }) {
  const patch = (next) => onChange({ ...(value || {}), ...next });
  const isImage = mode === 'textToImage' || mode === 'editImage';
  const modelOptions = mode === 'textToImage'
    ? modelValuesToOptions(settings?.textToImageModels)
    : mode === 'editImage' ? modelValuesToOptions(settings?.editImageModels)
      : mode === 'video' ? VIDEO_OPTIONS : VOICE_PROVIDER_OPTIONS;
  const fallbackModel = isImage ? DEFAULT_MODEL : mode === 'video' ? DEFAULT_VIDEO_MODEL : VOICE_PROVIDER_OPTIONS[0]?.value;
  return <div className="flex flex-col gap-4">
    <FormField label={mode === 'voice' ? '语音服务' : '模型'}><SelectInput value={value?.model || fallbackModel} options={modelOptions} onChange={(model) => patch({ model })} /></FormField>
    {isImage && <div className="grid grid-cols-2 gap-3"><FormField label="比例"><SelectInput value={value?.aspect || '16:9'} rawOptions={ASPECT_OPTIONS} onChange={(aspect) => patch({ aspect })} /></FormField><FormField label="尺寸"><SelectInput value={value?.size || '1k'} rawOptions={SIZE_OPTIONS} onChange={(size) => patch({ size })} /></FormField></div>}
    {mode === 'video' && <div className="grid grid-cols-3 gap-3"><FormField label="比例"><SelectInput value={value?.aspect || VIDEO_ASPECT_OPTIONS[0]} rawOptions={VIDEO_ASPECT_OPTIONS} onChange={(aspect) => patch({ aspect })} /></FormField><FormField label="质量"><SelectInput value={value?.quality || VIDEO_QUALITY_OPTIONS[0]} rawOptions={VIDEO_QUALITY_OPTIONS} onChange={(quality) => patch({ quality })} /></FormField><FormField label="时长"><SelectInput value={value?.duration || VIDEO_DURATION_OPTIONS[0]} rawOptions={VIDEO_DURATION_OPTIONS} onChange={(duration) => patch({ duration })} /></FormField></div>}
    {mode === 'voice' && <FormField label="发音人 ID（可选）"><input className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" value={value?.voiceId || ''} onChange={(event) => patch({ voiceId: event.target.value })} /></FormField>}
    <CountAndConcurrency count={value?.count ?? 1} concurrency={value?.concurrency ?? 1} onChange={patch} />
  </div>;
}

function FormField({ label, children }) {
  return <div className="flex min-w-0 flex-col gap-1.5"><Label className="text-xs font-medium text-muted-foreground">{label}</Label>{children}</div>;
}

function SelectInput({ value, options, rawOptions, onChange }) {
  const items = options || (rawOptions || []).map((item) => ({ value: item, label: item }));
  return <select className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" value={value || ''} onChange={(event) => onChange(event.target.value)}>{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>;
}
