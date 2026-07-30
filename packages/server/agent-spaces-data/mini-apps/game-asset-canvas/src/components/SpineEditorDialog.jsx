import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Bone, Button, Camera, CircleStop, Dialog, DialogContent,
  DialogFooter, DialogHeader, DialogTitle, Download, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger, Loader, Maximize2, MoreVertical, Play, Redo2,
  Save, ScrollText, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsContent, TabsList, TabsTrigger, Undo2, Video,
} from '@agent-spaces/ui';
import ReskinPanel, { ReskinLogsPanel, reskinStepLabel } from './ReskinPanel';
import MaskPaintDialog from './MaskPaintDialog';
import useSettings from '../hooks/useSettings';
import { SpineEditorApp } from '../spine/core/SpineEditorApp';
import { RecordManager } from '../spine/core/RecordManager';
import { PoseExporter } from '../spine/exporters/PoseExporter';
import { SpineJsonExporter } from '../spine/exporters/SpineJsonExporter';
import {
  BoneVisibility, getAnimations, getSkins, loadSpine,
} from '../spine/loaders/SpineLoader';
import { getJSZip, loadSpineRuntime } from '../spine/runtime';
import {
  SpineAssetLibrary, SpineBoneTree, SpineTransformPanel,
} from '../spine/components/SpinePanels';
import { getSpineAssetsSignature } from '../utils/reskin/reskinEditorData';
import { repaintRegionMask } from '../utils/reskin/maskRepaint';

const PLAYBACK_SPEEDS = ['0.25', '0.5', '1', '1.5', '2'];

