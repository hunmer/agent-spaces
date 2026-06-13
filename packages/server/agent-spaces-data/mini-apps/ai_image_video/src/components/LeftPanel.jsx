import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MODES,
  PROVIDERS,
  SIZE_OPTIONS,
  RESOLUTION_OPTIONS,
  DURATION_OPTIONS,
  QUALITY_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  getAvailableProviders,
  getModelOptions,
  getDefaultModel,
} from '../utils/providers';
import useUI from '../hooks/useUI';

const IMAGE_ACCEPT = { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] };
const VIDEO_ACCEPT = { 'video/*': ['.mp4', '.mov', '.webm'] };
const AUDIO_ACCEPT = { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac'] };
const OUTPAINT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function resolveFile(item) {
  const file = item?.file;
  if (!file) return null;
  if (file.uploadError) throw new Error(file.uploadError);
  if (file.uploadPromise) {
    const uploaded = await file.uploadPromise;
    applyUploadedFile(file, uploaded);
  }
  if (!getLocalPath(file) && file instanceof File) {
    const uploaded = await window.AgentSpacesUI.uploadFile(file);
    applyUploadedFile(file, uploaded);
  }
  return file;
}

async function resolveFileUrl(item) {
  const file = await resolveFile(item);
  if (!file) return '';
  if (file.uploadedHttpPath || file.uploadedUrl || file.httpPath || file.url) {
    return file.uploadedHttpPath || file.uploadedUrl || file.httpPath || file.url;
  }
  return fileToDataUrl(file);
}

async function resolveFilePath(item) {
  const file = await resolveFile(item);
  return getLocalPath(file);
}

function applyUploadedFile(file, uploaded) {
  Object.assign(file, {
    uploadedPath: uploaded.path,
    uploadedUrl: uploaded.url,
    uploadedHttpPath: uploaded.httpPath,
    uploading: false,
    uploadError: undefined,
    uploadPromise: Promise.resolve(uploaded),
  });
}

function getLocalPath(file) {
  const path = file?.uploadedPath || file?.path || '';
  return isAbsoluteLocalPath(path) ? path : '';
}

function isAbsoluteLocalPath(path) {
  return /^[A-Za-z]:[\\/]/.test(path || '') || String(path || '').startsWith('/');
}

function numberOrEmpty(value) {
  if (value === '' || value == null) return '';
  const next = Number(value);
  return Number.isFinite(next) ? next : '';
}

const IMAGE_INPUT_MODES = new Set(['image_to_image', 'image_edit', 'image_to_video', 'image_outpainting']);
const VIDEO_INPUT_MODES = new Set(['video_editing', 'video_retalk']);

/** 构造远程 URL 的 FileUpload value（图片/视频）。提交时直接当公网 URL 用，不触发本地落盘或云存储转存。 */
function makeRemoteFile(url, kind, name) {
  return [
    {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: { name, size: 0, type: kind === 'image' ? 'image/png' : 'video/mp4', url, httpPath: url },
    },
  ];
}

export default function LeftPanel({ onGenerate, taskQueue, error, preset, onReady }) {
  const UI = useUI();
  const [mode, setMode] = useState('text_to_image');
  const [provider, setProvider] = useState('jimeng');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [referenceImages, setReferenceImages] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);
  const [audioFiles, setAudioFiles] = useState([]);
  const [ratio, setRatio] = useState('');
  const [size, setSize] = useState('');
  const [resolution, setResolution] = useState('2k');
  const [duration, setDuration] = useState(5);
  const [sampleStrength, setSampleStrength] = useState(0.7);
  const [n, setN] = useState(1);
  const [quality, setQuality] = useState('auto');
  const [outputFormat, setOutputFormat] = useState('png');
  const [model, setModel] = useState('');
  const [expandMode, setExpandMode] = useState('ratio');
  const [outputRatio, setOutputRatio] = useState('16:9');
  const [xScale, setXScale] = useState(1.5);
  const [yScale, setYScale] = useState(1.5);
  const [leftOffset, setLeftOffset] = useState('');
  const [rightOffset, setRightOffset] = useState('');
  const [topOffset, setTopOffset] = useState('');
  const [bottomOffset, setBottomOffset] = useState('');
  const [angle, setAngle] = useState('');
  const [submittingUpload, setSubmittingUpload] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const availableProviders = getAvailableProviders(mode);
  const modelOptions = getModelOptions(provider, mode);
  const sizeOptions = SIZE_OPTIONS[provider]?.[mode] || [];
  const resolutionOptions = RESOLUTION_OPTIONS[provider]?.[mode] || [];
  const durationOptions = DURATION_OPTIONS[provider] || [];

  const clearUploads = () => {
    setImageFiles([]);
    setReferenceImages([]);
    setVideoFiles([]);
    setAudioFiles([]);
  };

  // ====== 预设应用：支持 agent 广播的多类操作（switchMode / setForm / triggerGenerate / useAsSource） ======
  // preset.kind 缺省时走 useAsSource（向后兼容右侧卡片的二次创作入口）
  const lastPresetSeq = useRef(0);
  const submitRef = useRef(() => {});

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    clearUploads();
    const available = getAvailableProviders(newMode);
    const current = available.find((p) => p.id === provider);
    const effectiveProvider = current ? provider : (available[0]?.id || '');
    if (!current) setProvider(effectiveProvider);
    setModel(getDefaultModel(effectiveProvider, newMode));
    // 重置分辨率到当前 provider+mode 的第一个可用选项
    const resOpts = RESOLUTION_OPTIONS[effectiveProvider]?.[newMode];
    setResolution(resOpts ? resOpts[0]?.value : '');
  }, [provider]);

  const handleProviderChange = useCallback((newProviderId) => {
    setProvider(newProviderId);
    clearUploads();
    setModel(getDefaultModel(newProviderId, mode));
    const resOpts = RESOLUTION_OPTIONS[newProviderId]?.[mode];
    setResolution(resOpts ? resOpts[0]?.value : '');
  }, [mode]);

  /** 批量应用表单字段（来自 agent set_form 广播） */
  const applyFormPatch = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return;
    if (typeof patch.prompt === 'string') setPrompt(patch.prompt);
    if (typeof patch.negativePrompt === 'string') setNegativePrompt(patch.negativePrompt);
    if (typeof patch.provider === 'string') {
      const available = getAvailableProviders(mode);
      if (available.some((p) => p.id === patch.provider)) {
        setProvider(patch.provider);
        setModel(getDefaultModel(patch.provider, mode));
        const resOpts = RESOLUTION_OPTIONS[patch.provider]?.[mode];
        setResolution(resOpts ? resOpts[0]?.value : '');
      }
    }
    if (typeof patch.model === 'string') setModel(patch.model);
    if (typeof patch.size === 'string') setSize(patch.size);
    if (typeof patch.ratio === 'string') setRatio(patch.ratio);
    if (typeof patch.resolution === 'string') setResolution(patch.resolution);
    if (patch.duration != null) setDuration(Number(patch.duration));
    if (patch.sampleStrength != null) setSampleStrength(Number(patch.sampleStrength));
    if (patch.n != null) setN(Number(patch.n));
    if (typeof patch.quality === 'string') setQuality(patch.quality);
    if (typeof patch.outputFormat === 'string') setOutputFormat(patch.outputFormat);
    if (typeof patch.expandMode === 'string') setExpandMode(patch.expandMode);
    if (typeof patch.outputRatio === 'string') setOutputRatio(patch.outputRatio);
    if (patch.xScale != null) setXScale(Number(patch.xScale));
    if (patch.yScale != null) setYScale(Number(patch.yScale));
    if (patch.leftOffset != null) setLeftOffset(numberOrEmpty(patch.leftOffset));
    if (patch.rightOffset != null) setRightOffset(numberOrEmpty(patch.rightOffset));
    if (patch.topOffset != null) setTopOffset(numberOrEmpty(patch.topOffset));
    if (patch.bottomOffset != null) setBottomOffset(numberOrEmpty(patch.bottomOffset));
    if (patch.angle != null) setAngle(numberOrEmpty(patch.angle));
  }, [mode]);

  /** 切换模式（来自 agent switch_mode 广播） */
  const applySwitchMode = useCallback((targetMode) => {
    if (!MODES.some((m) => m.id === targetMode)) return;
    handleModeChange(targetMode);
  }, [handleModeChange]);

  /** 用远程 URL 源预填输入（来自 agent use_as_source 广播或右侧二次创作） */
  const applyUseAsSource = useCallback((source, targetMode) => {
    const available = getAvailableProviders(targetMode);
    const targetProvider =
      (source.provider && available.find((p) => p.id === source.provider)?.id) ||
      available[0]?.id ||
      '';
    setMode(targetMode);
    setProvider(targetProvider);
    setModel(getDefaultModel(targetProvider, targetMode));
    const resOpts = RESOLUTION_OPTIONS[targetProvider]?.[targetMode];
    setResolution(resOpts ? resOpts[0]?.value : '');
    setPrompt(source.prompt || '');

    setImageFiles([]);
    setReferenceImages([]);
    setVideoFiles([]);
    setAudioFiles([]);
    if (source.type === 'image' && IMAGE_INPUT_MODES.has(targetMode)) {
      setImageFiles(makeRemoteFile(source.url, 'image', '来源图片'));
    } else if (source.type === 'video' && VIDEO_INPUT_MODES.has(targetMode)) {
      setVideoFiles(makeRemoteFile(source.url, 'video', '来源视频'));
    }
  }, []);

  useEffect(() => {
    if (!preset || preset.seq === lastPresetSeq.current) return;
    lastPresetSeq.current = preset.seq;

    const kind = preset.kind || 'useAsSource';
    if (kind === 'switchMode') {
      applySwitchMode(preset.mode);
      return;
    }
    if (kind === 'setForm') {
      applyFormPatch(preset.patch);
      return;
    }
    if (kind === 'triggerGenerate') {
      // submitRef.current 在每次渲染同步为最新 handleGenerate，调用时拿到最新 state
      submitRef.current();
      return;
    }

    // 默认：useAsSource（兼容右侧卡片二次创作入口的旧 preset 结构）
    applyUseAsSource(preset.item, preset.mode);
  }, [preset, applySwitchMode, applyFormPatch, applyUseAsSource]);

  // ====== 暴露 imperative API 给 App（供 agent broadcast 调用） ======
  // 用 ref 持有最新的 applySwitchMode / applyFormPatch / submitRef，确保 onReady
  // 只触发一次（避免 setLeftPanelApi 频繁触发 re-render），但调用时拿到最新闭包。
  const switchModeRef = useRef(applySwitchMode);
  const applyFormPatchRef = useRef(applyFormPatch);
  switchModeRef.current = applySwitchMode;
  applyFormPatchRef.current = applyFormPatch;
  useEffect(() => {
    if (typeof onReady !== 'function') return;
    onReady({
      switchMode: (mode) => switchModeRef.current(mode),
      applyFormPatch: (patch) => applyFormPatchRef.current(patch),
      submit: () => submitRef.current(),
    });
    return () => onReady(null);
  }, [onReady]);

  if (!UI) return null;

  const {
    Button, Card, CardContent, Label,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
    Tabs, TabsList, TabsTrigger, Textarea, Slider, ScrollArea, Loader,
    Badge,
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
  } = UI;

  const handleGenerate = async () => {
    if (!provider) return;

    setSubmittingUpload(true);
    setSubmitError('');
    try {
      const primaryImageUrl = imageFiles[0] ? await resolveFileUrl(imageFiles[0]) : '';
      const imageUrls = await Promise.all(imageFiles.map(resolveFileUrl));
      const imagePaths = await Promise.all(imageFiles.map(resolveFilePath));
      const referenceImageUrls = await Promise.all(referenceImages.map(resolveFileUrl));
      const referenceImagePaths = await Promise.all(referenceImages.map(resolveFilePath));
      const videoUrl = videoFiles[0] ? await resolveFileUrl(videoFiles[0]) : '';
      const videoPath = videoFiles[0] ? await resolveFilePath(videoFiles[0]) : '';
      const audioUrl = audioFiles[0] ? await resolveFileUrl(audioFiles[0]) : '';
      const audioPath = audioFiles[0] ? await resolveFilePath(audioFiles[0]) : '';

      const formData = {
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim(),
        imageUrl: primaryImageUrl,
        imageUrls,
        imagePath: imagePaths[0] || '',
        imagePaths,
        referenceImageUrls,
        referenceImagePaths,
        videoUrl,
        videoPath,
        audioUrl,
        audioPath,
        model,
        ratio,
        size,
        resolution,
        duration,
        sampleStrength,
        n,
        quality,
        outputFormat,
        expandMode,
        outputRatio,
        xScale,
        yScale,
        leftOffset,
        rightOffset,
        topOffset,
        bottomOffset,
        angle,
      };

      onGenerate(provider, mode, formData);
    } catch (err) {
      const message = err?.message || String(err || '文件上传失败');
      setSubmitError(message);
    } finally {
      setSubmittingUpload(false);
    }
  };

  // 保持 submitRef 持有最新 handleGenerate 闭包，供 agent trigger_generate 调用
  submitRef.current = handleGenerate;

  const allFiles = [...imageFiles, ...referenceImages, ...videoFiles, ...audioFiles];
  const filesUploading = allFiles.some((item) => item.file?.uploading);
  const hasUploadError = allFiles.some((item) => item.file?.uploadError);
  const canGenerate = !submittingUpload && !filesUploading && !hasUploadError && provider && (
    (mode === 'text_to_image' && prompt.trim()) ||
    (mode === 'image_to_image' && prompt.trim() && imageFiles.length > 0) ||
    (mode === 'image_edit' && prompt.trim() && imageFiles.length > 0) ||
    (mode === 'image_to_video' && imageFiles.length > 0) ||
    (mode === 'image_outpainting' && imageFiles.length > 0) ||
    (mode === 'video_editing' && prompt.trim() && videoFiles.length > 0) ||
    (mode === 'video_retalk' && videoFiles.length > 0 && audioFiles.length > 0)
  );

  const runningTasks = taskQueue.filter(t => t.status === 'running');
  const runningCount = runningTasks.length;
  const providerName = (id) => PROVIDERS.find(p => p.id === id)?.name || id;
  const maxImageFiles = mode === 'image_to_video' || mode === 'image_outpainting'
    ? 1
    : mode === 'image_edit'
      ? (provider === 'aliyun' ? 9 : 4)
      : 4;

  return (
    <div style={styles.root}>
      <Tabs value={mode} onValueChange={handleModeChange} style={{ flexShrink: 0 }}>
        <TabsList style={styles.tabsList}>
          {MODES.map((m) => (
            <TabsTrigger key={m.id} value={m.id} style={styles.tabTrigger}>
              {m.icon} {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div>
        <Label style={styles.fieldLabel}>提供商</Label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {modelOptions.length > 0 && (
        <div>
          <Label style={styles.fieldLabel}>模型</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="默认模型" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <div style={styles.formBody}>
          {(mode === 'image_to_image' || mode === 'image_edit' || mode === 'image_to_video' || mode === 'image_outpainting') && (
            <UploadField
              UI={UI}
              label={mode === 'image_outpainting' ? '待扩展图片 *' : mode === 'image_to_video' ? '参考图片 *' : `图片（最多${maxImageFiles}张） *`}
              value={imageFiles}
              onChange={setImageFiles}
              accept={IMAGE_ACCEPT}
              maxFiles={maxImageFiles}
              maxSize={20 * 1024 * 1024}
            />
          )}

          {(mode === 'video_editing' || mode === 'video_retalk') && (
            <UploadField
              UI={UI}
              label={mode === 'video_retalk' ? '人物视频 *' : '待编辑视频 *'}
              value={videoFiles}
              onChange={setVideoFiles}
              accept={VIDEO_ACCEPT}
              maxFiles={1}
              maxSize={500 * 1024 * 1024}
            />
          )}

          {mode === 'video_retalk' && (
            <UploadField
              UI={UI}
              label="人声音频 *"
              value={audioFiles}
              onChange={setAudioFiles}
              accept={AUDIO_ACCEPT}
              maxFiles={1}
              maxSize={100 * 1024 * 1024}
            />
          )}

          {mode === 'video_editing' && (
            <UploadField
              UI={UI}
              label="参考图片（可选，最多4张）"
              value={referenceImages}
              onChange={setReferenceImages}
              accept={IMAGE_ACCEPT}
              maxFiles={4}
              maxSize={20 * 1024 * 1024}
            />
          )}

          {mode !== 'image_outpainting' && mode !== 'video_retalk' && (
            <div>
              <Label style={styles.fieldLabel}>
                {mode === 'image_to_video' ? '视频描述（可选）' : mode === 'image_edit' ? '编辑指令 *' : mode === 'video_editing' ? '编辑指令 *' : '提示词 *'}
              </Label>
              <Textarea
                className="w-full"
                className="w-full"
                placeholder={getPromptPlaceholder(mode)}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {mode !== 'image_to_video' && mode !== 'image_outpainting' && mode !== 'video_editing' && mode !== 'video_retalk' && (
            <div>
              <Label style={styles.fieldLabel}>反向提示词（可选）</Label>
              <Textarea
                className="w-full"
                placeholder="排除不想出现的内容..."
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {mode === 'image_outpainting' && (
            <OutpaintingFields
              UI={UI}
              expandMode={expandMode}
              setExpandMode={setExpandMode}
              outputRatio={outputRatio}
              setOutputRatio={setOutputRatio}
              xScale={xScale}
              setXScale={setXScale}
              yScale={yScale}
              setYScale={setYScale}
              leftOffset={leftOffset}
              setLeftOffset={setLeftOffset}
              rightOffset={rightOffset}
              setRightOffset={setRightOffset}
              topOffset={topOffset}
              setTopOffset={setTopOffset}
              bottomOffset={bottomOffset}
              setBottomOffset={setBottomOffset}
              angle={angle}
              setAngle={setAngle}
            />
          )}

          {sizeOptions.length > 0 && mode !== 'video_editing' && (
            <div>
              <Label style={styles.fieldLabel}>
                {(provider === 'aliyun' || provider === 'openai') && mode !== 'image_to_video' ? '尺寸' : '比例'}
              </Label>
              <Select
                value={(provider === 'aliyun' || provider === 'openai') && mode !== 'image_to_video' ? size : ratio}
                onValueChange={(v) => {
                  if ((provider === 'aliyun' || provider === 'openai') && mode !== 'image_to_video') setSize(v);
                  else setRatio(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="默认" />
                </SelectTrigger>
                <SelectContent>
                  {sizeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'video_editing' && (
            <div>
              <Label style={styles.fieldLabel}>分辨率</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720P">720P</SelectItem>
                  <SelectItem value="1080P">1080P</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {resolutionOptions.length > 0 && (
            <div>
              <Label style={styles.fieldLabel}>分辨率</Label>
              <Select value={resolution || resolutionOptions[0]?.value} onValueChange={setResolution}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resolutionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(mode === 'image_to_video' || mode === 'video_editing') && durationOptions.length > 0 && (
            <div>
              <Label style={styles.fieldLabel}>{mode === 'video_editing' ? '输出时长' : '时长'}</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'image_to_image' && provider === 'jimeng' && (
            <div>
              <Label style={styles.fieldLabel}>采样强度: {sampleStrength.toFixed(2)}</Label>
              <Slider className="w-full" value={[sampleStrength]} onValueChange={([v]) => setSampleStrength(v)} min={0} max={1} step={0.05} />
            </div>
          )}

          {(mode === 'text_to_image' || mode === 'image_edit') && provider === 'aliyun' && (
            <div>
              <Label style={styles.fieldLabel}>生成数量: {n}</Label>
              <Slider className="w-full" value={[n]} onValueChange={([v]) => setN(v)} min={1} max={4} step={1} />
            </div>
          )}

          {provider === 'openai' && mode !== 'image_to_video' && (
            <div>
              <Label style={styles.fieldLabel}>生成数量: {n}</Label>
              <Slider className="w-full" value={[n]} onValueChange={([v]) => setN(v)} min={1} max={10} step={1} />
            </div>
          )}

          {provider === 'openai' && (
            <div>
              <Label style={styles.fieldLabel}>质量</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'text_to_image' && provider === 'openai' && (
            <div>
              <Label style={styles.fieldLabel}>输出格式</Label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </ScrollArea>

      {(error || submitError) && (
        <Card style={styles.errorCard}>
          <CardContent style={{ padding: '10px 14px' }}>
            <p style={styles.errorText}>{error || submitError}</p>
          </CardContent>
        </Card>
      )}

      <div style={styles.actionRow}>
        <Button onClick={handleGenerate} disabled={!canGenerate} style={{ flex: 1 }}>
          {submittingUpload || filesUploading ? '文件上传中...' : `✨ 生成${MODES.find((m) => m.id === mode)?.label || ''}`}
        </Button>

        {runningCount > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" style={styles.queueButton} title={`${runningCount} 个任务进行中`}>
                <Loader style={styles.queueLoader} />
                <span style={styles.queueBadge}>{runningCount}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ width: '280px', maxHeight: '320px' }}>
              <DropdownMenuGroup>
                <DropdownMenuLabel style={styles.queueLabel}>
                  <span>任务队列</span>
                  <Badge variant="secondary" style={{ fontSize: '11px' }}>{runningCount} 个进行中</Badge>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {taskQueue.map((task) => (
                <DropdownMenuItem
                  key={task.id}
                  style={styles.taskItem}
                  onSelect={(e) => e.preventDefault()}
                >
                  <div style={styles.taskHeader}>
                    <span style={styles.taskTitle}>
                      {task.modeLabel || task.mode} · {providerName(task.provider)}
                    </span>
                    {task.status === 'running' && <Loader style={styles.taskLoader} />}
                    {task.status === 'completed' && <span style={styles.doneText}>✓</span>}
                    {task.status === 'failed' && <span style={styles.failText}>✕</span>}
                  </div>
                  {(task.progress || task.error) && (
                    <span style={{ ...styles.taskProgress, color: task.status === 'failed' ? '#ef4444' : '#888' }}>
                      {task.status === 'failed' ? task.error : task.progress}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function UploadField({ UI, label, value, onChange, accept, maxFiles, maxSize }) {
  const { Label, FileUpload } = UI;
  return (
    <div>
      <Label style={styles.fieldLabel}>{label}</Label>
      <FileUpload
        value={value}
        onChange={onChange}
        accept={accept}
        maxFiles={maxFiles}
        maxSize={maxSize}
        autoUpload={false}
        placeholder="拖拽或点击上传文件"
      />
    </div>
  );
}

function OutpaintingFields({
  UI,
  expandMode,
  setExpandMode,
  outputRatio,
  setOutputRatio,
  xScale,
  setXScale,
  yScale,
  setYScale,
  leftOffset,
  setLeftOffset,
  rightOffset,
  setRightOffset,
  topOffset,
  setTopOffset,
  bottomOffset,
  setBottomOffset,
  angle,
  setAngle,
}) {
  const { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Input } = UI;

  return (
    <>
      <div>
        <Label style={styles.fieldLabel}>扩展方式</Label>
        <Select value={expandMode} onValueChange={setExpandMode}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ratio">按比例</SelectItem>
            <SelectItem value="scale">按缩放</SelectItem>
            <SelectItem value="offset">按像素方向</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {expandMode === 'ratio' && (
        <div>
          <Label style={styles.fieldLabel}>目标比例</Label>
          <Select value={outputRatio} onValueChange={setOutputRatio}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPAINT_RATIOS.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {expandMode === 'scale' && (
        <div style={styles.twoCol}>
          <NumberField Label={Label} Input={Input} label="水平倍率" value={xScale} onChange={setXScale} step="0.1" />
          <NumberField Label={Label} Input={Input} label="垂直倍率" value={yScale} onChange={setYScale} step="0.1" />
        </div>
      )}

      {expandMode === 'offset' && (
        <div style={styles.twoCol}>
          <NumberField Label={Label} Input={Input} label="左侧(px)" value={leftOffset} onChange={setLeftOffset} />
          <NumberField Label={Label} Input={Input} label="右侧(px)" value={rightOffset} onChange={setRightOffset} />
          <NumberField Label={Label} Input={Input} label="上方(px)" value={topOffset} onChange={setTopOffset} />
          <NumberField Label={Label} Input={Input} label="下方(px)" value={bottomOffset} onChange={setBottomOffset} />
        </div>
      )}

      <NumberField Label={Label} Input={Input} label="旋转角度（可选）" value={angle} onChange={setAngle} />
    </>
  );
}

function NumberField({ Label, Input, label, value, onChange, step = '1' }) {
  return (
    <div>
      <Label style={styles.fieldLabel}>{label}</Label>
      <Input
        className="w-full"
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(numberOrEmpty(e.target.value))}
      />
    </div>
  );
}

function getPromptPlaceholder(mode) {
  if (mode === 'text_to_image') return '描述你想生成的图片...';
  if (mode === 'image_to_image') return '描述生成方向...';
  if (mode === 'image_edit') return '描述编辑操作，如：将背景改为星空、移除图中的汽车...';
  if (mode === 'video_editing') return '描述视频编辑操作，如：转为黏土风格、替换服装...';
  return '描述视频内容...';
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '16px',
    overflow: 'hidden',
  },
  tabsList: {
    width: '100%',
    height: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '4px',
  },
  tabTrigger: {
    minWidth: 0,
    fontSize: '12px',
    padding: '6px 4px',
  },
  formBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    paddingRight: '4px',
  },
  fieldLabel: {
    marginBottom: '6px',
    display: 'block',
    fontSize: '12px',
    color: '#888',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  errorCard: {
    flexShrink: 0,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  errorText: {
    fontSize: '12px',
    color: '#dc2626',
    margin: 0,
  },
  actionRow: {
    flexShrink: 0,
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  queueButton: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  },
  queueLoader: {
    width: '18px',
    height: '18px',
    animation: 'spin 1s linear infinite',
  },
  queueBadge: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    backgroundColor: '#ef4444',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
    minWidth: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    lineHeight: 1,
  },
  queueLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '8px 12px',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
  },
  taskTitle: {
    fontSize: '12px',
    fontWeight: 500,
  },
  taskLoader: {
    width: '12px',
    height: '12px',
    animation: 'spin 1s linear infinite',
    flexShrink: 0,
  },
  taskProgress: {
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  doneText: {
    fontSize: '12px',
    color: '#22c55e',
  },
  failText: {
    fontSize: '12px',
    color: '#ef4444',
  },
};
