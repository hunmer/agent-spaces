// 文案转分镜 · 角色管理
import React, { useState, useEffect, useRef } from 'react';
import { uid } from '../utils/constants.js';
import { resolveUploadItem, runGeneration } from '../utils/workflow.js';

function sameChar(a, b) {
  if (!a || !b) return false;
  if (a.id !== b.id || a.name !== b.name || a.prompt !== b.prompt) return false;
  const ai = a.images || [];
  const bi = b.images || [];
  if (ai.length !== bi.length) return false;
  return ai.every((x, i) => x.id === bi[i].id && x.url === bi[i].url && !!x.selected === !!bi[i].selected);
}

export default function CharacterPanel({ project, actions, settings, requestParams }) {
  const { Button, Input, Label, Textarea, FileUpload, Badge, Trash2, Plus, User, Star, Loader2, WandSparkles, ImagePlus } = window.AgentSpacesUI;

  const characters = project?.characters || [];
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [genRunningId, setGenRunningId] = useState('');
  const pendingRef = useRef([]);

  // 选中角色兜底（项目切换 / 删除后）
  useEffect(() => {
    const exists = characters.some((c) => c.id === selectedId);
    if (!exists) setSelectedId(characters[0]?.id || '');
  }, [characters, selectedId]);

  // 加载选中角色到 draft（store 与本地一致时不覆盖，避免打断编辑）
  useEffect(() => {
    const c = characters.find((x) => x.id === selectedId) || null;
    setDraft((prev) => {
      if (sameChar(prev, c)) return prev;
      if (!c) return null;
      return { ...c, images: c.images.map((i) => ({ ...i })) };
    });
  }, [selectedId, characters]);

  // autosave（与 store 不一致时 debounce 保存）
  useEffect(() => {
    if (!draft) return;
    const stored = characters.find((c) => c.id === draft.id);
    if (sameChar(draft, stored)) return;
    const t = setTimeout(() => { actions.saveCharacter(draft); }, 500);
    return () => clearTimeout(t);
  }, [draft, characters]);

  const patch = (p) => setDraft((prev) => (prev ? { ...prev, ...p } : prev));

  const addCharacter = async () => {
    const c = { id: uid('char'), name: `角色 ${characters.length + 1}`, prompt: '', images: [] };
    await actions.saveCharacter(c);
    setSelectedId(c.id);
  };

  const removeCharacter = async (id) => {
    if (!window.confirm('删除该角色？分镜中对该角色的引用也会被移除。')) return;
    await actions.deleteCharacter(id);
  };

  // 一键生成角色图片：用角色 prompt 调图片工作流，结果追加进该角色图片列表
  const generateCharImage = async (char) => {
    if (!char?.prompt?.trim()) { window.alert?.('请先填写该角色的提示词'); return; }
    const params = await requestParams({ mode: 'image', variant: 'character' });
    if (!params) return;
    setGenRunningId(char.id);
    try {
      const urls = await runGeneration({
        kind: 'image',
        workflowId: params.generationMode === 'reference'
          ? (settings.editImageWorkflowId || settings.imageWorkflowId)
          : (settings.textToImageWorkflowId || settings.imageWorkflowId),
        input: params.generationMode === 'reference'
          ? {
            images: params.referenceImages || [],
            prompt: char.prompt,
            model: params.model,
            aspect: params.aspect,
            size: params.size,
          }
          : {
            prompt: char.prompt,
            model: params.model,
            aspect: params.aspect,
            size: params.size,
          },
        label: `角色「${char.name || ''}」生图`,
      });
      const existing = Array.isArray(char.images) ? char.images : [];
      const fresh = urls.map((url) => ({ id: uid('img'), url, selected: false }));
      const all = [...existing, ...fresh];
      if (!all.some((i) => i.selected) && all.length) all[0].selected = true;
      await actions.saveCharacter({ ...char, images: all });
    } catch (e) {
      window.alert?.(e?.message || '生成失败');
    } finally {
      setGenRunningId('');
    }
  };

  const onFilesChange = (files) => {
    pendingRef.current = files || [];
    setPendingFiles(files || []);
  };

  const onUploadStatus = (s) => {
    const isUploading = !!s?.uploading;
    setUploading(isUploading);
    if (!isUploading && pendingRef.current.length) {
      const files = pendingRef.current.slice();
      Promise.all(files.map((f) => resolveUploadItem(f).catch(() => null))).then((urls) => {
        const valid = urls.filter(Boolean);
        if (valid.length && draft) {
          setDraft((d) => {
            if (!d) return d;
            const imgs = [...(d.images || []), ...valid.map((url) => ({ id: uid('img'), url, selected: false }))];
            if (!imgs.some((i) => i.selected)) imgs[0].selected = true;
            return { ...d, images: imgs };
          });
        }
        pendingRef.current = [];
        setPendingFiles([]);
      });
    }
  };

  const toggleSelected = (imgId) => {
    setDraft((d) => {
      if (!d) return d;
      const imgs = d.images.map((i) => ({ ...i, selected: i.id === imgId ? !i.selected : false }));
      return { ...d, images: imgs };
    });
  };

  const removeImage = (imgId) => {
    setDraft((d) => {
      if (!d) return d;
      let imgs = d.images.filter((i) => i.id !== imgId);
      if (!imgs.some((i) => i.selected) && imgs.length) imgs[0].selected = true;
      return { ...d, images: imgs };
    });
  };

  const openPreview = (imgId) => {
    const openFn = window.AgentSpacesUI?.openMediaGallery;
    if (typeof openFn !== 'function' || !draft?.images?.length) return;
    const items = draft.images.map((img) => ({ type: 'image', src: img.url, alt: draft.name || '' }));
    const startIndex = Math.max(0, draft.images.findIndex((img) => img.id === imgId));
    openFn(items, startIndex);
  };

  return (
    <div className="sb-split">
      <aside className="sb-list-side">
        <div className="sb-list-head">
          <span className="sb-list-title"><User className="sb-icon" />角色</span>
          <Badge variant="secondary">{characters.length}</Badge>
          <Button size="sm" variant="outline" onClick={addCharacter} className="sb-ml-auto">
            <Plus className="sb-icon" />新增
          </Button>
        </div>
        <div className="sb-list">
          {characters.length === 0 ? (
            <div className="sb-list-empty">暂无角色，点击「新增」</div>
          ) : characters.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              className={`sb-list-item${c.id === selectedId ? ' is-active' : ''}`}
              onClick={() => setSelectedId(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(c.id); } }}
            >
              <div className="sb-list-item-info">
                <span className="sb-list-item-name">{c.name || '未命名'}</span>
                <span className="sb-list-item-sub">{(c.images || []).length} 张图</span>
              </div>
              <button
                type="button"
                className="sb-list-gen"
                onClick={(e) => { e.stopPropagation(); generateCharImage(c); }}
                disabled={genRunningId === c.id}
                title="一键生成角色图片"
              >
                {genRunningId === c.id ? <Loader2 className="sb-icon sb-spin" /> : <WandSparkles className="sb-icon" />}
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="sb-edit">
        {!draft ? (
          <div className="sb-edit-empty">选择左侧角色进行编辑，或新增一个角色</div>
        ) : (
          <div className="sb-edit-body">
            <div className="sb-edit-head">
              <span className="sb-edit-title">{draft.name || '未命名角色'}</span>
              <div className="sb-edit-head-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateCharImage(draft)}
                  disabled={genRunningId === draft.id}
                >
                  {genRunningId === draft.id ? <Loader2 className="sb-icon sb-spin" /> : <WandSparkles className="sb-icon" />}
                  {genRunningId === draft.id ? '生成中' : '一键生成角色图片'}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => removeCharacter(draft.id)} title="删除角色">
                  <Trash2 className="sb-icon" />
                </Button>
              </div>
            </div>

            <div className="sb-field">
              <Label>名称</Label>
              <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="角色名" />
            </div>

            <div className="sb-field">
              <Label>提示词（外观描述，用于图像生成）</Label>
              <Textarea
                value={draft.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder="例如：a young woman in a white shirt, short hair, warm smile"
                className="sb-textarea"
              />
            </div>

            <div className="sb-field">
              <Label>图片列表（点选一张作为「选中图」，生成分镜时作为参考）</Label>
              <div className="sb-img-grid">
                {(draft.images || []).map((img) => (
                  <div key={img.id} className={`sb-img-thumb${img.selected ? ' is-selected' : ''}`}>
                    <img src={img.url} alt="" onClick={() => openPreview(img.id)} />
                    <button
                      type="button"
                      className={`sb-img-star${img.selected ? ' is-selected' : ''}`}
                      onClick={() => toggleSelected(img.id)}
                      title={img.selected ? '取消选中图' : '设为选中图'}
                    >
                      <Star className="sb-icon" />
                    </button>
                    <button type="button" className="sb-img-del" onClick={() => removeImage(img.id)} title="删除">
                      <Trash2 className="sb-icon" />
                    </button>
                  </div>
                ))}
                <div className="sb-img-thumb sb-upload-thumb">
                  <div className="sb-upload-thumb-ui">
                    {uploading ? <Loader2 className="sb-icon sb-spin" /> : <ImagePlus className="sb-icon" />}
                    <span>{uploading ? '上传中' : '上传图片'}</span>
                  </div>
                  <div className="sb-upload-thumb-input">
                    <FileUpload
                      value={pendingFiles}
                      onChange={onFilesChange}
                      onUploadStatusChange={onUploadStatus}
                      accept="image/*"
                      autoUpload
                      multiple
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
