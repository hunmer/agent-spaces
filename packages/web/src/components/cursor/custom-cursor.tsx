"use client";

// 全局自定义鼠标光标引擎（React 移植自 code_artifact.html「Cursor Studio」）。
// 挂载在根布局：Canvas 拖尾 + 外环/内点 DOM 光标 + Web Audio 合成音效。
// 样式选择与开关由 lib/cursor-style.ts 管理，经 CURSOR_CHANGE_EVENT 热更新。

import { useEffect, useRef, useState } from "react";
import {
  CURSOR_CHANGE_EVENT,
  CURSOR_STYLES,
  getCursorStyle,
  isCursorSoundEnabled,
  getCursorTrailMultiplier,
  loadCursorSettings,
} from "@/lib/cursor-style";

/** 悬停时外环会吸附包裹的交互元素；带 data-cursor-focus 的元素额外获得磁吸牵引 */
const HOVER_SELECTOR = [
  "[data-cursor-focus]",
  "button",
  "a",
  "[role='button']",
  "[role='menuitem']",
  "[role='option']",
  "[role='tab']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='slider']",
  "select",
  "summary",
  "label",
].join(", ");

// 超大矩形（整块面板）不包裹，只按常规尺寸跟随
const MAX_WRAP_WIDTH = 720;
const MAX_WRAP_HEIGHT = 320;

class SoundSynth {
  private ctx: AudioContext | null = null;
  enabled = false;

  private init() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  playClick(mode: number, isUp = false) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    const mult = isUp ? 1.25 : 1;

