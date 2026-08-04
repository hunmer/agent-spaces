import { useCallback, useState } from 'react';
import {
  Image, Film, Volume2, Plus, Trash2, WandSparkles, Loader2, GripVertical, Users, Settings2,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import CharactersTab from '../right-panel/CharactersTab';
import { NODE_TYPES } from '../../utils/constants';
import { createStoryboardScene, reorderStoryboardScenes } from '../../utils/storyboard';
import { mergeStoryboardGenerationPreset, resolveStoryboardGenerationParams } from '../../utils/storyboard-generation';
import { StoryboardGenerationDialog } from '../StoryboardGenerationDialog';

export default function StoryboardNode({ id, data, selected }) {
  const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
  const characters = Array.isArray(data?.storyboardCharacters) ? data.storyboardCharacters : [];
  const params = data?.params || {};
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [presetMode, setPresetMode] = useState('');
  const [dragSceneId, setDragSceneId] = useState('');
  const [dragOverId, setDragOverId] = useState('');

  const patch = useCallback((value) => data?.onUpdate?.(value), [data?.onUpdate]);
  const generationParams = resolveStoryboardGenerationParams(params, data?.storyboardSettings);
  const savePreset = (value) => {
    patch({ params: mergeStoryboardGenerationPreset(params, presetMode, value, data?.storyboardSettings) });
    setPresetMode('');
  };
  const patchScene = (sceneId, value) => patch({ scenes: scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...value } : scene)) });

  const addScene = () => patch({ scenes: [...scenes, createStoryboardScene(scenes.length + 1)] });
  const removeScene = (sceneId) => patch({ scenes: scenes.filter((scene) => scene.id !== sceneId).map((scene, index) => ({ ...scene, index: index + 1 })) });

  const runImport = async () => {
    if (!data?.sourceText?.trim()) return;
    setBusyKey('import'); setError('');
    try { await data?.onImportStoryboard?.(id, data.sourceText, data?.storyboardAgent?.id); }
    catch (e) { setError(e?.message || '分镜拆分失败'); }
    finally { setBusyKey(''); }
  };

  const dropScene = (targetId) => {
    if (!dragSceneId || dragSceneId === targetId) return;
    patch({ scenes: reorderStoryboardScenes(scenes, dragSceneId, targetId) });
    setDragSceneId('');
    setDragOverId('');
  };

  const generate = async (scene, kind) => {
    const key = `${scene.id}:${kind}`;
    setBusyKey(key); setError('');
    try { await data?.onGenerateStoryboardMedia?.(id, scene, kind, params); }
    catch (e) { setError(e?.message || '生成失败'); }
    finally { setBusyKey(''); }
  };

  const runAll = async (kind) => {
    setBusyKey(`all:${kind}`); setError('');
    try {
      for (const scene of scenes) {
        const hasInput = kind === 'image' ? scene.visualPrompt?.trim() : kind === 'video' ? scene.animationPrompt?.trim() : scene.narration?.trim();
        if (hasInput) await data?.onGenerateStoryboardMedia?.(id, scene, kind, params);
      }
    } catch (e) { setError(e?.message || '批量生成失败'); }
    finally { setBusyKey(''); }
  };

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.storyboard} data={data} selected={selected}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setAiOpen((open) => !open)} className={`flex h-7 items-center gap-1 rounded border px-2 text-xs ${aiOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary'}`}>
          <WandSparkles className="h-3.5 w-3.5" />AI 拆镜
        </button>
        <button type="button" onClick={() => setCharactersOpen(true)} className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary">
          <Users className="h-3.5 w-3.5" />角色库 ({characters.length})
        </button>
        <button type="button" onClick={addScene} className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary"><Plus className="h-3.5 w-3.5" />新增分镜</button>
        <button type="button" disabled={!!busyKey || !scenes.length} onClick={() => runAll('image')} className="h-7 rounded border border-border px-2 text-xs disabled:opacity-50">批量图片</button>
        <button type="button" disabled={!!busyKey || !scenes.length} onClick={() => runAll('video')} className="h-7 rounded border border-border px-2 text-xs disabled:opacity-50">批量视频</button>
        <button type="button" disabled={!!busyKey || !scenes.length} onClick={() => runAll('audio')} className="h-7 rounded border border-border px-2 text-xs disabled:opacity-50">批量语音</button>
        <span className="ml-auto text-xs text-muted-foreground">{scenes.length} 镜</span>
      </div>

      {aiOpen && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">AI 拆镜</span>
            <span className={`truncate text-[11px] ${data?.storyboardAgent?.id ? 'text-emerald-600' : 'text-amber-600'}`}>
              {data?.storyboardAgent?.name || (data?.storyboardAgent?.id ? '已配置 Agent' : '请先在设置中配置 Agent')}
            </span>
          </div>
          <textarea className="min-h-28 resize-y rounded border border-border bg-background px-2 py-1.5 text-sm" placeholder="粘贴故事、脚本或设定..." value={data?.sourceText || ''} onChange={(e) => patch({ sourceText: e.target.value })} />
          <button type="button" disabled={busyKey !== '' || !data?.sourceText?.trim() || !data?.storyboardAgent?.id} onClick={runImport} className="flex h-8 items-center justify-center gap-1 rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            {busyKey === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}{busyKey === 'import' ? '拆分中' : '开始拆镜'}
          </button>
        </div>
      )}

      <Dialog open={charactersOpen} onOpenChange={setCharactersOpen}>
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0"
          style={{ width: '760px', maxWidth: 'calc(100vw - 32px)', height: '76vh', maxHeight: '760px' }}
          onClick={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>角色库</DialogTitle>
          </DialogHeader>
          <div className="nodrag nopan nowheel min-h-0 flex-1 p-4">
          <CharactersTab
            embedded
            embeddedHeight="100%"
            characters={characters}
            onSave={data?.onSaveStoryboardCharacter}
            onDelete={data?.onDeleteStoryboardCharacter}
            settings={data?.storyboardSettings}
          />
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border border-border p-2">
        <div className="mb-2 flex items-center gap-1 text-xs font-medium"><Settings2 className="h-3.5 w-3.5" />生成参数</div>
        <div className="grid grid-cols-2 gap-1.5">
          <PresetButton label="文生图" summary={generationParams.textToImage.model} onClick={() => setPresetMode('textToImage')} />
          <PresetButton label="图生图" summary={generationParams.editImage.model} onClick={() => setPresetMode('editImage')} />
          <PresetButton label="生成视频" summary={generationParams.video.model} onClick={() => setPresetMode('video')} />
          <PresetButton label="生成配音" summary={generationParams.voice.model} onClick={() => setPresetMode('voice')} />
        </div>
      </div>

      <StoryboardGenerationDialog
        open={!!presetMode}
        mode={presetMode}
        value={presetMode ? generationParams[presetMode] : {}}
        settings={data?.storyboardSettings}
        onCancel={() => setPresetMode('')}
        onSubmit={savePreset}
      />

      {scenes.map((scene, index) => (
        <section
          key={scene.id}
          className={`flex flex-col gap-2 rounded-md border p-2 transition ${dragOverId === scene.id ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDragOver={(event) => { if (dragSceneId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverId(scene.id); } }}
          onDrop={(event) => { event.preventDefault(); dropScene(scene.id); }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              draggable={!busyKey}
              disabled={!!busyKey}
              title="拖拽排序"
              onDragStart={(event) => { setDragSceneId(scene.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', scene.id); }}
              onDragEnd={() => { setDragSceneId(''); setDragOverId(''); }}
              className="cursor-grab rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
            ><GripVertical className="h-4 w-4" /></button>
            <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
            <span className="text-xs text-muted-foreground">分镜 {scene.index || index + 1}</span>
            <button type="button" onClick={() => removeScene(scene.id)} className="ml-auto rounded p-1 text-red-500 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <SceneField label="旁白 / 台词"><textarea className="min-h-16 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="输入旁白或台词" value={scene.narration || ''} onChange={(e) => patchScene(scene.id, { narration: e.target.value })} /></SceneField>
          <SceneField label="画面提示词"><textarea className="min-h-20 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="场景、主体、构图、光线..." value={scene.visualPrompt || ''} onChange={(e) => patchScene(scene.id, { visualPrompt: e.target.value })} /></SceneField>
          <SceneField label="动画提示词"><textarea className="min-h-20 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="运镜、动作、节奏..." value={scene.animationPrompt || ''} onChange={(e) => patchScene(scene.id, { animationPrompt: e.target.value })} /></SceneField>
          {characters.length > 0 && <div className="flex flex-wrap gap-1">{characters.map((character) => { const active = scene.characterIds?.includes(character.id); return <button key={character.id} type="button" onClick={() => patchScene(scene.id, { characterIds: active ? scene.characterIds.filter((item) => item !== character.id) : [...(scene.characterIds || []), character.id] })} className={`rounded-full border px-2 py-0.5 text-[11px] ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{character.name}</button>; })}</div>}
          <div className="flex flex-wrap gap-1.5">
            <MediaButton icon={Image} label="生成图片" busy={busyKey === `${scene.id}:image`} disabled={!!busyKey || !scene.visualPrompt?.trim()} onClick={() => generate(scene, 'image')} />
            <MediaButton icon={Film} label="生成视频" busy={busyKey === `${scene.id}:video`} disabled={!!busyKey || !scene.animationPrompt?.trim()} onClick={() => generate(scene, 'video')} />
            <MediaButton icon={Volume2} label="生成语音" busy={busyKey === `${scene.id}:audio`} disabled={!!busyKey || !scene.narration?.trim()} onClick={() => generate(scene, 'audio')} />
            <span className="ml-auto text-[11px] text-muted-foreground">图 {scene.images?.length || 0} · 视频 {scene.videos?.length || 0} · 音频 {scene.audios?.length || 0}</span>
          </div>
        </section>
      ))}
      {error ? <p className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p> : null}
    </NodeShell>
  );
}

function MediaButton({ icon: Icon, label, busy, disabled, onClick }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{busy ? '生成中' : label}</button>;
}

function PresetButton({ label, summary, onClick }) {
  return <button type="button" onClick={onClick} className="flex min-w-0 flex-col rounded border border-border px-2 py-1.5 text-left hover:border-primary"><span className="text-xs font-medium">{label}</span><span className="truncate text-[10px] text-muted-foreground">{summary || '未设置'}</span></button>;
}

function SceneField({ label, children }) {
  return <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}
