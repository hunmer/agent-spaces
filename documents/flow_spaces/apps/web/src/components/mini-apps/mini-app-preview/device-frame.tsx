import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Smartphone, Tablet, Monitor } from 'lucide-react';

/** 设备外框资源映射。key = manifest.devices 里的设备标识。 */
export const DEVICE_FRAMES: Record<string, {
  label: string;
  icon: typeof Smartphone;
  /** 外框图（背景）相对 public 路径 */
  frame: string;
  /** 屏幕区域相对外框的 padding（百分比），用于定位实际内容。 */
  screen: { top: string; right: string; bottom: string; left: string };
  screenRadius?: string;
  screenPadding?: string;
  /** 外框在容器里的最大宽度，用于限制大设备。 */
  maxWidth?: string;
  /** 外框纵横比宽/高，用于自适应高度。 */
  aspectRatio?: string;
  isSvg?: boolean;
}> = {
  mobile: {
    label: 'Mobile',
    icon: Smartphone,
    frame: '/devices/iphone-17-pro-max.svg',
    // SVG 实际内屏安全边界：x=100..1419，y≈100..2967。
    screen: { top: '3.3%', right: '6.6%', bottom: '3.3%', left: '6.6%' },
    screenRadius: '12% / 6%',
    maxWidth: '380px',
    aspectRatio: '1520 / 3068',
    isSvg: true,
  },
  ipad_portrait: {
    label: 'iPad Portrait',
    icon: Tablet,
    frame: '/devices/ipad-pro-13-portrait.png',
    // 实测 alpha 镂空：屏幕 inset 上下 5.75%、左右 7.67%
    screen: { top: '5.75%', right: '7.67%', bottom: '5.75%', left: '7.67%' },
    maxWidth: '780px',
    aspectRatio: '2448 / 3132',
  },
  ipad_landscape: {
    label: 'iPad Landscape',
    icon: Tablet,
    frame: '/devices/ipad-pro-13-landscape.png',
    // 实测 alpha 镂空：屏幕 inset 上下 7.67%、左右 5.75%
    screen: { top: '7.67%', right: '5.75%', bottom: '7.67%', left: '5.75%' },
    maxWidth: '1180px',
    aspectRatio: '3132 / 2448',
  },
  pc: {
    label: 'PC',
    icon: Monitor,
    frame: '/devices/macbook-pro-16.png',
    // 实测 alpha 镂空：屏幕 inset 上下 10.33%、左右 9.80%
    screen: { top: '10.33%', right: '9.8%', bottom: '10.33%', left: '9.8%' },
    maxWidth: '1400px',
    aspectRatio: '4340 / 2860',
  },
};

/** 把 manifest.devices 展开成可选设备列表（ipad 拆 portrait/landscape）。 */
export function expandDevices(devices?: string[]): string[] {
  if (!devices?.length) return [];
  const out: string[] = [];
  for (const d of devices) {
    if (d === 'ipad') {
      out.push('ipad_portrait', 'ipad_landscape');
    } else {
      out.push(d);
    }
  }
  return out;
}

/** 解析 "1520 / 3068" 形式的 aspectRatio 为数值宽高比。 */
function parseAspectRatio(s?: string): number {
  if (!s) return 1;
  const parts = s.split('/').map((x) => parseFloat(x.trim()));
  if (parts.length === 2 && parts[1]) return parts[0] / parts[1];
  return parseFloat(s) || 1;
}

/**
 * 设备外框容器：测量父容器尺寸，按设备宽高比算出"既不超宽也不超高"的
 * 实际宽高（取宽/高两个约束的较小值），保证设备等比完整显示且不滚动。
 */
export function DeviceFrame({ meta, children }: { meta: typeof DEVICE_FRAMES[string]; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const ratio = useMemo(() => parseAspectRatio(meta.aspectRatio), [meta.aspectRatio]);
  const maxW = useMemo(() => parseFloat(meta.maxWidth ?? '9999') || 9999, [meta.maxWidth]);

  useEffect(() => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    const measure = () => {
      const pad = 32; // p-4 上下/左右各 16px
      const availW = Math.max(0, el.clientWidth - pad);
      const availH = Math.max(0, el.clientHeight - pad);
      if (availW <= 0 || availH <= 0) return;
      // 按宽算高、按高算宽，取能放下的那个
      let w = availW;
      let h = w / ratio;
      if (h > availH) {
        h = availH;
        w = h * ratio;
      }
      // 不超过声明 maxWidth
      if (w > maxW) {
        w = maxW;
        h = w / ratio;
      }
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, maxW]);

  const screen = meta.screen;
  return (
    <div
      ref={wrapRef}
      className="relative"
      style={size ? { width: size.w, height: size.h } : { width: 0, height: 0 }}
    >
      {/* 屏幕内容层（下层）：overflow-hidden 裁剪；transform 建立包含块让 fixed/sticky 相对本屏定位 */}
      <div
        className="absolute isolate overflow-hidden bg-white dark:bg-black"
        style={{
          top: screen.top,
          right: screen.right,
          bottom: screen.bottom,
          left: screen.left,
          borderRadius: meta.screenRadius,
          clipPath: meta.screenRadius ? `inset(0 round ${meta.screenRadius})` : undefined,
          padding: meta.screenPadding,
          transform: 'translateZ(0)',
        }}
      >
        {children}
      </div>
      {/* 设备外框层（上层）：屏幕区镂空透明，透出内容；不透明边框盖住溢出 */}
      <img
        src={meta.frame}
        alt={meta.label}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill select-none"
        draggable={false}
      />
    </div>
  );
}