export default function SpineEditorDialog({
  open, assets, onSave, onPoseExport, onExportVideo, onReskinComplete,
  initialReskinData, onReskinDataChange, onClose,
}) {
  const { settings: canvasSettings } = useSettings();
  const editorRef = useRef(null);
  const recorderRef = useRef(null);
  const visibilityRef = useRef(null);
  const loadedRawRef = useRef(null);
  const pendingAssetsRef = useRef(null);
  const initialReskinDataRef = useRef(initialReskinData);
  initialReskinDataRef.current = initialReskinData;
  const recordingGizmoVisibleRef = useRef(true);
  const callbacksRef = useRef({ onSave, onPoseExport, onExportVideo, onReskinComplete });
  callbacksRef.current = { onSave, onPoseExport, onExportVideo, onReskinComplete };
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const assetsSignature = getSpineAssetsSignature(assets);

  const [canvasElement, setCanvasElement] = useState(null); // 实为承载 canvas 的容器 div
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('正在加载本地 Spine 运行时');
  const [error, setError] = useState('');
  const [spine, setSpine] = useState(null);
  const [currentAssets, setCurrentAssets] = useState(
    assets || initialReskinData?.assets || null,
  );
  const [animations, setAnimations] = useState([]);
  const [skins, setSkins] = useState([]);
  const [mode, setMode] = useState('pose');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [animation, setAnimation] = useState('');
  const [skin, setSkin] = useState('');
  const [selectedBone, setSelectedBone] = useState(null);
  const [modified, setModified] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordPreview, setRecordPreview] = useState(null);
  const [revision, setRevision] = useState(0);
  const [rightTab, setRightTab] = useState('transform');
  const [reskinLogs, setReskinLogs] = useState([]);
  const [maskPaintRequest, setMaskPaintRequest] = useState(null);
  const [maskPaintData, setMaskPaintData] = useState(null);
  const [applyingMask, setApplyingMask] = useState(false);

  const touchRevision = useCallback(() => setRevision((value) => value + 1), []);
  const handleCanvasRef = useCallback((element) => {
    // element 是承载 PIXI canvas 的容器 div（PIXI 自建 canvas 并 append 进去）
    setCanvasElement(element);
    console.debug('[SpineEditor] canvas container', element ? 'attached' : 'detached');
  }, []);

  const urlToDataUrl = useCallback(async (url) => {
    if (!url) throw new Error('Spine 资源 URL 为空');
    if (url.startsWith('data:')) return url;
    const AS = window.AgentSpaces;
    const requestUrl = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
    const response = await fetch(requestUrl);
    if (!response.ok) throw new Error(`资源加载失败 (${response.status}): ${url}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('资源转 data URL 失败'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const loadAssets = useCallback(async (source) => {
    if (!source?.skel || !source?.atlas || !source?.png) {
      setError('Spine 资源不完整：需要 .skel/.json、.atlas 和贴图');
      setStatus('加载失败');
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      pendingAssetsRef.current = source;
      console.debug('[SpineEditor] queued assets until editor is ready:', source.name || 'Spine');
      setStatus(`编辑器初始化完成后加载 ${source.name || 'Spine'}...`);
      return;
    }
    pendingAssetsRef.current = null;
    setLoading(true);
    setError('');
    setStatus(`正在加载 ${source.name || 'Spine'}...`);
    try {
      const [skelDataUrl, atlasDataUrl, pngDataUrl] = await Promise.all([
        urlToDataUrl(source.skel),
        urlToDataUrl(source.atlas),
        urlToDataUrl(source.png),
      ]);
      const loaded = await loadSpine({
        skel: skelDataUrl,
        atlas: atlasDataUrl,
        png: pngDataUrl,
        name: source.name || 'spine',
      });
      editor.setSpine(loaded);
      visibilityRef.current?.reset(loaded);
      const nextAnimations = getAnimations(loaded);
      const nextSkins = getSkins(loaded);
      const nextAnimation = editor.currentAnimation || nextAnimations[0] || '';
      const nextSkin = nextSkins[0] || '';
      if (nextSkin) editor.setSkin(nextSkin);
      loadedRawRef.current = {
        name: source.name || 'spine',
        skelDataUrl,
        atlasDataUrl,
        pngDataUrl,
      };
      setSpine(loaded);
      setCurrentAssets(source);
      setAnimations(nextAnimations);
      setSkins(nextSkins);
      setAnimation(nextAnimation);
      setSkin(nextSkin);
      setSelectedBone(null);
      setModified(false);
      setStatus(`已加载 ${loaded.name} · Spine ${loaded._spineVersion}`);
      touchRevision();
    } catch (err) {
      console.error('[SpineEditor] load failed:', err);
      setError(err?.message || String(err));
      setStatus('加载失败');
    } finally {
      setLoading(false);
    }
  }, [touchRevision, urlToDataUrl]);

  useEffect(() => {
    if (!open || !canvasElement) return undefined;
    let disposed = false;
    let editor = null;

    const initialize = async () => {
      console.debug('[SpineEditor] initializing runtime');
      setReady(false);
      setError('');
      setStatus('正在加载本地 Spine 运行时');
      try {
        await loadSpineRuntime();
        if (disposed) return;
        editor = new SpineEditorApp(canvasElement);
        await editor.init();
        if (disposed) {
          editor.destroy();
          return;
        }
        editorRef.current = editor;
        visibilityRef.current = new BoneVisibility();
        recorderRef.current = new RecordManager(editor.canvasElement);
        editor.setCallbacks({
          onSelect: (boneValue) => {
            setSelectedBone(boneValue);
            touchRevision();
          },
          onLiveTransform: (boneValue) => {
            setSelectedBone(boneValue);
            touchRevision();
          },
          onModified: setModified,
        });
        console.debug('[SpineEditor] editor ready');
        setReady(true);
        setStatus('编辑器已就绪');
        const initialAssets = pendingAssetsRef.current || assetsRef.current || initialReskinDataRef.current?.assets;
        if (initialAssets) console.debug('[SpineEditor] loading initial assets:', initialAssets.name || 'Spine');
        if (initialAssets) await loadAssets(initialAssets);
      } catch (err) {
        console.error('[SpineEditor] init failed:', err);
        setError(err?.message || String(err));
        setStatus('编辑器初始化失败');
      }
    };

    initialize();
    return () => {
      disposed = true;
      if (recorderRef.current?.isRecording) recorderRef.current.stop().catch(() => {});
      recorderRef.current = null;
      visibilityRef.current = null;
      editorRef.current = null;
      editor?.destroy();
    };
  }, [open, assetsSignature, canvasElement, loadAssets, touchRevision]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      const target = event.target;
      const editing = target?.matches?.('input, textarea, select, [contenteditable="true"]');
      if (editing || !(event.ctrlKey || event.metaKey)) return;
      const editor = editorRef.current;
      if (!editor?.spine) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        editor.undo();
        touchRevision();
      } else if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
        event.preventDefault();
        editor.redo();
        touchRevision();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, touchRevision]);

  const handleMode = (value) => {
    setMode(value);
    editorRef.current?.setMode(value);
  };

  const handleAnimation = (value) => {
    setAnimation(value);
    editorRef.current?.setAnimation(value);
  };

  const handlePlaybackSpeed = (value) => {
    const speed = Number(value);
    setPlaybackSpeed(speed);
    editorRef.current?.setPlaybackSpeed(speed);
  };

  const handleSkin = (value) => {
    setSkin(value);
    editorRef.current?.setSkin(value);
  };

  const requestSnapshot = useCallback(async () => editorRef.current?.exportScreenshot() || null, []);
  const requestSpineJson = useCallback(async () => SpineJsonExporter.export(editorRef.current?.spine), []);
  const replaceAtlas = useCallback(async (pngDataUrl, name) => {
    await editorRef.current?.replaceAtlasTexture(pngDataUrl);
    setStatus(`已应用皮肤 ${name || ''}`);
  }, []);

  const openMaskPaint = useCallback((log, image) => {
    setMaskPaintData(null);
    setMaskPaintRequest({ log, image });
  }, []);

  const applyPaintedMask = useCallback(async (urls) => {
    const maskUrl = urls?.[0];
    const log = maskPaintRequest?.log;
    const context = log?.data?.editContext;
    const inputImage = log?.data?.imageFlow?.inputs?.find((image) => !String(image?.label).includes('蒙版'));
    if (!maskUrl || !context || !inputImage?.src) throw new Error('部件蒙版重绘上下文不完整');
    setApplyingMask(true);
    try {
      const result = await repaintRegionMask({
        inputSrc: inputImage.src,
        maskSrc: maskUrl,
        previewAtlasCanvas: context.previewAtlasCanvas,
        region: context.region,
      });
      const outputUrl = result.partCanvas.toDataURL('image/png');
      const previewUrl = result.previewAtlasCanvas.toDataURL('image/png');
      await replaceAtlas(previewUrl, log.data?.skinName || '蒙版重绘');
      if (context.spineAssets) {
        await callbacksRef.current.onReskinComplete?.({
          ...context.spineAssets,
          png: previewUrl,
        });
      }
      setReskinLogs((current) => current.map((entry) => {
        if (entry.data?.editContext?.runId !== context.runId) return entry;
        const nextContext = {
          ...entry.data.editContext,
          previewAtlasCanvas: result.previewAtlasCanvas,
        };
        if (entry.data?.regionName !== log.data?.regionName) {
          return { ...entry, data: { ...entry.data, editContext: nextContext } };
        }
        const inputs = (entry.data?.imageFlow?.inputs || []).map((image) => (
          String(image?.label).includes('蒙版') ? { ...image, src: maskUrl } : image
        ));
        return {
          ...entry,
          msg: `已重绘并应用部件蒙版：${entry.data?.regionName || ''}`,
          ts: Date.now(),
          data: {
            ...entry.data,
            editContext: nextContext,
            imageFlow: {
              ...entry.data.imageFlow,
              inputs,
              outputs: [{ label: '输出', src: outputUrl }],
            },
          },
        };
      }));
      setMaskPaintRequest(null);
      setMaskPaintData(null);
    } finally {
      setApplyingMask(false);
    }
  }, [maskPaintRequest, replaceAtlas]);

  const uploadDataUrl = useCallback(async (dataUrl, fileName, fallbackType) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: blob.type || fallbackType });
    const uploaded = await AS.uploadFile(file);
    return uploaded?.url || uploaded?.httpPath;
  }, []);

  const exportScreenshot = async () => {
    const dataUrl = editorRef.current?.exportScreenshot();
    if (!dataUrl) return;
    setLoading(true);
    try {
      const fileName = `${editorRef.current?.spine?.name || 'spine'}-${Date.now()}.png`;
      const url = await uploadDataUrl(dataUrl, fileName, 'image/png');
      if (url) callbacksRef.current.onSave?.([url]);
      setStatus(`已导出截图 ${fileName}`);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const exportPose = () => {
    const value = PoseExporter.toJson(editorRef.current?.spine);
    if (!value) return;
    callbacksRef.current.onPoseExport?.(value);
    setStatus('已导出姿势 JSON');
  };

  const toggleRecord = async () => {
    const recorder = recorderRef.current;
    const editor = editorRef.current;
    if (!recorder || !editor?.spine) return;
    try {
      if (!recorder.isRecording) {
        setRecordPreview(null);
        handleMode('play');
        editor.fitView();
        editor.setViewInteractionEnabled(false);
        recordingGizmoVisibleRef.current = editor.gizmo?.visible !== false;
        editor.gizmo?.setVisible(false);
        editor.app?.render();
        recorder.start({ fps: 30, crop: editor.getRecordingBounds() });
        setRecording(true);
        setStatus('录制中');
        return;
      }
      setLoading(true);
      const dataUrl = await recorder.stop();
      editor.setViewInteractionEnabled(true);
      editor.gizmo?.setVisible(recordingGizmoVisibleRef.current);
      setRecording(false);
      if (!dataUrl) throw new Error('录制结果为空');
      const fileName = `${editor.spine.name || 'spine'}-${Date.now()}.webm`;
      setRecordPreview({ dataUrl, fileName });
      setStatus(`录制完成 ${fileName}`);
    } catch (err) {
      editor.setViewInteractionEnabled(true);
      editor.gizmo?.setVisible(recordingGizmoVisibleRef.current);
      setError(err?.message || String(err));
      setRecording(false);
    } finally {
      setLoading(false);
    }
  };

  const exportRecordingToCanvas = async () => {
    if (!recordPreview) return;
    setLoading(true);
    try {
      const url = await uploadDataUrl(recordPreview.dataUrl, recordPreview.fileName, 'video/webm');
      if (!url) throw new Error('视频上传失败');
      callbacksRef.current.onExportVideo?.(url);
      setStatus(`已导出视频 ${recordPreview.fileName}`);
      setRecordPreview(null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadRecording = async () => {
    if (!recordPreview) return;
    try {
      const blob = await (await fetch(recordPreview.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = recordPreview.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`已下载 ${recordPreview.fileName}`);
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const downloadSpine = async () => {
    const raw = loadedRawRef.current;
    if (!raw) return;
    setLoading(true);
    try {
      const JSZip = await getJSZip();
      const zip = new JSZip();
      for (const [suffix, dataUrl] of [
        ['skel', raw.skelDataUrl],
        ['atlas', raw.atlasDataUrl],
        ['png', raw.pngDataUrl],
      ]) {
        const blob = await (await fetch(dataUrl)).blob();
        zip.file(`${raw.name}.${suffix}`, blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${raw.name}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`已下载 ${raw.name}.zip`);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const editor = editorRef.current;
  const canUndo = !!(editor?.spine && editor.canUndo());
  const canRedo = !!(editor?.spine && editor.canRedo());

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: '96vw', maxWidth: '96vw', height: '94vh', maxHeight: '94vh' }}
      >
        <DialogHeader className="border-b border-border px-4 py-3 pr-14">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Bone className="h-5 w-5 shrink-0" />
              <DialogTitle className="truncate">骨骼编辑器</DialogTitle>
              <Badge variant={modified ? 'outline' : 'secondary'}>{modified ? '已修改' : ready ? '就绪' : '加载中'}</Badge>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <Tabs value={mode} onValueChange={handleMode}>
                <TabsList>
                  <TabsTrigger value="pose" disabled={!spine}>姿势</TabsTrigger>
                  <TabsTrigger value="play" disabled={!spine}><Play className="h-3.5 w-3.5" />播放</TabsTrigger>
                </TabsList>
              </Tabs>
              <CompactSelect value={animation} onValueChange={handleAnimation} options={animations} placeholder="动画" disabled={!spine || mode !== 'play'} />
              <CompactSelect
                value={String(playbackSpeed)}
                onValueChange={handlePlaybackSpeed}
                options={PLAYBACK_SPEEDS}
                placeholder="速度"
                disabled={!spine || mode !== 'play'}
                formatOption={(value) => `${value}x`}
              />
              <CompactSelect value={skin} onValueChange={handleSkin} options={skins} placeholder="皮肤" disabled={!spine} />
              <Button type="button" variant="ghost" size="icon-sm" title="撤销" disabled={!canUndo} onClick={() => { editor?.undo(); touchRevision(); }}><Undo2 className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" title="重做" disabled={!canRedo} onClick={() => { editor?.redo(); touchRevision(); }}><Redo2 className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" title="适应视图" disabled={!spine || recording} onClick={() => editor?.fitView()}><Maximize2 className="h-4 w-4" /></Button>
              <Button type="button" variant={recording ? 'destructive' : 'ghost'} size="icon-sm" title={recording ? '停止录制' : '录制'} disabled={!spine || !RecordManager.isSupported()} onClick={toggleRecord}>
                {recording ? <CircleStop className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="导出 / 下载"
                      disabled={!spine && !loadedRawRef.current}
                    />
                  }
                >
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportPose} disabled={!spine}>
                    <Save className="h-4 w-4" /> 导出姿势
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportScreenshot} disabled={!spine || loading}>
                    <Camera className="h-4 w-4" /> 导出截图
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadSpine} disabled={!loadedRawRef.current || loading}>
                    <Download className="h-4 w-4" /> 下载 Spine
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {loading ? <Loader className="h-3.5 w-3.5" /> : null}
            <span className="truncate">{status}</span>
          </div>
        </DialogHeader>

        {error ? <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">{error}</div> : null}

        <div className="flex min-h-0 flex-1">
          <Tabs defaultValue="library" className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
            <TabsList className="w-full rounded-none border-b border-border">
              <TabsTrigger value="library" className="flex-1">角色库</TabsTrigger>
              <TabsTrigger value="bones" className="flex-1">骨骼</TabsTrigger>
            </TabsList>
            <TabsContent value="library" className="mt-0 min-h-0 flex-1">
              <SpineAssetLibrary disabled={loading} onSelect={loadAssets} />
            </TabsContent>
            <TabsContent value="bones" className="mt-0 min-h-0 flex-1">
              <SpineBoneTree
                spine={spine}
                visibility={visibilityRef.current}
                selectedBone={selectedBone}
                onSelect={(boneValue) => {
                  editor?.gizmo.selectBone(boneValue);
                  setSelectedBone(boneValue);
                  touchRevision();
                }}
                onVisibilityChange={() => editor?.gizmo.redraw()}
              />
            </TabsContent>
          </Tabs>

          <div className="relative min-w-0 flex-1 bg-muted">
            <div ref={handleCanvasRef} className="block h-full w-full" />
            {!spine && ready && !loading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                从左侧选择角色或在节点中上传 Spine 三件套
              </div>
            ) : null}
          </div>

          <Tabs
            value={rightTab}
            onValueChange={setRightTab}
            className={`flex shrink-0 flex-col border-l border-border bg-background ${rightTab === 'logs' ? 'w-[min(58vw,760px)]' : 'w-72'}`}
          >
            <TabsList className="w-full rounded-none border-b border-border">
              <TabsTrigger value="transform" className="flex-1">变换</TabsTrigger>
              <TabsTrigger value="reskin" className="flex-1">换肤</TabsTrigger>
              <TabsTrigger value="logs" className="flex-1">
                <ScrollText className="h-3.5 w-3.5" />日志
                {reskinLogs.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{reskinLogs.length}</Badge>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="transform" className="mt-0 min-h-0 flex-1">
              <SpineTransformPanel bone={selectedBone} editor={editor} revision={revision} onChanged={touchRevision} />
            </TabsContent>
            <TabsContent forceMount value="reskin" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
              <ReskinPanel
                assets={currentAssets}
                workflowId={canvasSettings.editImageWorkflowId}
                editImageModels={canvasSettings.editImageModels}
                replaceAtlas={replaceAtlas}
                requestSnapshot={requestSnapshot}
                requestSpineJson={requestSpineJson}
                onReskinComplete={(value) => callbacksRef.current.onReskinComplete?.(value)}
                initialData={initialReskinData}
                onDataChange={onReskinDataChange}
                logs={reskinLogs}
                setLogs={setReskinLogs}
              />
            </TabsContent>
            <TabsContent value="logs" className="mt-0 min-h-0 flex-1">
              <ReskinLogsPanel
                logs={reskinLogs}
                onClear={() => setReskinLogs([])}
                onRepaintMask={openMaskPaint}
                applyingMask={applyingMask}
                stepLabel={reskinStepLabel}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
      <RecordingPreviewDialog
        preview={recordPreview}
        exporting={loading}
        onExport={exportRecordingToCanvas}
        onDownload={downloadRecording}
        onClose={() => setRecordPreview(null)}
      />
      <MaskPaintDialog
        open={!!maskPaintRequest}
        mode="binary-mask"
        inputImages={maskPaintRequest?.image?.src ? [maskPaintRequest.image.src] : []}
        initialData={maskPaintData}
        onDataChange={setMaskPaintData}
        onSave={applyPaintedMask}
        onClose={() => {
          if (applyingMask) return;
          setMaskPaintRequest(null);
          setMaskPaintData(null);
        }}
      />
    </Dialog>
  );
}

function RecordingPreviewDialog({ preview, exporting, onExport, onDownload, onClose }) {
  return (
    <Dialog open={!!preview} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: 'calc(100vw - 2rem)', maxWidth: '860px', maxHeight: '82vh' }}
      >
        <DialogHeader className="border-b border-border px-4 py-3 pr-10">
          <DialogTitle className="text-sm">录制预览</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted p-4">
          {preview ? (
            <video
              key={preview.fileName}
              src={preview.dataUrl}
              controls
              autoPlay
              className="max-h-[62vh] max-w-full rounded border border-border bg-background"
            />
          ) : null}
        </div>
        <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" onClick={onExport} disabled={!preview || exporting}>
            {exporting ? <Loader className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            导出到画布
          </Button>
          <Button type="button" variant="outline" onClick={onDownload} disabled={!preview || exporting}>
            <Download className="h-4 w-4" />
            下载视频
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactSelect({ value, onValueChange, options, placeholder, disabled, formatOption = (option) => option }) {
  return (
    <Select value={value || null} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger size="sm" className="max-w-36">
        <SelectValue>{value ? formatOption(value) : placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option} value={option}>{formatOption(option)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
