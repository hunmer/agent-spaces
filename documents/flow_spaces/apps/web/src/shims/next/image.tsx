/**
 * `next/image` shim：原生 <img> 包装。
 *
 * 业务闭包内唯一使用点 components/editor/file-icon.tsx：
 *   <Image src="/icons/xxx.svg" width={16} height={16} className unoptimized />
 * 即 public/ 下的静态 SVG，无 next 图片优化管线需求，直接渲染 <img>。
 */
import type {
  CSSProperties,
  ImgHTMLAttributes,
} from "react";

export interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
  blurWidth?: number;
  blurHeight?: number;
}

export interface ImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "placeholder"> {
  src: string | StaticImageData;
  alt: string;
  width?: number | `${number}` | string;
  height?: number | `${number}` | string;
  /** 填充父容器（对应 Next 的 fill 布局） */
  fill?: boolean;
  priority?: boolean;
  quality?: number | `${number}` | string;
  /** Next 图片优化参数仅为类型兼容，SPA 下忽略 */
  placeholder?: string;
  loader?: (...args: unknown[]) => string;
  unoptimized?: boolean;
  overrideSrc?: string;
  style?: CSSProperties;
}

export default function Image({
  src,
  width,
  height,
  fill,
  priority,
  quality: _quality,
  placeholder: _placeholder,
  loader: _loader,
  unoptimized: _unoptimized,
  overrideSrc,
  style,
  ...rest
}: ImageProps) {
  const resolvedSrc = typeof src === "string" ? src : (src?.src ?? "");
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
    : undefined;

  return (
    <img
      src={overrideSrc ?? resolvedSrc}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      style={fill ? { ...fillStyle, ...style } : style}
      {...rest}
    />
  );
}
