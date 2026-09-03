import { useCallback, useMemo, useState } from 'react';
import { SearchSelect, Wand2 } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { useNodeDialog } from './NodeDialogContext';
import PickedPromptBadge from './PickedPromptBadge';
import FileUpload from '../FileUpload';
import MaskPaintDialog from '../MaskPaintDialog';
import { orderUpstream } from './UpstreamImageList';
import CountAndConcurrency from './CountAndConcurrency';
import { ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_TYPES, SIZE_OPTIONS, WORKFLOWS } from '../../utils/constants';
import { normalizeImageUrls, resolveReferenceImages, promptToText, dedupeUrls } from '../../utils/workflow';
import UploadSection from './UploadSection';
import TextVariableEditor from './TextVariableEditor';
import WorkflowExecutionButton from './WorkflowExecutionButton';

/**
 * 编辑图片节点。
 * data.params: { prompt, model, aspect, size }
 * data.images: string[]  上游通过连线推入的待编辑图片 URL（或手动粘贴）
 * data.output: { images: string[] }  编辑后的产出
 * data.workflowExecution: { workflowId, logId } 最近一次成功编辑对应的工作流日志
 */

// 参数 schema（agent 通过 get_node_params 读取）。与 TextToImageNode 同构，
// 但 prompt 语义是「编辑指令」，且执行需输入图（由节点上传/连线提供，非 params）。
export const PARAMS_SCHEMA = [
  {
    key: 'prompt',
    label: '编辑指令',
    type: 'text',
    required: true,
    description: '描述要怎么改输入图，如「把背景换成星空，保持主体不变」。会与 pickedPrompt 合并后提交。',
  },
  {
    key: 'model',
    label: '模型',
    type: 'select',
    options: MODEL_OPTIONS,
    default: DEFAULT_MODEL,
    description: '图像编辑模型。value 是要填进 data.params.model 的值。',
  },
  {
    key: 'aspect',
    label: '画面比例',
    type: 'select',
    options: ASPECT_OPTIONS.map((v) => ({ value: v, label: v })),
    default: '1:1',
  },
  {
    key: 'size',
    label: '输出尺寸',
    type: 'select',
    options: SIZE_OPTIONS.map((v) => ({ value: v, label: v })),
    default: '1k',
  },
  {
    key: 'fileName',
    label: '文件名',
    type: 'text',
    description: '可选。产出图下载、保存到素材库时使用的文件名（含扩展名，如 hero_edited.png）；多张产出自动加 _2/_3 后缀。留空则用 URL 默认名。',
  },
  {
    key: 'mask',
    label: '蒙版图片',
    type: 'image',
    description: '可选。蒙版图片 URL（单张）。白色区域表示需要编辑的部分，黑色区域保持不变。通过节点内的「蒙版图片」上传区设置，提交时作为 mask 字段传入 edit_image 工作流。',
  },
];

function editPromptToText(html) {
  if (!html || typeof DOMParser === 'undefined') return promptToText(html);
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstChild;
    root?.querySelectorAll('.prompt-mention, [data-mention]').forEach((mention) => {
      const legacyKey = mention.getAttribute('data-key') || '';
      const match = /^R(\d+)$/.exec(legacyKey);
      if (match) mention.setAttribute('data-key', `#${Number(match[1]) + 1}`);
    });
    return promptToText(root?.innerHTML || html);
  } catch {
    return promptToText(html);
  }
}

