"use client";

import { useCallback, type ReactNode } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropzoneProps {
  /** 文件被拖入或选择时回调（纯 UI 层，不做上传，上传由调用方实现） */
  onFiles: (files: File[]) => void;
  /** 接受的文件类型，透传给 react-dropzone */
  accept?: Accept;
  /** 单文件最大字节数 */
  maxSize?: number;
  /** 禁用拖拽接收 */
  disabled?: boolean;
  /** 是否允许点击触发文件选择（默认 false，由调用方自行决定点击行为；素材库等嵌套 FileUpload 场景必须 false 避免冲突） */
  clickable?: boolean;
  className?: string;
  /** 自定义内容；不传则渲染默认占位（图标 + 提示文案） */
  children?: ReactNode;
  /** 默认占位提示文案 */
  placeholder?: string;
}

/**
 * 纯 UI 拖拽接收层：基于 react-dropzone，只负责接收文件并回调 onFiles，
 * 不含任何上传/持久化逻辑。任何 mini-app 都能复用，上传由调用方实现。
 *
 * - clickable=false（默认）：只接收拖拽，不响应点击（避免与内部 FileUpload 等点击交互冲突）。
 * - children 存在时，整体作为容器包裹；拖入时边框/背景高亮提示。
 */
export function Dropzone({
  onFiles,
  accept,
  maxSize,
  disabled = false,
  clickable = false,
  className,
  children,
  placeholder,
}: DropzoneProps) {
  const handleDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length === 0) return;
      onFiles?.(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept,
    maxSize,
    noClick: !clickable,
    noKeyboard: !clickable,
    useFsAccessApi: false,
    disabled,
  });

  // 有 children：作为容器包裹（拖入高亮态叠加 ring/border）。无 children：渲染默认占位。
  if (children != null) {
    return (
      <div
        {...getRootProps({ onClick: clickable ? undefined : (e) => e.stopPropagation() })}
        className={cn(
          "relative transition-colors",
          isDragActive && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg bg-primary/5",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
      >
        {clickable && <input {...getInputProps()} />}
        {children}
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-accent/50",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className="size-8 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">
          {placeholder ?? (isDragActive ? "松开即可上传" : "拖拽文件到此处")}
        </p>
      </div>
    </div>
  );
}
