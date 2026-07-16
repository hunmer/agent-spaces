"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccordionItem = {
  id: number | string;
  title: string;
  imageUrl: string;
  url: string;
};

type Props = {
  items: AccordionItem[];
  title?: string;
  description?: string;
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
  return (
    <div
      className={cn(
        "relative h-[450px] rounded-2xl overflow-hidden cursor-pointer",
        "transition-all duration-700 ease-in-out",
        isActive ? "w-[400px]" : "w-[60px]"
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
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
  );
}

export function LandingAccordionItem({ items, title, description }: Props) {
  const [activeIndex, setActiveIndex] = React.useState(
    items.length > 0 ? items.length - 1 : 0
  );
  const [openUrl, setOpenUrl] = React.useState<{ url: string; title: string } | null>(null);

  return (
    <div className="bg-background font-sans">
      <section className="container mx-auto px-4 py-12 md:py-24">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="w-full md:w-1/2 text-center md:text-left">
            {title && (
              <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight tracking-tighter">
                {title}
              </h1>
            )}
            {description && (
              <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto md:mx-0">
                {description}
              </p>
            )}
          </div>

          <div className="w-full md:w-1/2">
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
          </div>
        </div>
      </section>

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