export default function EditImageNode({ id, data, selected }) {
  const storedParams = data?.params || {};
  const params = { ...storedParams, ...(data?.textInputValues || {}) };
  // 连线图（由 computeInputImages 派生到 data.images）+ 用户上传图（data.uploadedImages，持久化不被覆盖）
  // 两种来源并存，提交时合并去重。参考 imageProcess 节点的双来源模式。
  const inputImages = data?.images || [];
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const connectedMask = data?.fileUploadInputs?.mask?.[0] || '';
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const onGenerate = data?.onGenerate;
  const onCancelProcess = data?.onCancelProcess;
  const { openPicker, openOptimize } = useNodeDialog();
  const [maskPaintSource, setMaskPaintSource] = useState('');

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...storedParams, ...patch } });
  }, [onUpdate, storedParams]);

  // FileUpload onChange：上传待编辑图片，写入 data.uploadedImages（与连线图 data.images 分离，互不覆盖）
  const setUploadedImages = useCallback((urls) => {
    onUpdate?.({ uploadedImages: Array.isArray(urls) ? urls.filter(Boolean) : [] });
  }, [onUpdate]);

  // 蒙版图片：单张，存 params.mask（string URL）。FileUpload 用 max=1，onChange 取首项。
  const setMaskImage = useCallback((urls) => {
    const next = Array.isArray(urls) ? urls.filter(Boolean) : [];
    onUpdate?.({ params: { ...storedParams, mask: next[0] || undefined } });
  }, [onUpdate, storedParams]);

  const setMaskPaintData = useCallback((next) => {
    onUpdate?.({ editMaskPaintData: next });
  }, [onUpdate]);

  // 把参考图 + 连线图作为只读项整合进同一个 FileUpload 网格（带来源角标），上传图可删，只读项不可删。
  // 这样「输入图片」与「参考图」合并为单一区块，避免 UI 分组割裂。
  const refImages = Array.isArray(params.referenceImages) ? params.referenceImages : [];
  const protectedUpstreamImages = new Set(data?.protectedUpstreamImageUrls || []);
  const removeReferenceImage = useCallback((idx) => {
    const next = refImages.filter((_, i) => i !== idx);
    set({ referenceImages: next.length ? next : undefined });
  }, [refImages, set]);
  const extraItems = [
    ...refImages.map((src, i) => ({ src, badge: '参考', onRemove: () => removeReferenceImage(i) })),
    ...inputImages.map((src) => ({
      src,
      badge: '连线',
      onRemove: protectedUpstreamImages.has(src) ? undefined : () => data?.onDeleteUpstreamImage?.(src),
    })),
  ];

  // prompt 是编辑指令的唯一字段；可保存 PromptTextEditor 生成的 HTML，提交时再转纯文本。
  const prompt = storedParams.prompt || '';

  // 统一的输入图清单：参考图 + 上传图 + 连线图，按用户拖拽顺序持久化。
  // @ 列表、key(#1/#2…)映射、提交 images 三处都用它，保证「上传后 @ 能选到新图」且 key 与提交顺序一致。
  const rawInputImages = useMemo(
    () => dedupeUrls([...refImages, ...uploadedImages, ...inputImages]),
    [refImages, uploadedImages, inputImages],
  );
  const inputImageOrder = Array.isArray(data?.inputImageOrder) ? data.inputImageOrder : null;
  const allInputImages = useMemo(
    () => orderUpstream(rawInputImages, inputImageOrder),
    [rawInputImages, inputImageOrder],
  );

  // PromptTextEditor 的 references：全部输入图按顺序映射为从 1 开始的 #1/#2/… 关键字。
  const editorReferences = useMemo(
    () => allInputImages.map((url, i) => ({ url, label: `图${i + 1}`, key: `#${i + 1}` })),
    [allInputImages],
  );

  const handleRun = useCallback(() => {
    // 至少有一张输入图才执行（allInputImages 已含全部来源 + 去重）
    if (!allInputImages.length) return;
    // 编辑指令 HTML → 纯文本（@参考图 mention → #1/#2 关键字）
    const userPrompt = editPromptToText(params.prompt || '');
    // 提示词库选中 + 用户输入 合并（去空去重）
    const merged = [params.pickedPrompt, userPrompt].map((s) => (s || '').trim()).filter(Boolean).join('\n');
    onGenerate?.(id, NODE_TYPES.editImage, {
      workflowId: WORKFLOWS.edit_image,
      input: {
        images: normalizeImageUrls(allInputImages),
        prompt: merged,
        model: params.model || DEFAULT_MODEL,
        aspect: params.aspect || '1:1',
        size: params.size || '1k',
        count: Math.max(1, Number(params.count) || 1),
        concurrency: Math.max(1, Number(params.concurrency) || 1),
        ...(connectedMask || params.mask
          ? { mask: normalizeImageUrls([connectedMask || params.mask])[0] }
          : {}),
      },
    });
  }, [onGenerate, id, params, prompt, allInputImages, connectedMask]);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.editImage} data={data} selected={selected} targetHandle sourceHandle>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">输入图片</span>
        <UploadSection>
          <FileUpload
          nodeId={id}
          value={uploadedImages}
          onChange={setUploadedImages}
          max={6}
          placeholder="点击或拖拽上传待编辑图片"
          extraItems={extraItems}
          itemOrder={allInputImages}
          onReorderItems={(next) => onUpdate?.({ inputImageOrder: next })}
          onEditItem={setMaskPaintSource}
          />
        </UploadSection>
      </div>

      <PickedPromptBadge
        pickedPrompt={params.pickedPrompt}
        onClear={() => set({ pickedPrompt: undefined, referenceImages: undefined })}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            编辑指令
            {refImages.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">（输入 @ 插入参考图）</span>}
          </span>
          <button
            type="button"
            onClick={() => openPicker({
              scene: 'edit',
              onPick: (item) => set({
                pickedPrompt: item.prompt,
                referenceImages: resolveReferenceImages(item.references),
                ...(item.aspect ? { aspect: item.aspect } : {}),
              }),
            })}
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            📋 提示词库
          </button>
        </div>
        <div className="nodrag nopan nowheel relative min-h-[56px] resize-y rounded-md border border-border bg-background px-2 py-1.5 pr-8 text-sm focus-within:border-primary">
          <TextVariableEditor
            data={data}
            field="prompt"
            value={prompt}
            resolvedValue={params.prompt || ''}
            onChange={(html) => set({ prompt: html })}
            references={editorReferences}
            valueFormat="html"
            placeholder="如：将背景改为星空，保持宝箱主体不变（输入 @ 插入参考图）"
          />
          <button
            type="button"
            onClick={() => openOptimize({
              prompt: editPromptToText(prompt),
              agentConfig: data?.promptOptimizeAgent,
              onApply: (newPrompt) => {
                set({ prompt: newPrompt });
              },
            })}
            title="优化提示词"
            disabled={!data?.promptOptimizeAgent?.id}
            className="nopan nowheel absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-primary/10 hover:text-primary hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Wand2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 模型：优先用设置页自定义列表，回退内置 MODEL_OPTIONS；支持临时输入列表外的值 */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">模型</span>
        <SearchSelect
          value={params.model || DEFAULT_MODEL}
          onChange={(v) => set({ model: v })}
          options={data?.modelOptions || MODEL_OPTIONS}
          placeholder="选择或输入模型"
          searchPlaceholder="搜索模型…"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <MiniSelect label="比例" value={params.aspect || '1:1'} rawOptions={ASPECT_OPTIONS} onChange={(v) => set({ aspect: v })} />
        <MiniSelect label="尺寸" value={params.size || '1k'} rawOptions={SIZE_OPTIONS} onChange={(v) => set({ size: v })} />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">文件名（可选）</span>
        <div className="nodrag nopan nowheel rounded-md border border-border bg-background px-2 py-1 text-sm focus-within:border-primary">
          <TextVariableEditor
            data={data}
            field="fileName"
            value={storedParams.fileName || ''}
            resolvedValue={params.fileName || ''}
            placeholder="如 hero_edited.png，留空用默认名"
            singleLine
            onChange={(value) => set({ fileName: value || undefined })}
          />
        </div>
      </label>

      {/* 蒙版图片（单张）：白色=需编辑区域。提交时作为 mask 字段传入 edit_image 工作流。 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">蒙版图片（可选）</span>
        <UploadSection>
          <FileUpload
            value={connectedMask ? [] : (params.mask ? [params.mask] : [])}
            onChange={setMaskImage}
            max={connectedMask ? 0 : 1}
            placeholder="上传蒙版图片（白色=编辑区域）"
            extraItems={connectedMask ? [{ src: connectedMask, badge: '连线' }] : []}
            bottomActions
          />
        </UploadSection>
      </div>

      <CountAndConcurrency
        count={params.count ?? 1}
        concurrency={params.concurrency ?? 1}
        onChange={(patch) => set(patch)}
      />

      {running ? (
        <button
          type="button"
          onClick={() => onCancelProcess?.(id)}
          className="w-full rounded-md border border-destructive bg-background px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
        >
          取消生成
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={allInputImages.length === 0 || !((params.pickedPrompt || '').trim() || editPromptToText(prompt))}
            onClick={handleRun}
            className="min-w-0 flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            编辑图片
          </button>
          <WorkflowExecutionButton execution={status === 'done' ? data?.workflowExecution : null} />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

      <MaskPaintDialog
        open={!!maskPaintSource}
        inputImages={maskPaintSource ? [maskPaintSource] : []}
        initialData={data?.editMaskPaintData || null}
        exportMode="alpha-mask"
        onDataChange={setMaskPaintData}
        onSave={setMaskImage}
        onClose={() => setMaskPaintSource('')}
      />
    </NodeShell>
  );
}

function MiniSelect({ label, value, options, rawOptions, onChange }) {
  const opts = options || (rawOptions || []).map((o) => ({ value: o, label: o }));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
