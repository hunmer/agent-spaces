"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { Upload, X, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileUploadFileLike {
  name: string;
  size: number;
  type: string;
  url?: string;
  httpPath?: string;
}

export interface FileUploadFile<TFile extends FileUploadFileLike = File> {
  id: string;
  file: TFile;
  preview?: string;
}

interface FileUploadProps<TFile extends FileUploadFileLike = File> {
  value?: FileUploadFile<TFile>[];
  onChange?: (files: FileUploadFile<TFile | File>[]) => void;
  autoUpload?: boolean;
  accept?: Accept;
  fileNameFilter?: string;
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

let _fileId = 0;

export function FileUpload<TFile extends FileUploadFileLike = File>({
  value = [],
  onChange,
  autoUpload: _autoUpload,
  accept,
  fileNameFilter,
  maxFiles = 0,
  maxSize,
  disabled = false,
  className,
  placeholder,
}: FileUploadProps<TFile>) {
  const [dragError, setDragError] = useState<string | null>(null);
  const dropzoneAccept = accept ?? getAcceptFromFileNameFilter(fileNameFilter);

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

      const next = maxFiles > 0 ? [...value, ...newFiles].slice(0, maxFiles) : [...value, ...newFiles];
      onChange?.(next);
    },
    [value, onChange, maxFiles],
  );

  const removeFile = useCallback(
    (id: string) => {
      const target = value.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      onChange?.(value.filter((f) => f.id !== id));
    },
    [value, onChange],
  );

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
    <div className={cn("space-y-3", className)}>
      {/* Drop zone */}
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

      {dragError && <p className="text-xs text-destructive">{dragError}</p>}

      {/* File list */}
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((item) => {
            const preview = getFilePreview(item);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 overflow-hidden"
              >
                {preview ? (
                  <img src={preview} alt="" className="size-10 rounded-md object-cover" />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                    <FileIcon className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="w-0 flex-1">
                  <p className="truncate text-sm">{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(item.file.size)}</p>
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
  if (item.preview) return item.preview;
  if (!item.file.type.startsWith("image/")) return undefined;
  return item.file.url || item.file.httpPath;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
