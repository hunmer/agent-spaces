"use client";

import { useEffect, useRef } from "react";

/**
 * 可复用 hook：给任意元素绑定鼠标移动 3D 倾斜效果。
 * 返回 ref，挂到目标元素即可。
 *
 * @param maxRotate 最大倾斜角度（度），默认 10
 * @param enabled   是否启用（false 时不绑定事件），默认 true
 */
export function useTiltCard<T extends HTMLElement>(maxRotate = 10, enabled = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const card = ref.current;
    if (!card || !enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateY = ((x - centerX) / centerX) * maxRotate;
      const rotateX = ((y - centerY) / centerY) * -maxRotate;

      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      // 供动态高光层使用
      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
    };

    const handleMouseLeave = () => {
      card.style.transform = "rotateX(0deg) rotateY(0deg)";
    };

    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [maxRotate, enabled]);

  return ref;
}

/**
 * FrostedGlassCard — 玻璃拟态卡片，鼠标移动时产生 3D 倾斜 + 动态高光。
 * 原始效果来自示例：mousemove 计算 rotateX/rotateY，mouseleave 复位。
 */
export function FrostedGlassCard() {
  const cardRef = useTiltCard<HTMLDivElement>();

  return (
    <div className="card-container [perspective:1000px]">
      <div
        ref={cardRef}
        className="card w-full max-w-md rounded-3xl p-8 text-white shadow-2xl bg-white/10 backdrop-blur-md border border-white/20 [transform-style:preserve-3d] transition-transform duration-200 ease-out"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Glassmorphism UI</h2>
            <p className="text-indigo-300">A New Design Trend</p>
          </div>
        </div>
        <p className="text-gray-300 leading-relaxed">
          This card uses the &quot;glassmorphism&quot; effect to create a sense of
          depth and transparency. The 3D tilt and dynamic glare are powered by
          JavaScript to create a futuristic and engaging user experience.
        </p>
      </div>
    </div>
  );
}

export default FrostedGlassCard;
