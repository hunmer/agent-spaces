import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Check, Loader2, X } from '@agent-spaces/ui';
import ImageResult from './ImageResult';

/**
 * 节点产出卡片：渲染在节点主体外部下方，固定不随表单滚动。
 * 参考工作流 WorkflowNodeExecutionLog：折叠开关 + 状态图标 + 运行耗时统计 + loader 占位。
 *
 * @param {object} props
 * @param {number} [props.width] 卡片宽度（跟随节点主体宽度，未给则 100%）
 * @param {boolean} [props.hasExternalSourceHandle] 为外置输出 Handle 预留间距
 * @param {string} [props.status] 节点状态：idle/running/done/error
 * @param {string} [props.statusMsg] running 时自定义提示文案
 * @param {Array<string>} [props.images] 产出图（data.output.images）
 * @param {string} [props.fileName] 下载/入库文件名（data.params.fileName）
 * @param {Function} [props.onAddToAssets]
 * @param {Function} [props.onAddImages]
 * @param {Function} [props.onRemoveImage]
 * @param {Function} [props.onClearImages]
 * @param {Function} [props.onReorderImages]
 * @param {Array} [props.versions]
 * @param {number} [props.activeVersion]
 * @param {Function} [props.onSwitchVersion]
 */
export default function NodeOutput({
  width,
  hasExternalSourceHandle = false,
  status = 'idle',
  statusMsg,
  images = [],
  fileName,
  onAddToAssets,
  onAddImages,
  onRemoveImage,
  onClearImages,
  onReorderImages,
  versions,
  activeVersion,
  onSwitchVersion,
  onMouseEnter,
  onMouseLeave,
}) {
  const hasImages = images.length > 0;
  const [expanded, setExpanded] = useState(true);
  // 耗时统计：running 时从挂载起实时累加；done/error 时定格最后一次运行耗时。
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== 'running') return undefined;
    startTimeRef.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  // Hooks 必须在早返回之前执行，避免 status 切到 running 时改变 Hook 调用顺序。
  if (!hasImages && status !== 'running') return null;

  const isRunning = status === 'running';
  const Icon = isRunning ? Loader2 : status === 'error' ? X : Check;
  const iconClass = isRunning
    ? 'h-3 w-3 animate-spin text-blue-500'
    : status === 'error'
      ? 'h-3 w-3 text-red-500'
      : 'h-3 w-3 text-green-500';
  const timeText = isRunning ? `${elapsed}s` : elapsed > 0 ? `${elapsed}s` : '';

  return (
    <div
      className="nodrag nopan relative z-10 mt-1"
      style={{
        width: typeof width === 'number' ? width : '100%',
        marginTop: hasExternalSourceHandle ? 40 : undefined,
      }}
      data-node-output
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        className={`flex w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-left transition-colors ${
          expanded ? 'rounded-b-none bg-muted' : 'bg-background hover:bg-muted'
        }`}
      >
        <Icon className={iconClass} />
        <span className="flex-1 truncate text-muted-foreground">
          {statusMsg && isRunning ? statusMsg : '产出'}
          {hasImages ? `（${images.length}）` : ''}
        </span>
        {timeText && <span className="text-muted-foreground/70">{timeText}</span>}
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="nodrag nopan rounded-b-md border border-t-0 border-border bg-card p-2">
          {isRunning && !hasImages ? (
            <div className="flex min-h-[80px] w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">{statusMsg || '生成中…'}</span>
            </div>
          ) : (
            <ImageResult
              images={images}
              fileName={fileName}
              onAddToAssets={onAddToAssets}
              onAddImages={onAddImages}
              onRemoveImage={onRemoveImage}
              onClearImages={onClearImages}
              onReorderImages={onReorderImages}
              versions={versions}
              activeVersion={activeVersion}
              onSwitchVersion={onSwitchVersion}
            />
          )}
        </div>
      )}
    </div>
  );
}
