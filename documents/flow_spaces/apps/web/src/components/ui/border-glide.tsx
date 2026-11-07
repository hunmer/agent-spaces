'use client';
import React, { useRef, useCallback } from 'react';
import { motion, useSpring, useMotionTemplate, useTransform } from 'motion/react';
import { cn } from '@/lib/utils';

const MovingBorder: React.FC<{
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  rx?: string;
  ry?: string;
  color?: string;
  width?: string;
  height?: string;
  opacity?: number;
}> = ({
  children,
  className,
  style,
  duration = 3000,
  rx = '0.75rem',
  ry = '0.75rem',
  color = '#3b82f6',
  width = '6rem',
  height = '6rem',
  opacity = 0.8,
}) => {
  const pathRef = useRef<SVGRectElement>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const time = useSpring(0, { stiffness: 100, damping: 20, mass: 0.5 });

  const animate = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    time.set((elapsed * 1000) / duration);
    animationRef.current = requestAnimationFrame(animate);
  }, [time, duration]);

  React.useLayoutEffect(() => {
    startTimeRef.current = Date.now();
    animate();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [animate]);

  const getTotalLengthSafe = (el: SVGRectElement | null) => {
    if (!el || !el.isConnected) return 0;
    try { return el.getTotalLength(); } catch { return 0; }
  };

  const progress = useTransform(time, (val) => {
    const len = getTotalLengthSafe(pathRef.current);
    return len ? val % len : 0;
  });

  const x = useTransform(progress, (val) => {
    if (!pathRef.current?.isConnected) return 0;
    try { return pathRef.current.getPointAtLength(val).x; } catch { return 0; }
  });

  const y = useTransform(progress, (val) => {
    if (!pathRef.current?.isConnected) return 0;
    try { return pathRef.current.getPointAtLength(val).y; } catch { return 0; }
  });

  const angle = useTransform(progress, (val) => {
    if (!pathRef.current?.isConnected) return 0;
    try {
      const length = pathRef.current.getTotalLength();
      if (!length) return 0;
      const p1 = pathRef.current.getPointAtLength(val);
      const p2 = pathRef.current.getPointAtLength((val + 1) % length);
      return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
    } catch { return 0; }
  });

  const transform = useMotionTemplate`
    translateX(${x}px) translateY(${y}px)
    translateX(-50%) translateY(-50%)
    rotate(${angle}deg)
  `;

  const bg = color.includes('gradient')
    ? color
    : `radial-gradient(${color} 40%, transparent 60%)`;

  const inner = (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full pointer-events-none"
      >
        <rect fill="none" width="100%" height="100%" rx={rx} ry={ry} ref={pathRef} />
      </svg>
      <motion.div
        style={{ position: 'absolute', top: 0, left: 0, transform, willChange: 'transform' }}
      >
        <div
          className="rounded-full"
          style={{ height, width, opacity, background: bg, borderRadius: '50%' }}
        />
      </motion.div>
    </>
  );

  if (children) {
    return (
      <div className={cn('relative overflow-hidden rounded-xl', className)} style={style}>
        <div className="absolute inset-0 pointer-events-none">{inner}</div>
        <div className="relative rounded-xl overflow-hidden">{children}</div>
      </div>
    );
  }
  return inner;
};

interface BorderGlideProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  color?: string;
  width?: string;
  height?: string;
  opacity?: number;
  rx?: string;
  ry?: string;
}

function BorderGlide({
  children,
  className,
  style,
  duration = 3000,
  color = '#3b82f6',
  width = '6rem',
  height = '6rem',
  opacity = 0.8,
  rx = '0.75rem',
  ry = '0.75rem',
}: BorderGlideProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)} style={style}>
      <div className="absolute inset-0 pointer-events-none">
        <MovingBorder duration={duration} rx={rx} ry={ry} color={color} width={width} height={height} opacity={opacity} />
      </div>
      <div className="relative rounded-xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export { BorderGlide, MovingBorder };
