// 节点执行对话框：从右侧「新增节点」卡片 hover 弹出的图标按钮打开，
// 按节点类型分流表单，填好后直接执行（不创建画布节点），产出只写「生成记录」。
//
// 与 NodeFormDialog 区别：NodeFormDialog 只覆盖文生图/编辑图片且走执行队列（会建占位节点）；
// 本对话框覆盖全部可执行节点类型，调 useNodeExecutions 函数传 nodeId=null（无画布副作用）。
//
// 可执行节点类型见 EXECUTABLE_TYPES。画布交互型节点（图片编辑/像素编辑器/图片展示/便签/图片对比/
// UI拆分/雪碧图拆分）不支持对话框执行，RightPanel 不给它们显示执行按钮。
import { useEffect, useMemo, useState } from 'react';
import { FileUpload, Label } from '@agent-spaces/ui';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button,
} from '@agent-spaces/ui';
import ParamField from './nodes/ParamField';
import AutoResizeTextarea from './AutoResizeTextarea';
import {
  ASPECT_OPTIONS, CUTOUT_MODES, CUTOUT_PARAMS, DEFAULT_CUTOUT_MODE, DEFAULT_MODEL,
  DEFAULT_VIDEO_MODEL, IMAGE_PROCESSORS, NODE_META, NODE_TYPES,
  NODE_TYPE_TO_PROCESSOR, SIZE_OPTIONS, VIDEO_ASPECT_OPTIONS, VIDEO_DURATION_OPTIONS,
  VIDEO_MODEL_OPTIONS, VIDEO_QUALITY_OPTIONS, VOICE_PROVIDER_OPTIONS, WORKFLOWS,
  defaultCutoutParams, isAliyunVideoModel, modelValuesToOptions,
} from '../utils/constants';
import { normalizeImageUrls } from '../utils/workflow';

// 可执行节点分类（决定对话框渲染哪个表单分支）
const EXEC_KIND = {
  [NODE_TYPES.textToImage]: 'generate-image',
  [NODE_TYPES.editImage]: 'generate-image',
  [NODE_TYPES.promptReverse]: 'prompt-reverse',
  [NODE_TYPES.textToVoice]: 'voice',
  [NODE_TYPES.videoGenerator]: 'video',
  [NODE_TYPES.cutout]: 'cutout',
};
// 12 个 ip* 图像处理节点统一走 image-process 分支
Object.keys(NODE_TYPE_TO_PROCESSOR).forEach((nt) => { EXEC_KIND[nt] = 'image-process'; });

/**
 * @param {{ open:boolean, nodeType:string, onClose:()=>void, executions:object, settings:object }} props
 *   executions = useNodeExecutions() 返回值（handleGenerate/handleGenerateMedia/handleProcessLocal/handleCutout/handlePromptReverse）
 *   settings = useSettings() 返回值（读 promptReverse 配置等）
 */
