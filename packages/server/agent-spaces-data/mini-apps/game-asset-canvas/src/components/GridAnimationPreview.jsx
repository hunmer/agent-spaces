import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, NumberInput, ScrollArea, Loader } from '@agent-spaces/ui';
import {
  Play, Pause, Repeat, Repeat1, Download, Save, MoreVertical, FolderArchive,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@agent-spaces/ui';
import { getJSZip } from '../spine/runtime';

/**
 * 把一组帧 url 横向拼接成一张 sheet 图（各帧等高左对齐，宽度=帧宽之和）。
 * @param {string[]} frameUrls 帧的 dataURL/http URL
 * @returns {Promise<HTMLCanvasElement|null>}
 */
async function composeSheet(frameUrls) {
  const imgs = await Promise.all(frameUrls.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  })));
  const valid = imgs.filter(Boolean);
  if (!valid.length) return null;
  const height = Math.max(...valid.map((im) => im.naturalHeight || im.height));
  const width = valid.reduce((sum, im) => sum + (im.naturalWidth || im.width), 0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  for (const im of valid) {
    ctx.drawImage(im, x, 0);
    x += im.naturalWidth || im.width;
  }
  return canvas;
}

/**
 * 网格动画预览：把网格切片按行/列方向分组成多个动画，各自循环播放帧。
 *
 * 切片顺序约定（来自 UiSplitterDialog 的 gridBoxesFromGuides）：列优先，
 *   index = col * rows + row
 *
 * 方向语义（用户决策：行列独立配置，方向决定分组）：
 * - 按行（row）：每一「行」是一个动画，行内各列是帧 → 动画数 = rows，每动画帧数 = cols
 * - 按列（col）：每一「列」是一个动画，列内各行是帧 → 动画数 = cols，每动画帧数 = rows
 * - 无（none）：所有切片合成一个动画组 → 动画数 = 1，每动画帧数 = 切片总数
 *
 * @param {object} props
 * @param {Array<{name:string,url:string}>} props.previews 切片预览数组（列优先顺序）
 * @param {number} props.cols 网格列数
 * @param {number} props.rows 网格行数
 * @param {'row'|'col'|'none'} [props.initialDirection='row'] 初始分组方向
 * @param {number} [props.activeImgIdx] 当前激活图序号（仅用于显示标题）
 * @param {(urls: string[]) => void} [props.onSaveSheets] 保存为多张 sheet（上传后写节点产出）
 */
