// 文案转分镜 · 分镜管理
import React, { useState, useEffect } from 'react';
import { uid } from '../utils/constants.js';
import { runGeneration } from '../utils/workflow.js';

function sameScene(a, b) {
  if (!a || !b) return false;
  const aid = [...(a.characterIds || [])].sort().join(',');
  const bid = [...(b.characterIds || [])].sort().join(',');
  return a.id === b.id
    && a.narration === b.narration
    && a.visualPrompt === b.visualPrompt
    && a.animationPrompt === b.animationPrompt
    && aid === bid
    && JSON.stringify(a.images || []) === JSON.stringify(b.images || [])
    && (a.video || '') === (b.video || '');
}

function SceneCard({ scene, index, characters, settings, actions, onRemove, requestParams }) {
  const { Button, Label, Textarea, Trash2, Loader2, Film: FilmIcon, Image: ImageIcon, Eraser } = window.AgentSpacesUI;

  const [draft, setDraft] = useState(() => ({ ...scene, characterIds: [...(scene.characterIds || [])] }));
  const [imgRunning, setImgRunning] = useState(false);
  const [vidRunning, setVidRunning] = useState(false);
  const [error, setError] = useState('');

  // store 变化（生成结果回填）同步到 draft
  useEffect(() => {
    setDraft((prev) => (sameScene(prev, scene)
      ? prev
      : { ...scene, characterIds: [...(scene.characterIds || [])] }));
  }, [scene]);

  // autosave
  useEffect(() => {
    if (sameScene(draft, scene)) return;
    const t = setTimeout(() => actions.saveScene(draft), 500);
    return () => clearTimeout(t);
  }, [draft]);

  const patch = (p) => setDraft((prev) => ({ ...prev, ...p }));

  const toggleChar = (cid) => {
    setDraft((prev) => {
      const has = (prev.characterIds || []).includes(cid);
      const ids = has ? prev.characterIds.filter((x) => x !== cid) : [...(prev.characterIds || []), cid];
      return { ...prev, characterIds: ids };
    });
  };

  // 取参与角色的「选中图」URL，作为生图参考
  const collectRefImages = () => {
    const refs = [];
    (draft.characterIds || []).forEach((cid) => {
      const c = characters.find((x) => x.id === cid);
      (c?.images || []).forEach((img) => { if (img.selected && img.url) refs.push(img.url); });
    });
    return refs;
  };

  const generateImage = async () => {
    if (!draft.visualPrompt?.trim()) { setError('请填写画面提示词'); return; }
    const params = await requestParams();
    if (!params) return;
    setError(''); setImgRunning(true);
    try {
      const images = collectRefImages();
      const charPrompt = (draft.characterIds || [])
        .map((cid) => characters.find((x) => x.id === cid)?.prompt)
        .filter(Boolean).join('; ');
      const prompt = [charPrompt, draft.visualPrompt].filter(Boolean).join('\n');
      const urls = await runGeneration({
        kind: 'image',
        workflowId: settings.imageWorkflowId,
        input: { images, prompt, provider: params.provider, model: params.model, aspect: params.aspect, size: params.size },
        label: `分镜 ${index} 生图`,
      });
      await actions.addSceneMedia(draft.id, 'image', urls);
    } catch (e) { setError(e?.message || '生成失败'); }
    finally { setImgRunning(false); }
  };

  const generateVideo = async () => {
    if (!draft.animationPrompt?.trim()) { setError('请填写动画提示词'); return; }
    const params = await requestParams();
    if (!params) return;
    setError(''); setVidRunning(true);
    try {
      // 优先用本镜已生成的图片作为视频首帧，否则退回角色选中图
      const images = (draft.images && draft.images.length) ? draft.images.slice(-1) : collectRefImages();
      const urls = await runGeneration({
        kind: 'video',
        workflowId: settings.videoWorkflowId,
        input: { images, prompt: draft.animationPrompt, provider: params.provider, model: params.model, aspect: params.aspect, size: params.size },
        label: `分镜 ${index} 生视频`,
      });
      await actions.addSceneMedia(draft.id, 'video', urls);
    } catch (e) { setError(e?.message || '生成失败'); }
    finally { setVidRunning(false); }
  };

  return (
    <article className="sb-scene-card">
      <header className="sb-scene-head">
        <div className="sb-scene-no">{index}</div>
        <div className="sb-scene-actions">
          <Button size="sm" variant="outline" onClick={generateImage} disabled={imgRunning || vidRunning}>
            {imgRunning ? <Loader2 className="sb-icon sb-spin" /> : <ImageIcon className="sb-icon" />}
            {imgRunning ? '生成中' : '生成图片'}
          </Button>
          <Button size="sm" variant="outline" onClick={generateVideo} disabled={imgRunning || vidRunning}>
            {vidRunning ? <Loader2 className="sb-icon sb-spin" /> : <FilmIcon className="sb-icon" />}
            {vidRunning ? '生成中' : '生成视频'}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onRemove(draft.id)} title="删除分镜">
            <Trash2 className="sb-icon" />
          </Button>
        </div>
      </header>

      <div className="sb-field">
        <Label>旁白文本</Label>
        <Textarea value={draft.narration} onChange={(e) => patch({ narration: e.target.value })} placeholder="本镜的旁白或台词..." className="sb-textarea-sm" />
      </div>

      <div className="sb-grid-2">
        <div className="sb-field">
          <Label>画面提示词</Label>
          <Textarea value={draft.visualPrompt} onChange={(e) => patch({ visualPrompt: e.target.value })} placeholder="场景、构图、光线、主体动作..." className="sb-textarea-sm" />
        </div>
        <div className="sb-field">
          <Label>动画提示词</Label>
          <Textarea value={draft.animationPrompt} onChange={(e) => patch({ animationPrompt: e.target.value })} placeholder="运镜、动作、节奏..." className="sb-textarea-sm" />
        </div>
      </div>

      <div className="sb-field">
        <Label>参与角色</Label>
        <div className="sb-chips">
          {characters.length === 0 ? (
            <span className="sb-chips-empty">先在「角色」页添加角色</span>
          ) : characters.map((c) => {
            const on = (draft.characterIds || []).includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                className={`sb-chip${on ? ' is-on' : ''}`}
                onClick={() => toggleChar(c.id)}
              >
                {c.name || '未命名'}
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="sb-error">{error}</div>}

      {(draft.images?.length > 0 || draft.video) && (
        <div className="sb-scene-media">
          {draft.images?.length > 0 && (
            <div className="sb-media-block">
              <div className="sb-media-head">
                <span>生成图片 ({draft.images.length})</span>
                <Button size="icon" variant="ghost" onClick={() => actions.clearSceneMedia(draft.id, 'image')} title="清空图片">
                  <Eraser className="sb-icon" />
                </Button>
              </div>
              <div className="sb-img-grid">
                {draft.images.map((url, i) => (
                  <div key={i} className="sb-img-thumb"><img src={url} alt="" /></div>
                ))}
              </div>
            </div>
          )}
          {draft.video && (
            <div className="sb-media-block">
              <div className="sb-media-head">
                <span>生成视频</span>
                <Button size="icon" variant="ghost" onClick={() => actions.clearSceneMedia(draft.id, 'video')} title="清空视频">
                  <Eraser className="sb-icon" />
                </Button>
              </div>
              <video className="sb-video" src={draft.video} controls />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function ScenePanel({ project, settings, actions, requestParams }) {
  const { Button, Badge, Plus, Film } = window.AgentSpacesUI;
  const scenes = (project?.scenes || []).slice().sort((a, b) => a.index - b.index);
  const characters = project?.characters || [];

  const addScene = async () => {
    const s = {
      id: uid('scene'),
      index: scenes.length + 1,
      narration: '',
      visualPrompt: '',
      animationPrompt: '',
      characterIds: [],
      images: [],
      video: '',
    };
    await actions.saveScene(s);
  };

  const removeScene = async (id) => {
    if (!window.confirm('删除该分镜？')) return;
    await actions.deleteScene(id);
  };

  return (
    <div className="sb-scenes">
      <div className="sb-scenes-head">
        <span className="sb-list-title"><Film className="sb-icon" />分镜</span>
        <Badge variant="secondary">{scenes.length}</Badge>
        <Button size="sm" variant="outline" onClick={addScene} className="sb-ml-auto">
          <Plus className="sb-icon" />新增分镜
        </Button>
      </div>
      <div className="sb-scene-list">
        {scenes.length === 0 ? (
          <div className="sb-edit-empty">暂无分镜，点击「新增分镜」或用顶部「导入文案」一键生成</div>
        ) : scenes.map((s, i) => (
          <SceneCard
            key={s.id}
            scene={s}
            index={i + 1}
            characters={characters}
            settings={settings}
            actions={actions}
            onRemove={removeScene}
            requestParams={requestParams}
          />
        ))}
      </div>
    </div>
  );
}