    if (mode === 0) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(520 * mult, now);
      osc.frequency.exponentialRampToValueAtTime(220 * mult, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (mode === 1) {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(580 * mult, now);
      osc.frequency.exponentialRampToValueAtTime(960 * mult, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (mode === 2) {
      osc.type = "square";
      osc.frequency.setValueAtTime(920 * mult, now);
      osc.frequency.setValueAtTime(1320 * mult, now + 0.025);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (mode === 3) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(740 * mult, now);
      osc.frequency.exponentialRampToValueAtTime(1480 * mult, now + 0.11);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(280 * mult, now);
      osc.frequency.exponentialRampToValueAtTime(620 * mult, now + 0.11);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    }
  }

  playHover() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.035);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  color: string;
  rot: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

export function CustomCursor() {
  const [active, setActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // 读取设置并订阅热更新（选择样式/音效/拖尾立即生效）
  useEffect(() => {
    loadCursorSettings();
    const sync = () => {
      setActive(Boolean(getCursorStyle()));
    };
    sync();
    window.addEventListener(CURSOR_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CURSOR_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    // 触屏设备无鼠标，不启用
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const canvas = canvasRef.current;
    const cursorInner = innerRef.current;
    const cursorOuter = outerRef.current;
    if (!canvas || !cursorInner || !cursorOuter) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const brackets = Array.from(
      cursorOuter.querySelectorAll<HTMLSpanElement>(".cursor-bracket"),
    );

    let width = window.innerWidth;
    let height = window.innerHeight;

    function resizeCanvas() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();

    const state = {
      mouseX: width / 2,
      mouseY: height / 2,
      prevX: width / 2,
      prevY: height / 2,
      outerX: width / 2,
      outerY: height / 2,
      outerW: 34,
      outerH: 34,
      outerRadius: 999,
      speed: 0,      isDown: false,
      clickScale: 1,
      hoveredEl: null as HTMLElement | null,
      magneticEl: null as HTMLElement | null,
      // 移出悬停元素的瞬间置 true：尺寸立即回弹，不做宽→圆形变
      snapSize: false,
      angle: 0,
    };

    const trailPoints: TrailPoint[] = [];
    const particles: Particle[] = [];
    const ripples: Ripple[] = [];
    const sound = new SoundSynth();

    function currentConfig() {
      return getCursorStyle() ?? CURSOR_STYLES[0];
    }

    function modeIndex() {
      const cfg = currentConfig();
      const idx = CURSOR_STYLES.indexOf(cfg);
      return idx >= 0 ? idx : 0;
    }

    function getActiveColor() {
      const cfg = currentConfig();
      const isDark = document.documentElement.classList.contains("dark");
      return isDark ? cfg.colorDark : cfg.colorLight;
    }

    function spawnParticles(x: number, y: number, count: number, burst = false) {
      const color = getActiveColor();
      const multiplier = getCursorTrailMultiplier();
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = burst
          ? 1.5 + Math.random() * 4.5
          : 0.3 + Math.random() * 1.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          size: burst ? 2.5 + Math.random() * 3.5 : 1.8 + Math.random() * 2.5,
          alpha: 1,
          decay: (0.018 + Math.random() * 0.02) / multiplier,
          color,
          rot: Math.random() * Math.PI,
        });
      }
    }

    function resetMagnetic() {
      if (state.magneticEl) {
        state.magneticEl.style.transform = "translate3d(0px, 0px, 0px)";
        state.magneticEl = null;
      }
    }

    function setHovered(el: HTMLElement | null) {
      if (state.hoveredEl === el) return;
      // 移出悬停元素：下一帧尺寸立即回弹，避免宽→圆形变过程中
      // 尺寸(0.22)与位置(cfg.lerp)插值速度不一致导致的左右不对称收缩
      if (state.hoveredEl && !el) state.snapSize = true;
      state.hoveredEl = el;
      if (el) {
        state.snapSize = false;
        sound.playHover();
      }
    }

    function onResize() {
      resizeCanvas();
    }

    function onMouseMove(e: MouseEvent) {
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;

      const dx = state.mouseX - state.prevX;
      const dy = state.mouseY - state.prevY;
      state.speed = Math.min(Math.hypot(dx, dy), 60);
      state.prevX = state.mouseX;
      state.prevY = state.mouseY;

      const cfg = currentConfig();
      trailPoints.push({
        x: state.mouseX,
        y: state.mouseY,
        alpha: 1,
        size: cfg.innerSize,
      });

      const maxPts = Math.floor(24 * getCursorTrailMultiplier());
      while (trailPoints.length > maxPts) trailPoints.shift();

      if (modeIndex() === 3 && state.speed > 1.2) {
        spawnParticles(state.mouseX, state.mouseY, 1, false);
      }

      // 悬停吸附检测：最近的可交互祖先
      const target = e.target as Element | Document | null;
      const el =
        target && typeof (target as Element).closest === "function"
          ? ((target as Element).closest(HOVER_SELECTOR) as HTMLElement | null)
          : null;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > MAX_WRAP_WIDTH || rect.height > MAX_WRAP_HEIGHT) {
          setHovered(null);
        } else {
          setHovered(el);
        }
      } else {
        setHovered(null);
      }

      // 仅显式标记 data-cursor-focus 的元素做磁吸牵引，避免影响常规布局
      const magnetic = el?.closest("[data-cursor-focus]") as HTMLElement | null;
      if (magnetic !== state.magneticEl) {
        resetMagnetic();
        state.magneticEl = magnetic;
      }
      if (state.magneticEl && state.magneticEl === state.hoveredEl) {
        const rect = state.magneticEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const pullFactor = 0.22;
        const moveX = (state.mouseX - centerX) * pullFactor;
        const moveY = (state.mouseY - centerY) * pullFactor;
        state.magneticEl.style.transform = `translate3d(${moveX.toFixed(1)}px, ${moveY.toFixed(1)}px, 0)`;
      }
    }

    function onMouseDown(e: MouseEvent) {
      state.isDown = true;
      sound.playClick(modeIndex(), false);

      ripples.push({
        x: e.clientX,
        y: e.clientY,
        radius: 6,
        maxRadius: state.hoveredEl ? 58 : 44,
        alpha: 0.85,
        color: getActiveColor(),
      });

      if (modeIndex() === 3 || modeIndex() === 2) {
        spawnParticles(e.clientX, e.clientY, 12, true);
      }
    }

    function onMouseUp() {
      if (state.isDown) {
        state.isDown = false;
        sound.playClick(modeIndex(), true);
      }
    }

    function renderCanvasTrails() {
      ctx!.clearRect(0, 0, width, height);
      const color = getActiveColor();
      const mode = modeIndex();
      const multiplier = getCursorTrailMultiplier();

      for (let i = 0; i < trailPoints.length; i++) {
        trailPoints[i].alpha -= 0.032 / multiplier;
      }
      while (trailPoints.length > 0 && trailPoints[0].alpha <= 0) {
        trailPoints.shift();
      }

      if (mode === 0 && trailPoints.length > 1) {
        for (let i = 0; i < trailPoints.length; i += 2) {
          const pt = trailPoints[i];
          const ratio = i / trailPoints.length;
          ctx!.beginPath();
          ctx!.arc(pt.x, pt.y, ratio * 11, 0, Math.PI * 2);
          ctx!.strokeStyle = color;
          ctx!.globalAlpha = Math.max(0, pt.alpha * ratio * 0.45);
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
        }
      } else if (mode === 1 && trailPoints.length > 2) {
        for (let i = 1; i < trailPoints.length - 1; i++) {
          const ratio = i / trailPoints.length;
          const xc = (trailPoints[i].x + trailPoints[i + 1].x) / 2;
          const yc = (trailPoints[i].y + trailPoints[i + 1].y) / 2;
          ctx!.beginPath();
          ctx!.moveTo(trailPoints[i - 1].x, trailPoints[i - 1].y);
          ctx!.quadraticCurveTo(trailPoints[i].x, trailPoints[i].y, xc, yc);
          ctx!.strokeStyle = color;
          ctx!.lineCap = "round";
          ctx!.lineWidth = ratio * 9;
          ctx!.globalAlpha = Math.max(0, ratio * 0.65);
          ctx!.stroke();
        }
      } else if (mode === 2 && trailPoints.length > 1) {
        for (let i = 0; i < trailPoints.length; i += 2) {
          const pt = trailPoints[i];
          const ratio = i / trailPoints.length;
          const sz = ratio * 16;
          ctx!.save();
          ctx!.translate(pt.x, pt.y);
          ctx!.rotate(ratio * Math.PI * 0.5);
          ctx!.strokeStyle = color;
          ctx!.globalAlpha = Math.max(0, pt.alpha * ratio * 0.45);
          ctx!.lineWidth = 1.2;
          ctx!.strokeRect(-sz / 2, -sz / 2, sz, sz);
          ctx!.restore();
        }
      } else if (mode === 4 && trailPoints.length > 1) {
        for (let i = 0; i < trailPoints.length; i++) {
          const pt = trailPoints[i];
          const ratio = i / trailPoints.length;
          ctx!.beginPath();
          ctx!.arc(pt.x, pt.y, ratio * 9, 0, Math.PI * 2);
          ctx!.fillStyle = color;
          ctx!.globalAlpha = Math.max(0, pt.alpha * ratio * 0.38);
          ctx!.fill();
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        p.rot += 0.08;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = Math.max(0, p.alpha);
        ctx!.beginPath();
        for (let j = 0; j < 4; j++) {
          ctx!.lineTo(
            Math.cos((j * Math.PI) / 2) * p.size,
            Math.sin((j * Math.PI) / 2) * p.size,
          );
          ctx!.lineTo(
            Math.cos(((j + 0.5) * Math.PI) / 2) * (p.size * 0.4),
            Math.sin(((j + 0.5) * Math.PI) / 2) * (p.size * 0.4),
          );
        }
        ctx!.closePath();
        ctx!.fill();
        ctx!.restore();
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += (r.maxRadius - r.radius) * 0.16;
        r.alpha -= 0.032;

        if (r.alpha <= 0) {
          ripples.splice(i, 1);
          continue;
        }

        ctx!.beginPath();
        ctx!.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx!.strokeStyle = r.color;
        ctx!.lineWidth = 2;
        ctx!.globalAlpha = Math.max(0, r.alpha);
        ctx!.stroke();
      }

      ctx!.globalAlpha = 1;
    }

    let rafId = 0;

    function animate() {
      const cfg = currentConfig();
      const mode = modeIndex();
      const color = getActiveColor();
      sound.enabled = isCursorSoundEnabled();
      state.angle += 1.2 + state.speed * 0.15;

      let targetX = state.mouseX;
      let targetY = state.mouseY;
      let targetW = cfg.outerSize;
      let targetH = cfg.outerSize;
      let targetRadius = mode === 2 ? 4 : 999;

      if (state.hoveredEl) {
        const rect = state.hoveredEl.getBoundingClientRect();
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
        targetW = rect.width + 10;
        targetH = rect.height + 10;
        const computedStyle = window.getComputedStyle(state.hoveredEl);
        targetRadius = parseFloat(computedStyle.borderRadius) + 4 || 14;
      }

      if (state.snapSize && !state.hoveredEl) {
        // 刚移出按钮：宽高/圆角直接 snap 回圆形目标值，只保留位置平滑跟随
        state.outerW = targetW;
        state.outerH = targetH;
        state.outerRadius = targetRadius;
        state.snapSize = false;
      } else {
        state.outerW += (targetW - state.outerW) * 0.22;
        state.outerH += (targetH - state.outerH) * 0.22;
        state.outerRadius += (targetRadius - state.outerRadius) * 0.22;
      }
      state.outerX += (targetX - state.outerX) * cfg.lerp;
      state.outerY += (targetY - state.outerY) * cfg.lerp;

      const targetScale = state.isDown ? 0.68 : 1;
      state.clickScale += (targetScale - state.clickScale) * 0.25;

      const innerScale = state.isDown
        ? 1.45
        : state.hoveredEl
          ? 0.55
          : 1;
      const innerSize = cfg.innerSize;

      cursorInner!.style.width = `${innerSize}px`;
      cursorInner!.style.height = `${innerSize}px`;
      cursorInner!.style.backgroundColor = color;
      cursorInner!.style.borderRadius = mode === 2 ? "2px" : "9999px";
      cursorInner!.style.boxShadow = `0 0 12px ${color}`;
      cursorInner!.style.transform = `translate3d(${state.mouseX - innerSize / 2}px, ${state.mouseY - innerSize / 2}px, 0) scale(${innerScale}) rotate(${mode === 2 || mode === 3 ? state.angle : 0}deg)`;

      cursorOuter!.style.width = `${state.outerW}px`;
      cursorOuter!.style.height = `${state.outerH}px`;
      cursorOuter!.style.borderRadius = `${state.outerRadius}px`;
      cursorOuter!.style.color = color;
      for (const b of brackets) {
        b.style.opacity = mode === 2 ? "1" : "0";
      }

      if (mode === 2) {
        cursorOuter!.style.border = state.hoveredEl
          ? `1.5px solid ${color}`
          : `1px dashed ${color}`;
        cursorOuter!.style.backgroundColor = state.hoveredEl
          ? `${color}12`
          : "transparent";
      } else if (mode === 4) {
        cursorOuter!.style.border = `2px solid ${color}`;
        cursorOuter!.style.backgroundColor = `${color}18`;
      } else {
        cursorOuter!.style.border = `1.5px solid ${color}`;
        cursorOuter!.style.backgroundColor = state.hoveredEl
          ? `${color}14`
          : "transparent";
      }

      let stretchTransform = "";
      if (mode === 4 && !state.hoveredEl) {
        // 固定左右形变：不做随移动方向的旋转（原版 rotate(moveAngle) 会导致
        // 从按钮纵向移出时光标上下拉伸），仅按速率水平拉伸
        const stretch = Math.min(state.speed * 0.025, 0.55);
        stretchTransform = ` scale(${1 + stretch}, ${1 - stretch * 0.45})`;
      } else if (mode === 2 && !state.hoveredEl) {
        stretchTransform = ` rotate(${state.angle * 0.35}deg)`;
      }

      cursorOuter!.style.transform = `translate3d(${state.outerX - state.outerW / 2}px, ${state.outerY - state.outerH / 2}px, 0) scale(${state.clickScale})${stretchTransform}`;

      state.speed *= 0.85;
      renderCanvasTrails();
      rafId = requestAnimationFrame(animate);
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      resetMagnetic();
      ctx!.clearRect(0, 0, width, height);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[9998]"
        aria-hidden
      />
      <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
        <div
          ref={outerRef}
          className="fixed top-0 left-0 pointer-events-none flex items-center justify-center"
        >
          <span className="cursor-bracket absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current opacity-0 transition-opacity duration-200" />
          <span className="cursor-bracket absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-current opacity-0 transition-opacity duration-200" />
          <span className="cursor-bracket absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-current opacity-0 transition-opacity duration-200" />
          <span className="cursor-bracket absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current opacity-0 transition-opacity duration-200" />
        </div>
        <div
          ref={innerRef}
          className="fixed top-0 left-0 pointer-events-none flex items-center justify-center"
        />
      </div>
    </>
  );
}