export default function GridAnimationPreview({ previews, cols, rows, initialDirection = 'row', activeImgIdx, onSaveSheets }) {
  const [direction, setDirection] = useState(initialDirection);
  // 【无】模式下的动画方向：horizontal 横向（行优先）/ vertical 竖向（列优先）
  const [noneOrder, setNoneOrder] = useState('horizontal');
  const [fps, setFps] = useState(8);
  const [loop, setLoop] = useState(true);   // true=循环, false=播放一次停在末帧
  const [globalPlaying, setGlobalPlaying] = useState(true);
  const [composing, setComposing] = useState(false);  // 合成 sheet 中

  // 按方向把扁平 previews 分组成 [[帧url...], ...]
  // 按行：group[r] = [previews[col*rows + r].url for col in 0..cols-1]
  // 按列：group[c] = [previews[c*rows + row].url for row in 0..rows-1]
  // 无：所有切片合成单个动画组
  const groups = useMemo(() => {
    const safeCols = Math.max(1, Math.round(cols) || 1);
    const safeRows = Math.max(1, Math.round(rows) || 1);
    const total = safeCols * safeRows;
    if (!previews || previews.length < total) return [];
    const result = [];
    if (direction === 'none') {
      // 所有切片合成单个动画组；noneOrder 决定帧顺序：
      // - horizontal（横向）：行优先 idx = r*cols + c（从左到右、一行接一行）
      // - vertical（竖向）：列优先 idx = c*rows + r（从上到下、一列接一列）
      const frames = [];
      if (noneOrder === 'vertical') {
        for (let c = 0; c < safeCols; c++) {
          for (let r = 0; r < safeRows; r++) {
            const idx = c * safeRows + r;
            if (previews[idx]?.url) frames.push(previews[idx].url);
          }
        }
      } else {
        for (let r = 0; r < safeRows; r++) {
          for (let c = 0; c < safeCols; c++) {
            const idx = c * safeRows + r;
            if (previews[idx]?.url) frames.push(previews[idx].url);
          }
        }
      }
      if (frames.length) result.push(frames);
      return result;
    }
    if (direction === 'row') {
      for (let r = 0; r < safeRows; r++) {
        const frames = [];
        for (let c = 0; c < safeCols; c++) {
          const idx = c * safeRows + r;
          if (previews[idx]?.url) frames.push(previews[idx].url);
        }
        if (frames.length) result.push(frames);
      }
    } else {
      for (let c = 0; c < safeCols; c++) {
        const frames = [];
        for (let r = 0; r < safeRows; r++) {
          const idx = c * safeRows + r;
          if (previews[idx]?.url) frames.push(previews[idx].url);
        }
        if (frames.length) result.push(frames);
      }
    }
    return result;
  }, [previews, cols, rows, direction, noneOrder]);

  const [selectedGroups, setSelectedGroups] = useState(
    () => new Set(groups.map((_, index) => index)),
  );

  // 分组方向或动画组数量变化后，新分组默认全部选中。
  useEffect(() => {
    setSelectedGroups(new Set(Array.from({ length: groups.length }, (_, index) => index)));
  }, [direction, groups.length]);

  const toggleGroup = (index, checked) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  // 合成选中的动画组为多张 sheet canvas（每组一张横向帧序列长图）
  const composeAllSheets = async () => {
    const sheets = [];
    for (let i = 0; i < groups.length; i++) {
      if (!selectedGroups.has(i)) continue;
      const canvas = await composeSheet(groups[i]);
      if (canvas) sheets.push({ index: i, canvas });
    }
    return sheets;
  };

  // 下载为多张 sheet：浏览器逐张下载
  const handleDownloadSheets = async () => {
    setComposing(true);
    try {
      const sheets = await composeAllSheets();
      for (const { index, canvas } of sheets) {
        const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sheet_${String(index + 1).padStart(2, '0')}_${groups[index].length}frames.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } finally {
      setComposing(false);
    }
  };

  // 保存为多张 sheet：合成 → 上传 → 回传节点
  const handleSaveSheets = async () => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) return;
    setComposing(true);
    try {
      const sheets = await composeAllSheets();
      const urls = [];
      for (const { index, canvas } of sheets) {
        const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        if (!blob) continue;
        const file = new File([blob], `sheet_${String(index + 1).padStart(2, '0')}.png`, { type: 'image/png' });
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) urls.push(httpUrl);
      }
      if (urls.length) onSaveSheets?.(urls);
    } finally {
      setComposing(false);
    }
  };

  // 把单帧 url 转成 Blob（兼容 dataURL/http URL）
  const frameUrlToBlob = async (url) => {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.blob();
  };

  // 下载为序列帧 zip：每个动画分组一个文件夹，文件夹下按索引命名图片
  const handleDownloadSequence = async () => {
    setComposing(true);
    try {
      const JSZip = await getJSZip();
      const zip = new JSZip();
      let total = 0;
      for (let i = 0; i < groups.length; i++) {
        if (!selectedGroups.has(i)) continue;
        const frames = groups[i];
        const folderName = `anim_${String(i + 1).padStart(2, '0')}`;
        const folder = zip.folder(folderName);
        for (let j = 0; j < frames.length; j++) {
          const blob = await frameUrlToBlob(frames[j]);
          if (!blob) continue;
          const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          folder.file(`${String(j).padStart(3, '0')}.${ext}`, blob);
          total++;
        }
      }
      if (!total) return;
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sequence_frames_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setComposing(false);
    }
  };

  if (!groups.length) {
    return (
      <p className="px-2 py-8 text-center text-xs text-muted-foreground">
        无切片可预览（调整行列数后自动计算）
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 控制条 */}
      <div className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">拆分方向</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="row">按行（每行一个动画）</option>
            <option value="col">按列（每列一个动画）</option>
            <option value="none">无（所有切片合成一个动画）</option>
          </select>
        </label>
        {direction === 'none' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted-foreground">动画方向</span>
            <select
              value={noneOrder}
              onChange={(e) => setNoneOrder(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="horizontal">横向（行优先）</option>
              <option value="vertical">竖向（列优先）</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">FPS {fps}</span>
          <NumberInput min={1} max={30} value={fps} onChange={(v) => setFps(v ?? 8)} className="h-8 w-20" />
        </label>
        <Button
          size="sm" variant={globalPlaying ? 'default' : 'outline'} className="h-8"
          onClick={() => setGlobalPlaying((p) => !p)}
          title={globalPlaying ? '暂停全部' : '播放全部'}
        >
          {globalPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="sm" variant="outline" className="h-8"
          onClick={() => setLoop((l) => !l)}
          title={loop ? '当前：循环播放（点击改为播放一次）' : '当前：播放一次（点击改为循环）'}
        >
          {loop ? <Repeat className="h-4 w-4" /> : <Repeat1 className="h-4 w-4" />}
        </Button>
        <span className="pb-2 text-[11px] text-muted-foreground">
          {groups.length} 个动画 · 每个 {direction === 'none' ? groups[0]?.length || 0 : direction === 'row' ? cols : rows} 帧
        </span>
      </div>

      {/* 动画网格列表 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
          {groups.map((frames, gi) => (
            <AnimCard
              key={gi}
              index={gi}
              frames={frames}
              fps={fps}
              loop={loop}
              playing={globalPlaying}
              checked={selectedGroups.has(gi)}
              onCheckedChange={(checked) => toggleGroup(gi, checked)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* 底部导出操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          已选 {selectedGroups.size}/{groups.length} 个动画
        </span>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <Button
            size="sm" className="h-8 rounded-none border-r border-border"
            disabled={composing || selectedGroups.size === 0}
            onClick={handleSaveSheets}
            title="把选中动画组合成 sheet 图并上传，写入节点产出"
          >
            {composing ? <Loader className="mr-1 h-4 w-4" /> : <Save className="mr-1 h-4 w-4" />}
            保存为多张 sheet
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="sm" variant="default" className="h-8 rounded-none px-2"
                  disabled={composing || selectedGroups.size === 0}
                  title="更多下载方式"
                />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDownloadSheets}
                disabled={composing || selectedGroups.size === 0}
              >
                <Download className="mr-2 h-4 w-4" /> 下载为多张 sheet
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDownloadSequence}
                disabled={composing || selectedGroups.size === 0}
              >
                <FolderArchive className="mr-2 h-4 w-4" /> 下载序列帧
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

/** 单个动画卡片：循环播放帧序列 */
function AnimCard({ index, frames, fps, loop, playing, checked, onCheckedChange }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!playing || frames.length <= 1) return;
    const interval = Math.max(33, Math.round(1000 / Math.max(1, fps)));
    timerRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        const next = prev + 1;
        if (next >= frames.length) return loop ? 0 : prev;  // 非循环时停在末帧
        return next;
      });
    }, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, frames, fps, loop]);

  // 切换帧序列时复位到首帧
  useEffect(() => { setFrameIdx(0); }, [frames]);

  const currentUrl = frames[frameIdx] || frames[0];

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex min-h-[120px] items-center justify-center bg-[conic-gradient(#e2e8f0_25%,transparent_0_50%,#e2e8f0_0_75%,transparent_0)] [background-size:16px_16px] p-2">
        {currentUrl && (
          <img src={currentUrl} alt={`anim-${index + 1}`} className="max-h-[110px] max-w-full object-contain" />
        )}
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px]">
        <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange?.(Boolean(value))} />
          <span>动画 {index + 1}</span>
        </label>
        <span className="text-muted-foreground">{frameIdx + 1}/{frames.length}</span>
      </div>
    </div>
  );
}
