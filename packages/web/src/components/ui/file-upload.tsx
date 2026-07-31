"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { Upload, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { FileCard, type FormatFileProps } from "@/components/file-card-collections";
import { CANVAS_IMAGE_DROP_MIME, debugCanvasImageDrag, getCanvasImageDropUrls, setCanvasImageDragData } from "./file-upload-drop";

// 文件列表拖拽排序的互斥标记：写入 dataTransfer 表示当前在列表内排序。
// 嵌入 mini-app（game-asset-canvas）时，画布 handleDrop 见此标记直接 return，
// 防止排序松手落画布误建图片节点。字符串需与 mini-app 画布端识别的标记一致。
const IMAGE_REORDER_MIME = "application/x-image-reorder";

export interface FileUploadFileLike {
  name: string;
  size: number;
  type: string;
  url?: string;
  httpPath?: string;
  uploadedUrl?: string;
  uploadedHttpPath?: string;
  uploading?: boolean;
  uploadProgress?: number;
  uploadError?: string;
}

export interface FileUploadFile<TFile extends FileUploadFileLike = File> {
  id: string;
  file: TFile;
  preview?: string;
}

interface FileUploadProps<TFile extends FileUploadFileLike = File> {
  value?: FileUploadFile<TFile>[];
  onChange?: (files: FileUploadFile<TFile | File>[]) => void;
  onUploadStatusChange?: (status: { uploading: boolean; files: FileUploadFile<TFile | File>[] }) => void;
  autoUpload?: boolean;
  accept?: Accept;
  fileNameFilter?: string;
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** 文件列表项支持拖拽排序（GIF 合成 / Sprite Sheet 合成等顺序敏感场景）。原生 HTML5 拖拽，无额外依赖。 */
  sortable?: boolean;
  /** 隐藏上传区域（dropzone），仅保留文件列表展示。用于节点折叠上传控件但保留已传文件预览的场景。 */
  hideDropzone?: boolean;
}

let _fileId = 0;

