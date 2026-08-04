import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import {
  Image, Film, Volume2, Plus, Trash2, WandSparkles, Loader2, GripVertical, Users, Settings2,
  AvatarGroup, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Masonry, openMediaGallery,
} from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import CharactersTab from '../right-panel/CharactersTab';
import { NODE_TYPES } from '../../utils/constants';
import { createStoryboardScene, reorderStoryboardScenes } from '../../utils/storyboard';
import { createStoryboardSceneHandleId, getStoryboardSceneAssets } from '../../utils/storyboard-assets.js';
import { resolveStoryboardGenerationParams } from '../../utils/storyboard-generation';
import { StoryboardGenerationDialog } from '../StoryboardGenerationDialog';

export default function StoryboardNode({ id, data, selected }) {
  const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
  const characters = Array.isArray(data?.storyboardCharacters) ? data.storyboardCharacters : [];
  const params = data?.params || {};
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rolePickerSceneId, setRolePickerSceneId] = useState('');
  const [dragSceneId, setDragSceneId] = useState('');
  const [dragOverId, setDragOverId] = useState('');
  const sceneRefs = useRef(new Map());
  const updateNodeInternals = useUpdateNodeInternals();

  const patch = useCallback((value) => data?.onUpdate?.(value), [data?.onUpdate]);
  const generationParams = useMemo(
    () => resolveStoryboardGenerationParams(params, data?.storyboardSettings),
    [params, data?.storyboardSettings],
  );
  const sceneOutputs = useMemo(() => scenes.map((scene, index) => ({
    scene,
    index,
    assets: getStoryboardSceneAssets(scene),
  })), [scenes]);
  const handleSignature = sceneOutputs.map(({ scene, assets }) => `${scene.id}:${assets.length}`).join('|');
  useEffect(() => { updateNodeInternals(id); }, [handleSignature, id, updateNodeInternals]);
  const saveGenerationSettings = (value) => {
    patch({ params: { ...params, ...value } });
    setSettingsOpen(false);
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

  const scrollToScene = (sceneId) => {
    sceneRefs.current.get(sceneId)?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
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
    <div className="relative h-full w-full overflow-visible">
    <NodeShell id={id} nodeType={NODE_TYPES.storyboard} data={data} selected={selected}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setAiOpen((open) => !open)} className={`flex h-7 items-center gap-1 rounded border px-2 text-xs ${aiOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary'}`}>
          <WandSparkles className="h-3.5 w-3.5" />AI 拆镜
        </button>
        <button type="button" onClick={() => setCharactersOpen(true)} className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary">
          <Users className="h-3.5 w-3.5" />角色库 ({characters.length})
        </button>
        <button type="button" onClick={addScene} className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary"><Plus className="h-3.5 w-3.5" />新增分镜</button>
        <button type="button" title="生成参数设置" aria-label="生成参数设置" onClick={() => setSettingsOpen(true)} className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary hover:text-primary"><Settings2 className="h-3.5 w-3.5" /></button>
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

      <StoryboardGenerationDialog
        open={settingsOpen}
        value={generationParams}
        settings={data?.storyboardSettings}
        onCancel={() => setSettingsOpen(false)}
        onSubmit={saveGenerationSettings}
      />

      <Dialog open={!!rolePickerSceneId} onOpenChange={(open) => { if (!open) setRolePickerSceneId(''); }}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0" style={{ width: '440px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'min(620px, calc(100vh - 32px))' }}>
          <DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>选择分镜角色</DialogTitle></DialogHeader>
          <div className="nodrag nopan nowheel flex min-h-0 flex-col gap-1 overflow-y-auto p-4">
            {characters.length ? characters.map((character) => {
              const scene = scenes.find((item) => item.id === rolePickerSceneId);
              const checked = !!scene?.characterIds?.includes(character.id);
              const imageUrl = characterImage(character);
              return <div key={character.id} className="flex items-center gap-3 rounded border border-border px-3 py-2">
                <Checkbox checked={checked} onCheckedChange={(value) => patchScene(rolePickerSceneId, { characterIds: value ? [...new Set([...(scene?.characterIds || []), character.id])] : (scene?.characterIds || []).filter((id) => id !== character.id) })} />
                {imageUrl ? <img src={imageUrl} alt="" className="h-9 w-9 rounded-full border border-border object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium">{String(character.name || '?').slice(0, 1)}</span>}
                <span className="min-w-0 flex-1 truncate text-sm">{character.name || '未命名角色'}</span>
              </div>;
            }) : <p className="py-8 text-center text-sm text-muted-foreground">角色库为空，请先在顶部角色库中添加角色</p>}
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative flex items-start gap-2">
        {scenes.length ? <nav className="scrollbar-none sticky top-0 flex shrink-0 flex-col gap-1.5 overflow-y-auto" style={{ width: '48px', maxHeight: 'calc(60vh - 16px)' }} aria-label="分镜导航">
          {scenes.map((scene, index) => {
            const firstImage = Array.isArray(scene.images) ? scene.images.find(Boolean) : '';
            return <button key={scene.id} type="button" title={`跳转到分镜 ${index + 1}`} onClick={() => scrollToScene(scene.id)} className="nodrag nopan nowheel flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">
              {firstImage ? <img src={firstImage} alt={`分镜 ${index + 1}`} className="h-full w-full object-cover" /> : index + 1}
            </button>;
          })}
        </nav> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
      {scenes.map((scene, index) => {
        const sceneCharacters = (scene.characterIds || []).map((characterId) => characters.find((character) => character.id === characterId)).filter(Boolean);
        return (
        <section
          key={scene.id}
          ref={(element) => { if (element) sceneRefs.current.set(scene.id, element); else sceneRefs.current.delete(scene.id); }}
          data-storyboard-scene-id={scene.id}
          style={{ scrollMarginTop: '8px' }}
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
          <div className="flex items-center gap-2">
            {sceneCharacters.length ? <AvatarGroup size="sm" avatarUrls={sceneCharacters.map((character) => ({ imageUrl: characterImage(character), name: character.name || '未命名角色' }))} /> : <span className="text-[11px] text-muted-foreground">暂无角色</span>}
            <button type="button" title="添加角色" aria-label="添加角色" onClick={() => setRolePickerSceneId(scene.id)} className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <SceneField label="旁白 / 台词"><textarea className="min-h-16 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="输入旁白或台词" value={scene.narration || ''} onChange={(e) => patchScene(scene.id, { narration: e.target.value })} /></SceneField>
          <SceneField label="画面提示词"><textarea className="min-h-20 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="场景、主体、构图、光线..." value={scene.visualPrompt || ''} onChange={(e) => patchScene(scene.id, { visualPrompt: e.target.value })} /></SceneField>
          <SceneField label="动画提示词"><textarea className="min-h-20 resize-y rounded border border-border bg-background px-2 py-1.5 text-xs" placeholder="运镜、动作、节奏..." value={scene.animationPrompt || ''} onChange={(e) => patchScene(scene.id, { animationPrompt: e.target.value })} /></SceneField>
          <div className="flex flex-wrap gap-1.5">
            <MediaButton icon={Image} label="生成图片" busy={busyKey === `${scene.id}:image`} disabled={!!busyKey || !scene.visualPrompt?.trim()} onClick={() => generate(scene, 'image')} />
            <MediaButton icon={Film} label="生成视频" busy={busyKey === `${scene.id}:video`} disabled={!!busyKey || !scene.animationPrompt?.trim()} onClick={() => generate(scene, 'video')} />
            <MediaButton icon={Volume2} label="生成语音" busy={busyKey === `${scene.id}:audio`} disabled={!!busyKey || !scene.narration?.trim()} onClick={() => generate(scene, 'audio')} />
            <span className="ml-auto text-[11px] text-muted-foreground">图 {scene.images?.length || 0} · 视频 {scene.videos?.length || 0} · 音频 {scene.audios?.length || 0}</span>
          </div>
          <SceneMedia scene={scene} />
        </section>
        );
      })}
      {error ? <p className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p> : null}
        </div>
      </div>
    </NodeShell>
    {scenes.length ? <aside
      className="nodrag nopan nowheel flex flex-col gap-1.5"
      style={{ position: 'absolute', left: 'calc(100% + 10px)', top: 44, width: 48, zIndex: 20 }}
      aria-label="分镜输出 Handle"
    >
          {sceneOutputs.map(({ scene, index, assets }) => {
            const imageAsset = assets.find((asset) => asset.type === 'image');
            const firstType = assets[0]?.type;
            return <div key={scene.id} className={`relative flex aspect-square w-full shrink-0 items-center justify-center rounded border bg-muted shadow-sm ${assets.length ? 'border-primary/60' : 'border-border opacity-50'}`} title={assets.length ? `分镜 ${index + 1}：${assets.length} 个素材` : `分镜 ${index + 1}：暂无素材`}>
              {imageAsset ? <img src={imageAsset.thumb || imageAsset.url} alt={`分镜 ${index + 1} 输出`} className="h-full w-full rounded object-cover" /> : firstType === 'video' ? <Film className="h-4 w-4 text-muted-foreground" /> : firstType === 'audio' ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>}
              {assets.length ? <span className="pointer-events-none absolute left-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-background/90 px-1 text-[9px] font-semibold text-foreground">{assets.length}</span> : null}
              <Handle
                id={createStoryboardSceneHandleId(scene.id)}
                type="source"
                position={Position.Right}
                isConnectable={assets.length > 0}
                aria-label={`连接分镜 ${index + 1} 素材`}
                style={{
                  position: 'absolute', right: 1, top: '50%', width: 14, height: 14,
                  transform: 'translate(50%, -50%)', pointerEvents: assets.length ? 'auto' : 'none',
                  background: assets.length ? 'var(--primary)' : 'var(--muted-foreground)',
                  border: '2px solid var(--background)',
                }}
              />
            </div>;
          })}
    </aside> : null}
    </div>
  );
}

