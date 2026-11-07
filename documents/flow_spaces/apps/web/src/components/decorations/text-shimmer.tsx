"use client";

import React, { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type TextShimmerProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  baseColor?: string;
  shimmerColor?: string;
  style?: React.CSSProperties;
};

const MotionP = motion.create("p") as React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>;
const MotionSpan = motion.create("span") as React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>;
const MotionDiv = motion.create("div") as React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>;
const MotionH1 = motion.create("h1") as React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>;
const MotionH2 = motion.create("h2") as React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>;
const MotionH3 = motion.create("h3") as React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>;

const motionMap: Record<string, React.ComponentType<React.HTMLAttributes<HTMLElement> & Record<string, unknown>>> = {
  p: MotionP,
  span: MotionSpan,
  div: MotionDiv,
  h1: MotionH1,
  h2: MotionH2,
  h3: MotionH3,
};

function TextShimmerComponent({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  baseColor,
  shimmerColor,
  style,
}: TextShimmerProps) {
  const MotionComponent = motionMap[Component as string] ?? MotionP;

  const dynamicSpread = useMemo(() => {
    return children.length * spread;
  }, [children, spread]);

  return (
    <MotionComponent
      className={cn(
        "relative inline-block bg-size-[250%_100%,auto] bg-clip-text",
        "[-webkit-text-fill-color:transparent]",
        "[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      animate={{ backgroundPosition: "0% center" }}
      transition={{
        repeat: Infinity,
        duration,
        ease: "linear",
      }}
      style={
        {
          ...style,
          "--spread": `${dynamicSpread}px`,
          "--base-color":
            baseColor ?? "color-mix(in oklab, currentColor 55%, transparent)",
          "--base-gradient-color": shimmerColor ?? "currentColor",
          backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
        } as React.CSSProperties
      }
    >
      {children}
    </MotionComponent>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);