export default function NodeExecuteDialog({ open, nodeType, onClose, executions, settings }) {
  const meta = NODE_META[nodeType] || {};
  const kind = EXEC_KIND[nodeType];
  // 模型列表：优先设置页自定义，空则回退内置（editImage 用 editImageModels）
  const modelOptions = nodeType === NODE_TYPES.editImage
    ? modelValuesToOptions(settings?.editImageModels)
    : modelValuesToOptions(settings?.textToImageModels);

  // —— 各分支表单 state（打开时按 kind 初始化）——
  const [prompt, setPrompt] = useState('');
  const [pickedPrompt, setPickedPrompt] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [aspect, setAspect] = useState('1:1');
  const [size, setSize] = useState('1k');
  const [images, setImages] = useState([]);            // editImage / promptReverse / video / cutout / image-process 输入图
  const [voiceId, setVoiceId] = useState('');
  const [provider, setProvider] = useState(VOICE_PROVIDER_OPTIONS[0]?.value || '');
  // video
  const [vAspect, setVAspect] = useState(VIDEO_ASPECT_OPTIONS[0]);
  const [vQuality, setVQuality] = useState(VIDEO_QUALITY_OPTIONS[0]);
  const [vDuration, setVDuration] = useState(VIDEO_DURATION_OPTIONS[0]);
  const [vModel, setVModel] = useState(DEFAULT_VIDEO_MODEL);
  // image-process
  const [procParams, setProcParams] = useState({});
  // cutout
  const [cutoutMode, setCutoutMode] = useState(DEFAULT_CUTOUT_MODE);
  const [cutoutParams, setCutoutParams] = useState(() => defaultCutoutParams(DEFAULT_CUTOUT_MODE));

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  // 打开时按 kind 重置
  useEffect(() => {
    if (!open) return;
    setError('');
    setRunning(false);
    setPrompt(''); setPickedPrompt(''); setImages([]);
    setModel(DEFAULT_MODEL); setAspect('1:1'); setSize('1k');
    setVoiceId(''); setProvider(VOICE_PROVIDER_OPTIONS[0]?.value || '');
    setVAspect(VIDEO_ASPECT_OPTIONS[0]); setVQuality(VIDEO_QUALITY_OPTIONS[0]);
    setVDuration(VIDEO_DURATION_OPTIONS[0]); setVModel(DEFAULT_VIDEO_MODEL);
    if (kind === 'image-process') {
      const pid = NODE_TYPE_TO_PROCESSOR[nodeType];
      const p = IMAGE_PROCESSORS.find((x) => x.id === pid);
      const init = {};
      (p?.params || []).forEach((pp) => { init[pp.key] = pp.default; });
      setProcParams(init);
    }
    if (kind === 'cutout') {
      setCutoutMode(DEFAULT_CUTOUT_MODE);
      setCutoutParams(defaultCutoutParams(DEFAULT_CUTOUT_MODE));
    }
  }, [open, nodeType, kind]);

  // image-process 处理器元信息
  const processor = useMemo(() => {
    if (kind !== 'image-process') return null;
    const pid = NODE_TYPE_TO_PROCESSOR[nodeType];
    return IMAGE_PROCESSORS.find((x) => x.id === pid) || null;
  }, [kind, nodeType]);

  // cutout 当前模式参数表
  const cutoutParamDefs = useMemo(() => CUTOUT_PARAMS[cutoutMode] || [], [cutoutMode]);

  if (!kind) return null; // 非可执行节点不应打开本对话框

  // —— 提交校验 ——
  const isEdit = nodeType === NODE_TYPES.editImage;
  const hasPrompt = prompt.trim() || pickedPrompt.trim();
  let canSubmit = true;
  if (kind === 'generate-image') canSubmit = hasPrompt && (!isEdit || images.length > 0);
  else if (kind === 'prompt-reverse') canSubmit = images.length > 0;
  else if (kind === 'voice') canSubmit = hasPrompt;
  else if (kind === 'video') canSubmit = hasPrompt && !(isAliyunVideoModel(vModel) && images.length === 0);
  else if (kind === 'cutout') canSubmit = images.length > 0;
  else if (kind === 'image-process') {
    const min = processor?.minInputs ?? (processor?.multipleIn ? 2 : 1);
    canSubmit = images.length >= min;
  }

  const handleSubmit = async () => {
    if (!canSubmit || running) return;
    setError(''); setRunning(true);
    try {
      const merged = [pickedPrompt, prompt].map((s) => s.trim()).filter(Boolean).join('\n');
      const normImages = normalizeImageUrls(images.filter(Boolean));
      // nodeId=null：不写画布节点，只写生成记录（updateNodeData 对 null 无害 no-op）
      switch (kind) {
        case 'generate-image': {
          const input = { prompt: merged, model, aspect, size };
          if (isEdit) input.images = normImages;
          await executions.handleGenerate(null, nodeType, {
            workflowId: nodeType === NODE_TYPES.textToImage ? WORKFLOWS.text_to_image : WORKFLOWS.edit_image,
            input,
          });
          break;
        }
        case 'prompt-reverse':
          await executions.handlePromptReverse(null, normImages);
          break;
        case 'voice':
          await executions.handleGenerateMedia(null, nodeType, 'audio', {
            workflowId: WORKFLOWS.text_to_voice,
            input: { prompt: merged, model: provider, ...(voiceId ? { voiceId } : {}) },
          });
          break;
        case 'video':
          await executions.handleGenerateMedia(null, nodeType, 'video', {
            workflowId: WORKFLOWS.video_generator,
            input: { prompt: merged, model: vModel, aspect: vAspect, quality: vQuality, duration: vDuration, images: normImages },
          });
          break;
        case 'cutout':
          await executions.handleCutout(null, cutoutMode, cutoutParams, normImages);
          break;
        case 'image-process':
          await executions.handleProcessLocal(null, NODE_TYPE_TO_PROCESSOR[nodeType], procParams, normImages, nodeType);
          break;
        default:
          break;
      }
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !running) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{meta.icon} {meta.label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* 需要输入图的分支：上传区 */}
          {(isEdit || kind === 'prompt-reverse' || kind === 'video' || kind === 'cutout' || kind === 'image-process') && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">输入图片</Label>
              <FileUpload
                value={images}
                onChange={setImages}
                max={0}
                placeholder="点击或拖拽图片上传"
              />
              {kind === 'image-process' && processor && (
                <span className="text-[10px] text-muted-foreground">
                  {processor.multipleIn ? `需 ≥${processor.minInputs ?? 2} 张` : '单张输入'}{processor.multipleOut ? ' · 多帧产出' : ''}
                </span>
              )}
            </div>
          )}

          {/* 文本提示词分支（生成图/编辑图/配音/视频） */}
          {['generate-image', 'voice', 'video'].includes(kind) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">提示词</Label>
              <AutoResizeTextarea
                minHeight={72}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder={isEdit ? '描述如何编辑图片…' : '描述要生成的内容…'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          )}

          {/* 生成图/编辑图：模型/比例/尺寸 */}
          {kind === 'generate-image' && (
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="模型" value={model} options={modelOptions} onChange={setModel} />
              <SelectField label="比例" rawOptions={ASPECT_OPTIONS} value={aspect} onChange={setAspect} />
              <SelectField label="尺寸" rawOptions={SIZE_OPTIONS} value={size} onChange={setSize} />
            </div>
          )}

          {/* 配音：provider + voiceId */}
          {kind === 'voice' && (
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="服务商" value={provider} options={VOICE_PROVIDER_OPTIONS} onChange={setProvider} />
              <label className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">voiceId（可选）</Label>
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  placeholder="留空用默认"
                />
              </label>
            </div>
          )}

          {/* 视频：模型/比例/质量/时长 */}
          {kind === 'video' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">模型</Label>
                <select
                  value={vModel}
                  onChange={(e) => setVModel(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                >
                  {VIDEO_MODEL_OPTIONS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <SelectField label="比例" rawOptions={VIDEO_ASPECT_OPTIONS} value={vAspect} onChange={setVAspect} />
              <SelectField label="质量" rawOptions={VIDEO_QUALITY_OPTIONS} value={vQuality} onChange={setVQuality} />
              <SelectField label="时长(秒)" rawOptions={VIDEO_DURATION_OPTIONS} value={vDuration} onChange={setVDuration} />
              {isAliyunVideoModel(vModel) && images.length === 0 && (
                <p className="col-span-2 text-[11px] text-amber-600">该模型需至少 1 张参考图（首尾帧）</p>
              )}
            </div>
          )}

          {/* 图像处理：处理器参数表 */}
          {kind === 'image-process' && processor && (processor.params || []).length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-2.5">
              <span className="text-xs font-medium text-muted-foreground">{processor.desc}</span>
              {(processor.params || []).map((p) => (
                <ParamField
                  key={p.key}
                  param={p}
                  value={procParams[p.key]}
                  onChange={(v) => setProcParams((prev) => ({ ...prev, [p.key]: v }))}
                  allParams={procParams}
                />
              ))}
            </div>
          )}

          {/* 抠图：mode + 当前模式参数表 */}
          {kind === 'cutout' && (
            <>
              <label className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">抠图模式</Label>
                <select
                  value={cutoutMode}
                  onChange={(e) => {
                    const m = e.target.value;
                    setCutoutMode(m);
                    setCutoutParams(defaultCutoutParams(m));
                  }}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                >
                  {CUTOUT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              {cutoutParamDefs.length > 0 && (
                <div className="flex flex-col gap-2 rounded-md border border-border p-2.5">
                  {cutoutParamDefs.map((p) => (
                    <ParamField
                      key={p.key}
                      param={p}
                      value={cutoutParams[p.key]}
                      onChange={(v) => setCutoutParams((prev) => ({ ...prev, [p.key]: v }))}
                      allParams={cutoutParams}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {kind === 'prompt-reverse' && settings && !settings.promptReverseAgentConfigId && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              未配置反推提示词 AI 模型，请先到「设置 → 反推提示词 AI」配置。
            </p>
          )}

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>取消</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || running}>
            {running ? '执行中…' : '执行'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({ label, value, options, rawOptions, onChange }) {
  const opts = options || (rawOptions || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <label className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
      >
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