function MediaButton({ icon: Icon, label, busy, disabled, onClick }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:border-primary disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{busy ? '生成中' : label}</button>;
}

function SceneField({ label, children }) {
  return <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function characterImage(character) {
  const images = Array.isArray(character?.images) ? character.images : [];
  return images.find((item) => item?.selected && item?.url)?.url || images.find((item) => item?.url)?.url || '';
}

function SceneMedia({ scene }) {
  const images = Array.isArray(scene.images) ? scene.images.filter(Boolean) : [];
  const videos = Array.isArray(scene.videos) ? scene.videos.filter(Boolean) : [];
  const audios = Array.isArray(scene.audios) ? scene.audios.filter(Boolean) : [];
  if (!images.length && !videos.length && !audios.length) return null;
  return <div className="nodrag nopan nowheel flex flex-col gap-2 rounded border border-border bg-muted/30 p-2">
    {images.length ? <SceneImageMasonry images={images} /> : null}
    {videos.map((url, index) => <video key={`${url}-${index}`} src={url} controls className="max-h-48 w-full rounded border border-border bg-background object-contain" />)}
    {audios.map((url, index) => <audio key={`${url}-${index}`} src={url} controls className="w-full" />)}
  </div>;
}

function SceneImageMasonry({ images }) {
  const [aspects, setAspects] = useState({});
  const items = useMemo(() => images.map((url, index) => ({ id: `${url}-${index}`, url, index })), [images]);
  const galleryItems = useMemo(() => images.map((src, index) => ({ src, type: 'image', alt: `分镜图片 ${index + 1}` })), [images]);
  const getMeta = useCallback((item) => ({ aspect: aspects[item.id] || '1:1' }), [aspects]);
  const rememberAspect = (item, image) => {
    const width = image.naturalWidth || 1;
    const height = image.naturalHeight || 1;
    const aspect = `${width}:${height}`;
    setAspects((prev) => (prev[item.id] === aspect ? prev : { ...prev, [item.id]: aspect }));
  };
  return <Masonry
    data={items}
    columns={3}
    gap={6}
    rowHeight={48}
    getKey={(item) => item.id}
    getMeta={getMeta}
    enterAnimation={false}
    exitAnimation={false}
    renderItem={(item) => <button type="button" onClick={() => openMediaGallery(galleryItems, item.index)} className="h-full w-full overflow-hidden rounded border border-border bg-background"><img src={item.url} alt={`分镜图片 ${item.index + 1}`} onLoad={(event) => rememberAspect(item, event.currentTarget)} className="h-full w-full object-cover" /></button>}
  />;
}