export function FileUpload<TFile extends FileUploadFileLike = File>({
  value = [],
  onChange,
  onUploadStatusChange: _onUploadStatusChange,
  autoUpload: _autoUpload,
  accept,
  fileNameFilter,
  maxFiles = 0,
  maxSize,
  disabled = false,
  className,
  placeholder,
  sortable = false,
  hideDropzone = false,
}: FileUploadProps<TFile>) {
  const [dragError, setDragError] = useState<string | null>(null);
  // 拖拽排序状态：draggingId = 被拖拽项 id，overId = 当前悬停项 id（用于占位指示）
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const debugStagesRef = useRef(new Set<string>());
  const dropzoneAccept = accept ?? getAcceptFromFileNameFilter(fileNameFilter);
  const files = useMemo(() => value.filter((item) => item?.file), [value]);

  useEffect(() => {
    for (const item of files) {
      if (item.preview?.startsWith("blob:") && getUploadedFileUrl(item.file)) {
        URL.revokeObjectURL(item.preview);
      }
    }
  }, [files]);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setDragError(null);

      if (rejected.length > 0) {
        const msg = rejected[0].errors[0]?.message;
        if (msg) setDragError(msg);
      }

      if (accepted.length === 0) return;

      const newFiles: FileUploadFile[] = accepted.map((file) => {
        const item: FileUploadFile = { id: `upload-${++_fileId}`, file };
        if (file.type.startsWith("image/")) {
          item.preview = URL.createObjectURL(file);
        }
        return item;
      });

      const next = maxFiles > 0 ? [...files, ...newFiles].slice(0, maxFiles) : [...files, ...newFiles];
      onChange?.(next);
    },
    [files, onChange, maxFiles],
  );

  const handleCanvasImageDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const urls = getCanvasImageDropUrls(event.dataTransfer);
    debugCanvasImageDrag("shared-target:drop-handler", event.dataTransfer, {
      urls,
      disabled,
      ownDrag: Boolean(draggingIdRef.current),
      currentFiles: files.length,
    });
    if (urls.length === 0) return;
    if (draggingIdRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;

    const remaining = maxFiles > 0 ? Math.max(0, maxFiles - files.length) : urls.length;
    if (remaining === 0) {
      setDragError(`最多 ${maxFiles} 个文件`);
      return;
    }
    const droppedFiles: FileUploadFile[] = urls.slice(0, remaining).map((url, index) => {
      const file = Object.assign(
        new File([], getDroppedImageName(url, index), { type: "image/png" }),
        { url, httpPath: url },
      );
      return {
        id: `upload-${++_fileId}`,
        file,
        preview: url,
      };
    });
    setDragError(null);
    onChange?.([...files, ...droppedFiles]);
    debugCanvasImageDrag("shared-target:onChange", event.dataTransfer, {
      addedUrls: urls.slice(0, remaining),
      nextFiles: files.length + droppedFiles.length,
    });
  }, [disabled, files, maxFiles, onChange]);

  const handleCanvasImageDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (draggingIdRef.current) return;
    if (Array.from(event.dataTransfer.types || []).includes(CANVAS_IMAGE_DROP_MIME)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const logDragStage = useCallback((stage: string, event: DragEvent<HTMLDivElement>) => {
    if (stage.includes("dragover") && debugStagesRef.current.has(stage)) return;
    debugStagesRef.current.add(stage);
    debugCanvasImageDrag(stage, event.dataTransfer, {
      target: event.target instanceof Element ? event.target.tagName : null,
    });
  }, []);

  const resetDragStages = useCallback(() => {
    debugStagesRef.current.clear();
  }, []);

  const removeFile = useCallback(
    (id: string) => {
      const target = files.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      onChange?.(files.filter((f) => f.id !== id));
    },
    [files, onChange],
  );

  // 拖拽排序：拖起一项，悬停到另一项上时实时重排（受控 value 经 onChange 回写）。
  // drop 时清空状态。仅 sortable=true 启用。
  // 同时写入互斥标记 MIME：mini-app 画布 handleDrop 见此标记直接 return，
  // 防止排序松手落画布时误建图片节点（浏览器会把可拖拽元素默认转成 dataTransfer.files）。
  const handleSortDragStart = useCallback((e: DragEvent<HTMLDivElement>, item: FileUploadFile<TFile>) => {
    const imageUrl = item.file.type.startsWith("image/") ? getUploadedFileUrl(item.file) : undefined;
    if (imageUrl) setCanvasImageDragData(e.dataTransfer, [imageUrl]);
    debugCanvasImageDrag("shared-input:dragstart", e.dataTransfer, {
      imageUrl,
      sortable,
      fileId: item.id,
    });
    draggingIdRef.current = item.id;
    setDraggingId(item.id);
    if (!sortable) {
      e.dataTransfer.effectAllowed = "copy";
      return;
    }
    e.dataTransfer.effectAllowed = imageUrl ? "copyMove" : "move";
    try {
      e.dataTransfer.setData("text/plain", item.id);
      e.dataTransfer.setData(IMAGE_REORDER_MIME, "1");
    } catch {}
  }, [sortable]);

  const handleSortDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, overItemId: string) => {
      if (!sortable || !draggingId || draggingId === overItemId) return;
      e.preventDefault(); // 允许 drop
      if (overId !== overItemId) setOverId(overItemId);
      const from = files.findIndex((f) => f.id === draggingId);
      const to = files.findIndex((f) => f.id === overItemId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...files];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onChange?.(next);
    },
    [sortable, draggingId, overId, files, onChange],
  );

  const handleSortDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }, []);

  const handleItemDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!draggingIdRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: dropzoneAccept,
    maxFiles: maxFiles || undefined,
    maxSize,
    noClick: true,
    useFsAccessApi: false,
    validator: fileNameFilter
      ? (file) => (
        matchesFileNameFilter(file.name, fileNameFilter)
          ? null
          : { code: "file-name-filter", message: `File name does not match filter: ${fileNameFilter}` }
      )
      : undefined,
    disabled,
  });

  const handleDropzoneClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    openFilePicker();
  }, [openFilePicker]);

  const stopInputClickPropagation = useCallback((event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className={cn("space-y-3", className)}
      onDragEnterCapture={(event) => logDragStage("shared-target:dragenter:capture", event)}
      onDragOverCapture={(event) => {
        logDragStage("shared-target:dragover:capture", event);
        handleCanvasImageDragOver(event);
      }}
      onDropCapture={(event) => {
        logDragStage("shared-target:drop:capture", event);
        handleCanvasImageDrop(event);
        resetDragStages();
      }}
      onDragEnter={(event) => logDragStage("shared-target:dragenter:bubble", event)}
      onDragOver={(event) => {
        logDragStage("shared-target:dragover:bubble", event);
        handleCanvasImageDragOver(event);
      }}
      onDrop={(event) => {
        logDragStage("shared-target:drop:bubble", event);
        handleCanvasImageDrop(event);
        resetDragStages();
      }}
      onDragLeaveCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resetDragStages();
      }}
    >
      {/* Drop zone（hideDropzone 时隐藏，保留文件列表） */}
      {!hideDropzone && (
        <div
          {...getRootProps({ onClick: handleDropzoneClick })}
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors cursor-pointer",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-accent/50",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <input {...getInputProps({ onClick: stopInputClickPropagation })} />
          <Upload className="size-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">
              {placeholder ?? (isDragActive ? "松开即可上传" : "拖拽文件到此处，或点击选择")}
            </p>
            {!isDragActive && (
              <p className="mt-1 text-xs text-muted-foreground">
                支持多文件{maxSize ? `，单文件最大 ${(maxSize / 1024 / 1024).toFixed(0)}MB` : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {dragError && <p className="text-xs text-destructive">{dragError}</p>}

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((item) => {
            const preview = getFilePreview(item);
            const uploaded = Boolean(getUploadedFileUrl(item.file));
            const imageUrl = item.file.type.startsWith("image/") ? getUploadedFileUrl(item.file) : undefined;
            const isDragging = sortable && draggingId === item.id;
            const isOver = sortable && overId === item.id && draggingId !== item.id;
            return (
              <div
                key={item.id}
                draggable={sortable || Boolean(imageUrl) || undefined}
                onDragStart={sortable || imageUrl ? (e) => handleSortDragStart(e, item) : undefined}
                onDragOver={sortable ? (e) => handleSortDragOver(e, item.id) : undefined}
                onDragEnd={sortable || imageUrl ? handleSortDragEnd : undefined}
                onDrop={handleItemDrop}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-background px-3 py-2 transition-colors",
                  isDragging ? "border-primary opacity-40" : "border-border",
                  isOver && "border-primary border-t-2",
                  sortable && "cursor-grab active:cursor-grabbing",
                )}
              >
                {sortable && (
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                )}
                {preview ? (
                  <img src={preview} alt="" draggable={false} className="size-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="shrink-0 py-0.5">
                    <FileCard formatFile={detectFormat(item.file.name)} />
                  </div>
                )}
                <div className="w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm">{item.file.name}</p>
                    {item.file.uploading && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatProgress(item.file.uploadProgress)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.file.uploadError || (item.file.uploading ? "上传中" : uploaded ? "已上传" : formatSize(item.file.size))}
                  </p>
                  {item.file.uploading && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${formatProgressNumber(item.file.uploadProgress)}%` }}
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFile(item.id);
                  }}
                  className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getFilePreview(item: FileUploadFile<FileUploadFileLike>): string | undefined {
  if (!item.file.type.startsWith("image/")) return undefined;
  return getUploadedFileUrl(item.file) || item.preview;
}

function getDroppedImageName(url: string, index: number): string {
  try {
    const name = decodeURIComponent(new URL(url, "http://localhost").pathname.split("/").pop() || "");
    if (name) return name;
  } catch {}
  return `dropped-image-${index + 1}.png`;
}

// 扩展名 → FormatFileProps 映射。与 file-display-view.tsx 的 detectFormat 保持一致，
// 用于非图片文件的 FileCard 占位展示。
const EXT_TO_FORMAT: Record<string, FormatFileProps> = {
  doc: "doc", docx: "doc",
  pdf: "pdf",
  md: "md", markdown: "md",
  mdx: "mdx",
  txt: "txt", log: "txt",
  csv: "csv", tsv: "csv",
  xls: "xls",
  xlsx: "xlsx",
  ppt: "ppt",
  pptx: "pptx",
  zip: "zip",
  rar: "rar",
  tar: "tar",
  gz: "gz", gzip: "gz",
  html: "html", htm: "html",
  js: "js", mjs: "js", cjs: "js",
  jsx: "jsx",
  tsx: "tsx",
  ts: "code",
  css: "css", scss: "css", less: "css",
  json: "json",
  // 图片/视频走真实 <img> 预览分支，这里仅作兜底
  png: "png", jpg: "jpg", jpeg: "jpeg",
  gif: "img", webp: "img", svg: "img", bmp: "img", ico: "img",
  mp4: "video", mov: "video", avi: "video", mkv: "video", webm: "video", flv: "video",
};

function detectFormat(name: string): FormatFileProps {
  const clean = name.toLowerCase().split("?")[0].split("#")[0];
  const ext = clean.split(".").pop() || "";
  return EXT_TO_FORMAT[ext] || "doc";
}

function getUploadedFileUrl(file: FileUploadFileLike): string | undefined {
  return file.uploadedHttpPath || file.uploadedUrl || file.httpPath || file.url;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatProgress(value?: number): string {
  return `${formatProgressNumber(value)}%`;
}

function formatProgressNumber(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function matchesFileNameFilter(fileName: string, filter: string): boolean {
  const name = fileName.toLowerCase();
  const patterns = filter.split(",").map(pattern => pattern.trim().toLowerCase()).filter(Boolean);
  if (patterns.length === 0) return true;

  return patterns.some((pattern) => {
    if (pattern.startsWith(".")) return name.endsWith(pattern);
    if (pattern.includes("*") || pattern.includes("?")) {
      return globToRegExp(pattern).test(name);
    }
    return name.includes(pattern);
  });
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".aac": "audio/aac",
  ".avif": "image/avif",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".m4a": "audio/mp4",
  ".md": "text/markdown",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

function getAcceptFromFileNameFilter(filter?: string): Accept | undefined {
  const extensions = extractFileNameFilterExtensions(filter);
  if (extensions.length === 0) return undefined;

  return extensions.reduce<Accept>((acc, extension) => {
    const mimeType = EXTENSION_MIME_TYPES[extension] ?? "application/octet-stream";
    acc[mimeType] = [...(acc[mimeType] ?? []), extension];
    return acc;
  }, {});
}

function extractFileNameFilterExtensions(filter?: string): string[] {
  if (!filter?.trim()) return [];

  const extensions = filter
    .split(",")
    .map(pattern => pattern.trim().toLowerCase())
    .map((pattern) => {
      const match = pattern.match(/(\.[a-z0-9][a-z0-9_-]*)$/i);
      if (!match) return null;
      return pattern.slice(0, -match[1].length).includes("?") ? null : match[1];
    })
    .filter((extension): extension is string => Boolean(extension));

  return Array.from(new Set(extensions));
}
