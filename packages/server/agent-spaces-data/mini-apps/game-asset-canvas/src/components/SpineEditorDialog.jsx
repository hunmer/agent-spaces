import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Bone, Button, Camera, CircleStop, Dialog, DialogContent,
  DialogHeader, DialogTitle, Download, Loader, Maximize2, Play, Redo2,
  Save, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsContent, TabsList, TabsTrigger, Undo2, Video,
} from '@agent-spaces/ui';
import ReskinPanel from './ReskinPanel';
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

export default function SpineEditorDialog({
  open, assets, onSave, onPoseExport, onExportVideo, onReskinComplete, onClose,
}) {
  const canvasRef = useRef(null);
  const editorRef = useRef(null);
  const recorderRef = useRef(null);
  const visibilityRef = useRef(null);
  const loadedRawRef = useRef(null);
  const callbacksRef = useRef({ onSave, onPoseExport, onExportVideo, onReskinComplete });
  callbacksRef.current = { onSave, onPoseExport, onExportVideo, onReskinComplete };

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('正在加载本地 Spine 运行时');
  const [error, setError] = useState('');
  const [spine, setSpine] = useState(null);
  const [currentAssets, setCurrentAssets] = useState(assets || null);
  const [animations, setAnimations] = useState([]);
  const [skins, setSkins] = useState([]);
  const [mode, setMode] = useState('pose');
  const [animation, setAnimation] = useState('');
  const [skin, setSkin] = useState('');
  const [selectedBone, setSelectedBone] = useState(null);
  const [modified, setModified] = useState(false);
  const [recording, setRecording] = useState(false);
  const [revision, setRevision] = useState(0);

  const touchRevision = useCallback(() => setRevision((value) => value + 1), []);

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
    const editor = editorRef.current;
    if (!editor || !source?.skel || !source?.atlas || !source?.png) return;
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
    if (!open || !canvasRef.current) return undefined;
    let disposed = false;
    let editor = null;

    const initialize = async () => {
      setReady(false);
      setError('');
      setStatus('正在加载本地 Spine 运行时');
      try {
        await loadSpineRuntime();
        if (disposed || !canvasRef.current) return;
        editor = new SpineEditorApp(canvasRef.current);
        await editor.init();
        if (disposed) {
          editor.destroy();
          return;
        }
        editorRef.current = editor;
        visibilityRef.current = new BoneVisibility();
        recorderRef.current = new RecordManager(canvasRef.current);
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
        setReady(true);
        setStatus('编辑器已就绪');
        if (assets) await loadAssets(assets);
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
  }, [open, assets, loadAssets, touchRevision]);

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
        handleMode('play');
        recorder.start({ fps: 30 });
        setRecording(true);
        setStatus('录制中');
        return;
      }
      setLoading(true);
      const dataUrl = await recorder.stop();
      setRecording(false);
      if (!dataUrl) throw new Error('录制结果为空');
      const fileName = `${editor.spine.name || 'spine'}-${Date.now()}.webm`;
      const url = await uploadDataUrl(dataUrl, fileName, 'video/webm');
      if (url) callbacksRef.current.onExportVideo?.(url);
      setStatus(`已导出视频 ${fileName}`);
    } catch (err) {
      setError(err?.message || String(err));
      setRecording(false);
    } finally {
      setLoading(false);
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
        <DialogHeader className="border-b border-border px-4 py-3">
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
              <CompactSelect value={skin} onValueChange={handleSkin} options={skins} placeholder="皮肤" disabled={!spine} />
              <Button type="button" variant="ghost" size="icon-sm" title="撤销" disabled={!canUndo} onClick={() => { editor?.undo(); touchRevision(); }}><Undo2 className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" title="重做" disabled={!canRedo} onClick={() => { editor?.redo(); touchRevision(); }}><Redo2 className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" title="适应视图" disabled={!spine} onClick={() => editor?.fitView()}><Maximize2 className="h-4 w-4" /></Button>
              <Button type="button" variant={recording ? 'destructive' : 'ghost'} size="icon-sm" title={recording ? '停止录制' : '录制'} disabled={!spine || !RecordManager.isSupported()} onClick={toggleRecord}>
                {recording ? <CircleStop className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" title="导出姿势" disabled={!spine} onClick={exportPose}><Save className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" title="导出截图" disabled={!spine || loading} onClick={exportScreenshot}><Camera className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" title="下载 Spine" disabled={!loadedRawRef.current || loading} onClick={downloadSpine}><Download className="h-4 w-4" /></Button>
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
            <canvas ref={canvasRef} className="block h-full w-full" />
            {!spine && ready && !loading ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                从左侧选择角色或在节点中上传 Spine 三件套
              </div>
            ) : null}
          </div>

          <Tabs defaultValue="transform" className="flex w-72 shrink-0 flex-col border-l border-border bg-background">
            <TabsList className="w-full rounded-none border-b border-border">
              <TabsTrigger value="transform" className="flex-1">变换</TabsTrigger>
              <TabsTrigger value="reskin" className="flex-1">换肤</TabsTrigger>
            </TabsList>
            <TabsContent value="transform" className="mt-0 min-h-0 flex-1">
              <SpineTransformPanel bone={selectedBone} editor={editor} revision={revision} onChanged={touchRevision} />
            </TabsContent>
            <TabsContent value="reskin" className="mt-0 min-h-0 flex-1">
              <ReskinPanel
                assets={currentAssets}
                replaceAtlas={replaceAtlas}
                requestSnapshot={requestSnapshot}
                requestSpineJson={requestSpineJson}
                onReskinComplete={(value) => callbacksRef.current.onReskinComplete?.(value)}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompactSelect({ value, onValueChange, options, placeholder, disabled }) {
  return (
    <Select value={value || null} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger size="sm" className="max-w-36">
        <SelectValue>{value || placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
