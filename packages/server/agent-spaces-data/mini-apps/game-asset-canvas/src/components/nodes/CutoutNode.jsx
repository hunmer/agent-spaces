import { useCallback, useState } from 'react';
import { FileUpload } from '@agent-spaces/ui';
import ImageEditorDialog from '../ImageEditorDialog';
import NodeShell from './NodeShell';
import UpstreamImageList, { orderUpstream } from './UpstreamImageList';
import ParamField from './ParamField';
import {
  CUTOUT_MODES,
  CUTOUT_PARAMS,
  DEFAULT_CUTOUT_MODE,
  NODE_TYPES,
} from '../../utils/constants';
import { defaultCutoutParams } from '../../utils/constants';
import { dedupeUrls } from '../../utils/workflow';

/**
 * 统一抠图节点：select 切换「白底/色度键/工作流/Rembg」四种模式，参数表随模式切换。
 *
 * 合并了原「白底抠图(ipWhiteKey)」「色度键抠图(ipChromaKey)」两个独立节点 + 节点 toolbar
 * 「抠图」按钮（工作流抠图）+ Rembg 插件抠图，统一为单一节点类型。
 *
 * data.params: { mode, modeParams: {...} }
 *   - mode: 'whiteKey' | 'chromaKey' | 'workflow' | 'rembg'
 *   - modeParams: 当前模式对应的参数（切换模式时重置为默认值）
 * data.uploadedImages: string[] 用户上传的图 http URL
 * data.output: { images: string[] } 抠图产出
 *
 * 执行流程：data.onCutout(id, mode, modeParams, inputImages) → Canvas.handleCutout：
 *   runCutout 分流（本地算法/工作流/rembg）→ 回填 data.output.images
 *
 * 输入来源（与 ImageProcessNode 同款，两种合并去重）：
 * 1. FileUpload 用户上传（data.uploadedImages，持久化）
 * 2. 上游连线推入（data.images，由 computeInputImages 派生）
 */
