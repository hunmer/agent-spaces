"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTiltCard } from "@/components/ui/interactive-frosted-glass-card";
import { cn } from "@/lib/utils";

export type AccordionItem = {
  id: number | string;
  title: string;
  imageUrl: string;
  url: string;
};

function ItemCard({
  item,
  isActive,
  onMouseEnter,
  onClick,
}: {
  item: AccordionItem;
  isActive: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  // 仅在 active（展开）时启用 3D 倾斜——inactive 状态宽仅 60px，倾斜无意义且易抖动。
  const tiltRef = useTiltCard<HTMLDivElement>(10, isActive);

  return (
    <div
      className={cn(
        "group [perspective:1000px]",
        "relative h-[450px] cursor-pointer",
        // 宽度过渡放在外层，不参与 3D 变换
        "transition-all duration-700 ease-in-out",
        isActive ? "w-[400px]" : "w-[60px]"
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {/* 倾斜层：圆角 + overflow-hidden 下沉到这里，3D 旋转下裁剪才生效 */}
      <div
        ref={tiltRef}
        className={cn(
          "absolute inset-0 rounded-2xl overflow-hidden",
          "[transform-style:preserve-3d] transition-transform duration-200 ease-out"
        )}
      >
        <img
          src={item.imageUrl}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            const t = e.currentTarget;
            t.onerror = null;
            t.src = "https://placehold.co/400x450/2d3748/ffffff?text=Image+Error";
          }}
        />
        <div className="absolute inset-0 bg-black/40" />
        {/* 动态高光：跟随鼠标的径向渐变，强化玻璃质感 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.25), transparent 60%)",
          }}
        />
        <span
          className={cn(
            "absolute text-white text-lg font-semibold whitespace-nowrap",
            "transition-all duration-300 ease-in-out",
            isActive
              ? "bottom-6 left-1/2 -translate-x-1/2 rotate-0"
              : "bottom-24 left-1/2 -translate-x-1/2 rotate-90"
          )}
        >
          {item.title}
        </span>
      </div>
    </div>
  );
}

type Props = {
  items: AccordionItem[];
};

/**
 * 只负责渲染一行图片手风琴卡片 + 点击后的 iframe Dialog。
 * 不包含任何 section 标题、页面标题或描述文本，这些由调用方自行组织。
 */
export function ImageAccordionRow({ items }: Props) {
  const [activeIndex, setActiveIndex] = React.useState(
    items.length > 0 ? items.length - 1 : 0
  );
  const [openUrl, setOpenUrl] = React.useState<{ url: string; title: string } | null>(null);

  return (
    <div className="font-sans w-full">
      <div className="flex flex-row items-center justify-center gap-4 overflow-x-auto p-4">
        {items.map((item, index) => (
          <ItemCard
            key={item.id}
            item={item}
            isActive={index === activeIndex}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => setOpenUrl({ url: item.url, title: item.title })}
          />
        ))}
      </div>

      <Dialog open={!!openUrl} onOpenChange={(o) => !o && setOpenUrl(null)}>
        <DialogContent className="sm:max-w-5xl w-[calc(100%-2rem)] h-[80vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">{openUrl?.title ?? "External content"}</DialogTitle>
          {openUrl && (
            <iframe
              src={openUrl.url}
              title={openUrl.title}
              className="absolute inset-0 h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
