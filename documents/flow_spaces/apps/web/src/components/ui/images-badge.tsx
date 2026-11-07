"use client";

import React, { useState, ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type BadgeItem = string | ReactNode;

interface ImagesBadgeProps {
  text: string;
  /** Each item can be an image URL (string) or a custom ReactNode */
  items: BadgeItem[];
  className?: string;
  /** Optional link URL */
  href?: string;
  /** Link target attribute (e.g., "_blank" for new tab) */
  target?: string;
  /** Folder dimensions { width, height } in pixels */
  folderSize?: { width: number; height: number };
  /** Item dimensions when teased (peeking) { width, height } in pixels */
  teaserImageSize?: { width: number; height: number };
  /** Item dimensions when hovered { width, height } in pixels */
  hoverImageSize?: { width: number; height: number };
  /** How far items translate up on hover in pixels */
  hoverTranslateY?: number;
  /** How far items spread horizontally on hover in pixels */
  hoverSpread?: number;
  /** Rotation angle for fanned items on hover in degrees */
  hoverRotation?: number;
}

/** @deprecated Use items instead */
type ImagesBadgeCompatProps = Omit<ImagesBadgeProps, "items"> & {
  images?: string[];
};

function isImagesBadgeCompat(props: ImagesBadgeProps | ImagesBadgeCompatProps): props is ImagesBadgeCompatProps & { images: string[] } {
  return "images" in props && Array.isArray((props as ImagesBadgeCompatProps).images);
}

export function ImagesBadge(props: ImagesBadgeProps | ImagesBadgeCompatProps) {
  const resolved: ImagesBadgeProps = isImagesBadgeCompat(props)
    ? { ...props, items: props.images }
    : (props as ImagesBadgeProps);

  const {
    text,
    items,
    className,
    href,
    target,
    folderSize = { width: 32, height: 24 },
    teaserImageSize = { width: 20, height: 14 },
    hoverImageSize = { width: 48, height: 32 },
    hoverTranslateY = -35,
    hoverSpread = 20,
    hoverRotation = 15,
  } = resolved;

  const [isHovered, setIsHovered] = useState(false);

  // Limit to max 3 items
  const displayItems = items.slice(0, 3);

  // Calculate folder tab dimensions proportionally
  const tabWidth = folderSize.width * 0.375;
  const tabHeight = folderSize.height * 0.25;

  const Component = href ? "a" : "div";

  return (
    <Component
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 perspective-[1000px] transform-3d",
        className,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Folder Container */}
      <motion.div
        className="relative"
        style={{
          width: folderSize.width,
          height: folderSize.height,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Folder Back */}
        <div className="absolute inset-0 rounded-[4px] bg-gradient-to-b from-amber-400 to-amber-500 shadow-sm dark:from-amber-500 dark:to-amber-600">
          {/* Folder Tab */}
          <div
            className="absolute left-0.5 rounded-t-[2px] bg-gradient-to-b from-amber-300 to-amber-400 dark:from-amber-400 dark:to-amber-500"
            style={{
              top: -tabHeight * 0.65,
              width: tabWidth,
              height: tabHeight,
            }}
          />
        </div>

        {/* Items that pop out */}
        {displayItems.map((item, index) => {
          const totalItems = displayItems.length;

          const baseRotation =
            totalItems === 1
              ? 0
              : totalItems === 2
                ? (index - 0.5) * hoverRotation
                : (index - 1) * hoverRotation;

          const hoverY = hoverTranslateY - (totalItems - 1 - index) * 3;
          const hoverX =
            totalItems === 1
              ? 0
              : totalItems === 2
                ? (index - 0.5) * hoverSpread
                : (index - 1) * hoverSpread;

          const teaseY = -4 - (totalItems - 1 - index) * 1;
          const teaseRotation =
            totalItems === 1
              ? 0
              : totalItems === 2
                ? (index - 0.5) * 3
                : (index - 1) * 3;

          const isImage = typeof item === "string";

          return (
            <motion.div
              key={index}
              className={cn(
                "absolute top-0.5 left-1/2 origin-bottom overflow-hidden rounded-[3px]",
                isImage && "bg-white shadow-sm ring-1 shadow-black/10 ring-black/10 dark:bg-neutral-800 dark:shadow-white/10 dark:ring-white/10",
              )}
              animate={{
                x: `calc(-50% + ${isHovered ? hoverX : 0}px)`,
                y: isHovered ? hoverY : teaseY,
                rotate: isHovered ? baseRotation : teaseRotation,
                width: isHovered ? hoverImageSize.width : teaserImageSize.width,
                height: isHovered
                  ? hoverImageSize.height
                  : teaserImageSize.height,
              }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
                delay: index * 0.03,
              }}
              style={{
                zIndex: 10 + index,
              }}
            >
              {isImage ? (
                <img
                  src={item}
                  alt={`Preview ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center [&>div]:!ring-0 [&>div]:!shadow-none [&>div]:!border-0 [&>div]:!bg-transparent [&>div]:scale-[0.55] [&>div]:origin-center">
                  {item}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Folder Front (flattens on hover) */}
        <motion.div
          className="absolute inset-x-0 bottom-0 h-[85%] origin-bottom rounded-[4px] bg-gradient-to-b from-amber-300 to-amber-400 shadow-sm dark:from-amber-400 dark:to-amber-500"
          animate={{
            rotateX: isHovered ? -45 : -25,
            scaleY: isHovered ? 0.8 : 1,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
          }}
          style={{
            transformStyle: "preserve-3d",
            zIndex: 20,
          }}
        >
          {/* Folder line detail */}
          <div className="absolute top-1 right-1 left-1 h-px bg-amber-200/50 dark:bg-amber-300/50" />
        </motion.div>
      </motion.div>

      {/* Text */}
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {text}
      </span>
    </Component>
  );
}