export default function CutoutNode({ id, type, data, selected }) {
  const params = data?.params || {};
  const mode = params.mode || DEFAULT_CUTOUT_MODE;
  const modeParams = params.modeParams || {};
  const uploadedImages = Array.isArray(data?.uploadedImages) ? data.uploadedImages : [];
  const rawUpstream = Array.isArray(data?.images) ? data.images : [];
  const upstreamOrder = Array.isArray(data?.upstreamOrder) ? data.upstreamOrder : [];
  const upstreamImages = orderUpstream(rawUpstream, upstreamOrder);
  const inputImages = dedupeUrls([...uploadedImages, ...upstreamImages]);
  const colorPickerImage = inputImages[0] || images[0] || '';
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const cancelled = status === 'cancelled';
  const onUpdate = data?.onUpdate;
  const onCutout = data?.onCutout;
  const onCancelProcess = data?.onCancelProcess;
  const uploading = data?.uploading;
  const [colorPicker, setColorPicker] = useState(null);

  // 当前模式的参数表（动态切换）
  const paramDefs = CUTOUT_PARAMS[mode] || [];
  const modeMeta = CUTOUT_MODES.find((m) => m.value === mode) || CUTOUT_MODES[0];

  const setModeParam = useCallback((key, value) => {
    onUpdate?.({ params: { ...params, modeParams: { ...modeParams, [key]: value } } });
  }, [onUpdate, params, modeParams]);

  // 切换模式：重置 modeParams 为新模式默认值（避免旧模式参数残留）
  const setMode = useCallback((newMode) => {
    onUpdate?.({ params: { mode: newMode, modeParams: defaultCutoutParams(newMode) } });
  }, [onUpdate]);

  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('AgentSpaces.uploadFile 不可用');
      return;
    }
    const urls = [];
    const pending = [];
    for (const item of files || []) {
      const f = item?.file;
      if (!f) continue;
      const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
      if (existing) { urls.push(existing); continue; }
      if (f instanceof File) pending.push(f);
    }
    if (pending.length) {
      onUpdate?.({ uploading: true, uploadError: undefined });
      try {
        for (const f of pending) {
          const uploaded = await AS.uploadFile(f);
          const httpUrl = uploaded?.url || uploaded?.httpPath;
          if (httpUrl) urls.push(httpUrl);
        }
      } catch (err) {
        console.error('Cutout upload failed:', err);
        onUpdate?.({ uploading: false, uploadError: err?.message || String(err) });
        return;
      }
    }
    onUpdate?.({ uploadedImages: urls, uploading: false });
  }, [onUpdate]);

  const handleRun = useCallback(() => {
    if (!inputImages.length) return;
    onCutout?.(id, mode, modeParams, inputImages);
  }, [onCutout, id, mode, modeParams, inputImages]);

  const fileUploadValue = uploadedImages.map((url, i) => ({
    id: `up-${i}-${url.slice(-12)}`,
    file: { name: `upload-${i + 1}.png`, size: 0, type: 'image/png', url, httpPath: url },
    preview: url,
  }));

  const upCount = uploadedImages.length;
  const usCount = upstreamImages.length;

  return (
    <NodeShell id={id} nodeType={type || NODE_TYPES.cutout} data={data} selected={selected} targetHandle sourceHandle>
      {/* 模式选择 */}
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">抠图模式</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
        >
          {CUTOUT_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>

      {modeMeta?.desc && (
        <p className="text-[10px] leading-snug text-muted-foreground">{modeMeta.desc}</p>
      )}

      {/* 当前模式的参数表（动态切换，支持 showWhen 条件显隐） */}
      {paramDefs.map((param) => (
        <ParamField
          key={param.key}
          param={param}
          value={modeParams[param.key] ?? param.default}
          allParams={modeParams}
          onChange={(v) => setModeParam(param.key, v)}
          onPickColor={param.colorPicker
            ? () => setColorPicker({ key: param.key, value: modeParams[param.key] || param.default })
            : undefined}
          colorPickerDisabled={!colorPickerImage}
        />
      ))}

      {/* 输入图：FileUpload 多图（所有模式都支持批量） */}
      <FileUpload
        value={fileUploadValue}
        onChange={handleFilesChange}
        accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] }}
        maxFiles={0}
        sortable
        placeholder="点击或拖入多张图（可拖拽排序）"
      />
      {uploading && <p className="text-[10px] text-primary">上传中…</p>}
      {data?.uploadError && (
        <p className="text-[10px] text-red-500">上传失败：{data.uploadError}</p>
      )}

      {upstreamImages.length > 0 && (
        <UpstreamImageList
          urls={upstreamImages}
          sortable
          onChangeOrder={(next) => onUpdate?.({ upstreamOrder: next })}
        />
      )}

      <div className="text-[11px] text-muted-foreground">
        {inputImages.length > 0
          ? `输入 ${inputImages.length} 张${upCount ? `（上传 ${upCount}` : ''}${upCount && usCount ? ' + ' : ''}${usCount ? `连线 ${usCount}` : ''}${upCount || usCount ? '）' : ''}`
          : '输入：无（上传或连线）'}
      </div>

      {running ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="flex-1 cursor-not-allowed rounded-md bg-primary/70 px-3 py-1.5 text-xs font-medium text-primary-foreground opacity-80"
          >
            处理中…
          </button>
          <button
            type="button"
            onClick={() => onCancelProcess?.(id)}
            title="取消生成"
            className="shrink-0 rounded-md border border-destructive bg-background px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
          >
            取消生成
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleRun}
          disabled={uploading || !inputImages.length}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚡ 执行抠图
        </button>
      )}

      {cancelled && (
        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">已取消</p>
      )}
      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}


      <ImageEditorDialog
        open={!!colorPicker}
        mode="colorPicker"
        imageUrl={colorPickerImage}
        initialColor={colorPicker?.value || ''}
        onColorPick={(color) => {
          if (colorPicker?.key) setModeParam(colorPicker.key, color);
          setColorPicker(null);
        }}
        onClose={() => setColorPicker(null)}
      />
    </NodeShell>
  );
}
