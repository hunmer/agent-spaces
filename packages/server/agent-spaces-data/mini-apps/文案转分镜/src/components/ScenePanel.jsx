// 文案转分镜 · 分镜管理
import React, { useState, useEffect } from 'react';
import { uid } from '../utils/constants.js';
import { runGeneration, runVoiceGeneration, buildMediaGalleryItems, openMediaPreview } from '../utils/workflow.js';

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
    && (a.video || '') === (b.video || '')
    && JSON.stringify(a.audios || []) === JSON.stringify(b.audios || []);
}

function SceneCard({ scene, index, characters, settings, actions, onRemove, requestParams, bulkStatus, selected, onToggleSelect, onRemoveMedia, exportBusy }) {
  const { Button, Label, Textarea, Trash2, Loader2, Film: FilmIcon, Image: ImageIcon, Eraser, Star, Check, Volume2 } = window.AgentSpacesUI;

  const [draft, setDraft] = useState(() => ({ ...scene, characterIds: [...(scene.characterIds || [])] }));
  const [imgRunning, setImgRunning] = useState(false);
  const [vidRunning, setVidRunning] = useState(false);
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft((prev) => (sameScene(prev, scene)
      ? prev
      : { ...scene, characterIds: [...(scene.characterIds || [])] }));
  }, [scene]);

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
    const params = await requestParams('image');
    if (!params) return;
    setError('');
    setImgRunning(true);
    try {
      const images = collectRefImages();
      const charPrompt = (draft.characterIds || [])
        .map((cid) => characters.find((x) => x.id === cid)?.prompt)
        .filter(Boolean)
        .join('; ');
      const prompt = [charPrompt, draft.visualPrompt].filter(Boolean).join('\n');
      const hasRefImages = images.length > 0;
      const urls = await runGeneration({
        kind: 'image',
        workflowId: hasRefImages
          ? (settings.editImageWorkflowId || settings.imageWorkflowId)
          : (settings.textToImageWorkflowId || settings.imageWorkflowId),
        input: hasRefImages
          ? { images, prompt, model: params.model, aspect: params.aspect, size: params.size }
          : { prompt, model: params.model, aspect: params.aspect, size: params.size },
        label: `分镜 ${index} 生成图片`,
      });
      await actions.addSceneMedia(draft.id, 'image', urls);
    } catch (e) {
      setError(e?.message || '生成失败');
    } finally {
      setImgRunning(false);
    }
  };

  const generateVideo = async () => {
    if (!draft.animationPrompt?.trim()) { setError('请填写动画提示词'); return; }
    const params = await requestParams('video');
    if (!params) return;
    setError('');
    setVidRunning(true);
    try {
      const images = (draft.images && draft.images.length) ? draft.images.slice(-1) : collectRefImages();
      const urls = await runGeneration({
        kind: 'video',
        workflowId: settings.videoWorkflowId,
        input: {
          images,
          prompt: draft.animationPrompt,
          model: params.model,
          aspect: params.aspect,
          quality: params.quality,
          duration: params.duration,
        },
        label: `分镜 ${index} 生成视频`,
      });
      await actions.addSceneMedia(draft.id, 'video', urls);
    } catch (e) {
      setError(e?.message || '生成失败');
    } finally {
      setVidRunning(false);
    }
  };

  const generateVoice = async () => {
    if (!draft.narration?.trim()) { setError('请填写旁白文本'); return; }
    const params = await requestParams('voice');
    if (!params) return;
    setError('');
    setVoiceRunning(true);
    try {
      const input = {
        prompt: draft.narration,
        model: params.voiceModel || 'fish-audio',
      };
      if (params.voiceId) input.voiceId = params.voiceId;
      const urls = await runVoiceGeneration({
        workflowId: settings.voiceWorkflowId,
        input,
        label: `分镜 ${index} 语音合成`,
      });
      await actions.addSceneMedia(draft.id, 'audio', urls);
    } catch (e) {
      setError(e?.message || '语音合成失败');
    } finally {
      setVoiceRunning(false);
    }
  };

  const previewImages = (startIndex = 0) => {
    openMediaPreview(buildMediaGalleryItems(draft.images || [], 'image', `分镜 ${index}`), startIndex);
  };

  const previewVideo = () => {
    openMediaPreview(buildMediaGalleryItems(draft.video ? [draft.video] : [], 'video', `分镜 ${index}`), 0);
  };

  const imageBusy = imgRunning || bulkStatus?.image === 'running' || bulkStatus?.image === 'retrying';
  const videoBusy = vidRunning || bulkStatus?.video === 'running' || bulkStatus?.video === 'retrying';
  const voiceBusy = voiceRunning || bulkStatus?.voice === 'running' || bulkStatus?.voice === 'retrying';
  const canGenerateVideo = !!draft.images?.length && !imageBusy && !videoBusy;
  const canGenerateVoice = !voiceBusy && !imageBusy && !videoBusy;

  return (
    <article className="sb-scene-card">
      <header className="sb-scene-head">
        <div className="sb-scene-no">{index}</div>
        <div className="sb-scene-actions">
          <Button size="sm" variant="outline" onClick={generateImage} disabled={imageBusy || videoBusy}>
            {imageBusy ? <Loader2 className="sb-icon sb-spin" /> : <ImageIcon className="sb-icon" />}
            {bulkStatus?.image === 'retrying' ? '重试中' : imageBusy ? '生成中' : '生成图片'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={generateVideo}
            disabled={!canGenerateVideo}
            title={draft.images?.length ? '基于当前分镜图片生成视频' : '请先生成图片'}
          >
            {videoBusy ? <Loader2 className="sb-icon sb-spin" /> : <FilmIcon className="sb-icon" />}
            {bulkStatus?.video === 'retrying' ? '重试中' : videoBusy ? '生成中' : '生成视频'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={generateVoice}
            disabled={!canGenerateVoice}
            title="基于旁白文本生成语音"
          >
            {voiceBusy ? <Loader2 className="sb-icon sb-spin" /> : <Volume2 className="sb-icon" />}
            {bulkStatus?.voice === 'retrying' ? '重试中' : voiceBusy ? '合成中' : '语音合成'}
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
          <Label className="sb-field-label">画面提示词</Label>
          <Textarea value={draft.visualPrompt} onChange={(e) => patch({ visualPrompt: e.target.value })} placeholder="场景、构图、光线、主体动作..." className="sb-textarea-sm" />
        </div>
        <div className="sb-field">
          <Label className="sb-field-label">动画提示词</Label>
          <Textarea value={draft.animationPrompt} onChange={(e) => patch({ animationPrompt: e.target.value })} placeholder="运镜、动作、节奏..." className="sb-textarea-sm" />
        </div>
      </div>

      <div className="sb-field">
        <Label>参与角色</Label>
        <div className="sb-avatars">
          {characters.length === 0 ? (
            <span className="sb-chips-empty">先在「角色」页添加角色</span>
          ) : characters.map((c) => {
            const on = (draft.characterIds || []).includes(c.id);
            const cover = (c.images || []).find((img) => img.selected)?.url || c.images?.[0]?.url || '';
            const initial = (c.name || '?').slice(0, 1).toUpperCase();
            return (
              <button
                type="button"
                key={c.id}
                className={`sb-avatar${on ? ' is-on' : ''}`}
                onClick={() => toggleChar(c.id)}
                title={c.name || '未命名角色'}
              >
                <span className="sb-avatar-media">
                  {cover ? <img src={cover} alt={c.name || ''} /> : <span className="sb-avatar-fallback">{initial}</span>}
                </span>
                <span className="sb-avatar-name">{c.name || '未命名'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="sb-error">{error}</div>}

      {(draft.images?.length > 0 || draft.video || draft.audios?.length > 0) && (
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
                {draft.images.map((url, i) => {
                  const on = selected.has(url);
                  return (
                    <div key={`${url}-${i}`} className={`sb-img-thumb${on ? ' is-selected' : ''}`}>
                      <img src={url} alt="" onClick={() => previewImages(i)} />
                      <button
                        type="button"
                        className={`sb-img-star${on ? ' is-selected' : ''}`}
                        onClick={() => onToggleSelect(url)}
                        title={on ? '取消选中' : '加入导出选中'}
                      >
                        {on ? <Check className="sb-icon" /> : <Star className="sb-icon" />}
                      </button>
                      <button
                        type="button"
                        className="sb-img-del"
                        onClick={() => onRemoveMedia(draft.id, 'image', url)}
                        title="删除"
                      >
                        <Trash2 className="sb-icon" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {draft.video && (
            <div className="sb-media-block">
              <div className="sb-media-head">
                <span>生成视频</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className={`sb-video-star${selected.has(draft.video) ? ' is-selected' : ''}`}
                    onClick={() => onToggleSelect(draft.video)}
                    title={selected.has(draft.video) ? '取消选中' : '加入导出选中'}
                  >
                    {selected.has(draft.video) ? <Check className="sb-icon" /> : <Star className="sb-icon" />}
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => actions.clearSceneMedia(draft.id, 'video')} title="清空视频">
                    <Eraser className="sb-icon" />
                  </Button>
                </div>
              </div>
              <video className="sb-video" src={draft.video} controls onClick={previewVideo} />
              <button
                type="button"
                className="sb-video-del"
                onClick={() => onRemoveMedia(draft.id, 'video', draft.video)}
                title="删除视频"
              >
                <Trash2 className="sb-icon" />删除视频
              </button>
            </div>
          )}
          {draft.audios?.length > 0 && (
            <div className="sb-media-block">
              <div className="sb-media-head">
                <span>合成语音 ({draft.audios.length})</span>
                <Button size="icon" variant="ghost" onClick={() => actions.clearSceneMedia(draft.id, 'audio')} title="清空语音">
                  <Eraser className="sb-icon" />
                </Button>
              </div>
              <div className="sb-audio-list">
                {draft.audios.map((url, i) => {
                  const on = selected.has(url);
                  return (
                    <div key={`${url}-${i}`} className={`sb-audio-item${on ? ' is-selected' : ''}`}>
                      <button
                        type="button"
                        className={`sb-audio-star${on ? ' is-selected' : ''}`}
                        onClick={() => onToggleSelect(url)}
                        title={on ? '取消选中' : '加入导出选中'}
                      >
                        {on ? <Check className="sb-icon" /> : <Star className="sb-icon" />}
                      </button>
                      <audio className="sb-audio" src={url} controls preload="metadata" />
                      <button
                        type="button"
                        className="sb-audio-del"
                        onClick={() => onRemoveMedia(draft.id, 'audio', url)}
                        title="删除该语音"
                      >
                        <Trash2 className="sb-icon" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function ScenePanel({ project, settings, actions, requestParams }) {
  const { Button, Badge, Plus, Film, Download, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Loader2 } = window.AgentSpacesUI;
  const scenes = (project?.scenes || []).slice().sort((a, b) => a.index - b.index);
  const characters = project?.characters || [];
  const [bulkRunning, setBulkRunning] = useState('');
  const [bulkSceneStatus, setBulkSceneStatus] = useState({});
  // 导出选中集合：Set<url>（图片可多选，视频可选）
  const [selected, setSelected] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);

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

  // 切换某 url 的选中态（图片多选、视频可选）
  const toggleSelect = (url) => {
    if (!url) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // 删除单条媒体，并同步移除其选中
  const removeMedia = async (sceneId, kind, url) => {
    if (!window.confirm(kind === 'video' ? '删除该视频？' : '删除该图片？')) return;
    setSelected((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
    await actions.removeSceneMedia(sceneId, kind, url);
  };

  // 收集所有场景的全部媒体 [{ kind, url, sceneIndex }]
  const collectAllMedia = () => {
    const out = [];
    scenes.forEach((scene, i) => {
      (scene.images || []).forEach((url) => { if (url) out.push({ kind: 'image', url, sceneIndex: i + 1 }); });
      if (scene.video) out.push({ kind: 'video', url: scene.video, sceneIndex: i + 1 });
      (scene.audios || []).forEach((url) => { if (url) out.push({ kind: 'audio', url, sceneIndex: i + 1 }); });
    });
    return out;
  };

  // 从 url 推断扩展名
  const extOf = (url, kind) => {
    const m = String(url).split('?')[0].match(/\.([a-zA-Z0-9]{2,4})$/);
    if (m) return m[1].toLowerCase();
    if (kind === 'video') return 'mp4';
    if (kind === 'audio') return 'mp3';
    return 'png';
  };

  const triggerDownload = (href, filename) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // base64 -> Blob
  const base64ToBlob = (base64, mime) => {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
  };

  // 经服务端代理下载媒体（绕过浏览器 CORS），返回 Blob
  const fetchMediaBlob = async (url) => {
    const res = await actions.fetchMedia(url);
    if (!res?.base64) throw new Error('代理下载无数据');
    return base64ToBlob(res.base64, res.mime);
  };

  // 动态加载 JSZip（不可用时回退逐个下载）
  const loadJsZip = () => new Promise((resolve) => {
    if (window.JSZip) return resolve(window.JSZip);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  // 打包导出 zip；onlySelected=true 时仅导出选中
  const exportZip = async (onlySelected) => {
    const all = collectAllMedia();
    const targets = onlySelected ? all.filter((m) => selected.has(m.url)) : all;
    if (!targets.length) {
      window.alert?.(onlySelected ? '没有选中的图片/视频' : '当前项目没有可导出的图片/视频');
      return;
    }
    setExporting(true);
    // 同名去重：分镜N-kind-ext
    const used = new Set();
    const pickName = (m) => {
      const ext = extOf(m.url, m.kind);
      let name = `分镜${m.sceneIndex}-${m.kind}.${ext}`;
      let n = 1;
      while (used.has(name)) { name = `分镜${m.sceneIndex}-${m.kind}-${n}.${ext}`; n += 1; }
      used.add(name);
      return name;
    };
    try {
      // 经服务端代理并发抓取（控制并发为 3，避免服务端 fetch 压力）
      const concurrency = 3;
      let cursor = 0;
      const fetched = []; // { name, blob }
      const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
        while (cursor < targets.length) {
          const m = targets[cursor];
          cursor += 1;
          try {
            const blob = await fetchMediaBlob(m.url);
            fetched.push({ name: pickName(m), blob });
          } catch (e) {
            // 单个失败跳过，最终汇总
            fetched.push({ name: pickName(m), error: e?.message || String(e) });
          }
        }
      });
      await Promise.all(workers);

      const okItems = fetched.filter((x) => x.blob);
      if (!okItems.length) throw new Error('所有文件抓取失败');

      const JSZip = await loadJsZip();
      if (JSZip) {
        const zip = new JSZip();
        okItems.forEach(({ name, blob }) => zip.file(name, blob));
        const content = await zip.generateAsync({ type: 'blob' });
        const objUrl = URL.createObjectURL(content);
        const fname = `${project?.name || '分镜'}-${onlySelected ? '选中' : '全部'}-${Date.now()}.zip`;
        triggerDownload(objUrl, fname);
        setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
      } else {
        // 无 JSZip：逐个用 Blob URL 下载
        okItems.forEach(({ name, blob }) => {
          const objUrl = URL.createObjectURL(blob);
          triggerDownload(objUrl, name);
          setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
        });
      }
      const failed = fetched.filter((x) => x.error);
      if (failed.length) {
        window.alert?.(`导出完成：成功 ${okItems.length}，失败 ${failed.length}\n失败文件:\n${failed.map((x) => x.name).join('\n')}`);
      }
    } catch (e) {
      window.alert?.('导出失败：' + (e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  const selectedCount = selected.size;

  const collectRefImagesForScene = (scene) => {
    const refs = [];
    (scene?.characterIds || []).forEach((cid) => {
      const c = characters.find((x) => x.id === cid);
      (c?.images || []).forEach((img) => { if (img.selected && img.url) refs.push(img.url); });
    });
    return refs;
  };

  const buildSceneImagePrompt = (scene) => {
    const charPrompt = (scene?.characterIds || [])
      .map((cid) => characters.find((x) => x.id === cid)?.prompt)
      .filter(Boolean)
      .join('; ');
    return [charPrompt, scene?.visualPrompt || ''].filter(Boolean).join('\n');
  };

  const showBulkSummary = (label, stats) => {
    const lines = [
      `${label}完成`,
      `成功: ${stats.success}`,
      `跳过: ${stats.skipped}`,
      `失败: ${stats.failed}`,
    ];
    if (stats.failedItems.length) {
      lines.push('', '失败分镜:');
      stats.failedItems.forEach((item) => {
        lines.push(`- 分镜 ${item.index}: ${item.message}`);
      });
    }
    window.alert?.(lines.join('\n'));
  };

  const markBulkSceneStatus = (sceneId, kind, status) => {
    setBulkSceneStatus((prev) => ({
      ...prev,
      [sceneId]: {
        ...(prev[sceneId] || {}),
        [kind]: status,
      },
    }));
  };

  const clearBulkSceneStatus = () => setBulkSceneStatus({});

  const runWithRetry = async ({ sceneId, kind, task }) => {
    markBulkSceneStatus(sceneId, kind, 'running');
    try {
      return await task();
    } catch (error) {
      markBulkSceneStatus(sceneId, kind, 'retrying');
      try {
        return await task();
      } catch (retryError) {
        markBulkSceneStatus(sceneId, kind, 'error');
        throw retryError;
      }
    } finally {
      setBulkSceneStatus((prev) => {
        const next = { ...prev };
        if (!next[sceneId]) return prev;
        next[sceneId] = { ...next[sceneId], [kind]: '' };
        const rest = next[sceneId];
        if (!rest.image && !rest.video && !rest.voice) delete next[sceneId];
        return next;
      });
    }
  };

  const runQueue = async (items, limit, worker) => {
    const concurrency = Math.max(1, Number(limit) || 1);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const current = items[cursor];
        cursor += 1;
        await worker(current);
        if (cursor < items.length) await sleep(1000);
      }
    });
    await Promise.all(runners);
  };

  const generateAllImages = async () => {
    if (!scenes.length || bulkRunning) return;
    const params = await requestParams({ mode: 'image', variant: 'bulk' });
    if (!params) return;
    setBulkRunning('image');
    clearBulkSceneStatus();
    const stats = { success: 0, skipped: 0, failed: 0, failedItems: [] };
    try {
      const pendingScenes = [];
      for (const scene of scenes) {
        if (!scene?.visualPrompt?.trim() || scene?.images?.length) {
          stats.skipped += 1;
          continue;
        }
      }
      pendingScenes.push(...scenes.filter((scene) => scene?.visualPrompt?.trim() && !scene?.images?.length));
      await runQueue(pendingScenes, params.batchLimit, async (scene) => {
        const images = collectRefImagesForScene(scene);
        const prompt = buildSceneImagePrompt(scene);
        const hasRefImages = images.length > 0;
        try {
          const urls = await runWithRetry({
            sceneId: scene.id,
            kind: 'image',
            task: () => runGeneration({
              kind: 'image',
              workflowId: hasRefImages
                ? (settings.editImageWorkflowId || settings.imageWorkflowId)
                : (settings.textToImageWorkflowId || settings.imageWorkflowId),
              input: hasRefImages
                ? { images, prompt, model: params.model, aspect: params.aspect, size: params.size }
                : { prompt, model: params.model, aspect: params.aspect, size: params.size },
              label: `分镜 ${scene.index} 生成图片`,
            }),
          });
          await actions.addSceneMedia(scene.id, 'image', urls);
          stats.success += 1;
        } catch (e) {
          stats.failed += 1;
          stats.failedItems.push({ index: scene.index, message: e?.message || '生成失败' });
        }
      });
    } finally {
      setBulkRunning('');
      showBulkSummary('批量生成图片', stats);
    }
  };

  const generateAllVideos = async () => {
    if (!scenes.length || bulkRunning) return;
    const params = await requestParams({ mode: 'video', variant: 'bulk' });
    if (!params) return;
    setBulkRunning('video');
    clearBulkSceneStatus();
    const stats = { success: 0, skipped: 0, failed: 0, failedItems: [] };
    try {
      const pendingScenes = [];
      for (const scene of scenes) {
        if (!scene?.animationPrompt?.trim() || !scene?.images?.length || scene?.video) {
          stats.skipped += 1;
          continue;
        }
      }
      pendingScenes.push(...scenes.filter((scene) => scene?.animationPrompt?.trim() && scene?.images?.length && !scene?.video));
      await runQueue(pendingScenes, params.batchLimit, async (scene) => {
        try {
          const urls = await runWithRetry({
            sceneId: scene.id,
            kind: 'video',
            task: () => runGeneration({
              kind: 'video',
              workflowId: settings.videoWorkflowId,
              input: {
                images: scene.images.slice(-1),
                prompt: scene.animationPrompt,
                model: params.model,
                aspect: params.aspect,
                quality: params.quality,
                duration: params.duration,
              },
              label: `分镜 ${scene.index} 生成视频`,
            }),
          });
          await actions.addSceneMedia(scene.id, 'video', urls);
          stats.success += 1;
        } catch (e) {
          stats.failed += 1;
          stats.failedItems.push({ index: scene.index, message: e?.message || '生成失败' });
        }
      });
    } finally {
      setBulkRunning('');
      showBulkSummary('批量生成视频', stats);
    }
  };

  const canBulkImage = scenes.some((scene) => scene?.visualPrompt?.trim() && !scene?.images?.length);
  const canBulkVideo = scenes.some((scene) => scene?.images?.length && !scene?.video);
  const canBulkVoice = scenes.some((scene) => scene?.narration?.trim());

  const generateAllVoices = async () => {
    if (!scenes.length || bulkRunning) return;
    const params = await requestParams({ mode: 'voice', variant: 'bulk' });
    if (!params) return;
    setBulkRunning('voice');
    clearBulkSceneStatus();
    const stats = { success: 0, skipped: 0, failed: 0, failedItems: [] };
    try {
      const pendingScenes = scenes.filter((scene) => scene?.narration?.trim());
      const skippedCount = scenes.length - pendingScenes.length;
      stats.skipped = skippedCount;
      await runQueue(pendingScenes, params.batchLimit, async (scene) => {
        try {
          const input = {
            prompt: scene.narration,
            model: params.voiceModel || 'fish-audio',
          };
          if (params.voiceId) input.voiceId = params.voiceId;
          const urls = await runWithRetry({
            sceneId: scene.id,
            kind: 'voice',
            task: () => runVoiceGeneration({
              workflowId: settings.voiceWorkflowId,
              input,
              label: `分镜 ${scene.index} 语音合成`,
            }),
          });
          await actions.addSceneMedia(scene.id, 'audio', urls);
          stats.success += 1;
        } catch (e) {
          stats.failed += 1;
          stats.failedItems.push({ index: scene.index, message: e?.message || '语音合成失败' });
        }
      });
    } finally {
      setBulkRunning('');
      showBulkSummary('批量语音合成', stats);
    }
  };

  return (
    <div className="sb-scenes">
      <div className="sb-scenes-head">
        <span className="sb-list-title"><Film className="sb-icon" />分镜</span>
        <Badge variant="secondary">{scenes.length}</Badge>
        <div className="sb-scenes-head-actions sb-ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={generateAllImages}
            disabled={!canBulkImage || !!bulkRunning}
            title={canBulkImage ? '批量补齐缺失图片' : '没有需要补生成图片的分镜'}
          >
            {bulkRunning === 'image' ? '生成中' : '一键生成图片'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={generateAllVideos}
            disabled={!canBulkVideo || !!bulkRunning}
            title={canBulkVideo ? '基于已有分镜图片批量生成视频' : '请先至少生成一张分镜图片'}
          >
            {bulkRunning === 'video' ? '生成中' : '一键生成视频'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={generateAllVoices}
            disabled={!canBulkVoice || !!bulkRunning}
            title={canBulkVoice ? '基于旁白文本批量合成语音' : '没有需要合成语音的分镜'}
          >
            {bulkRunning === 'voice' ? '合成中' : '一键语音合成'}
          </Button>
          <Button size="sm" variant="outline" onClick={addScene}>
            <Plus className="sb-icon" />新增分镜
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={!scenes.length || exporting} title="导出图片/视频/语音">
                {exporting ? <Loader2 className="sb-icon sb-spin" /> : <Download className="sb-icon" />}
                {exporting ? '导出中' : '导出'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: '180px' }}>
              <DropdownMenuItem disabled={!selectedCount || exporting} onClick={() => exportZip(true)}>
                导出选中 {selectedCount ? `(${selectedCount})` : ''}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!scenes.length || exporting} onClick={() => exportZip(false)}>
                导出全部到 zip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
            bulkStatus={bulkSceneStatus[s.id] || {}}
            selected={selected}
            onToggleSelect={toggleSelect}
            onRemoveMedia={removeMedia}
            exportBusy={exporting}
          />
        ))}
      </div>
    </div>
  );
}
