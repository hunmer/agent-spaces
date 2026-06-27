"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomShortcuts } from "@/stores/custom-shortcuts";
import { FloatingPanel } from "@/components/common/floating-panel";
import { FloatingBall } from "@/components/common/floating-ball";
import { Play } from "lucide-react";

/** 单个悬浮窗实例 */
interface FloatingInstance {
  /** 关联的 CustomShortcutItem.id，用于 toggle */
  shortcutId: string;
  /** mini-app 项目 id */
  projectId: string;
  /** 用户给该快捷键起的名称，作为面板标题 fallback */
  name: string;
  /** 是否启用悬浮球（最小化） */
  useFloatingBall: boolean;
  /** 当前是否处于最小化态（仅 useFloatingBall 时有效） */
  minimized: boolean;
}

/** 全局自定义快捷键执行器：监听快捷键，按 action 渲染悬浮窗 */
export function CustomShortcutExecutor() {
  const { items, matchEvent } = useCustomShortcuts();
  const matchEventRef = useRef(matchEvent);
  useEffect(() => {
    matchEventRef.current = matchEvent;
  });

  const [instances, setInstances] = useState<FloatingInstance[]>([]);

  const closeInstance = useCallback((shortcutId: string) => {
    setInstances((prev) => prev.filter((it) => it.shortcutId !== shortcutId));
  }, []);

  const updateInstance = useCallback((shortcutId: string, patch: Partial<FloatingInstance>) => {
    setInstances((prev) => prev.map((it) => (it.shortcutId === shortcutId ? { ...it, ...patch } : it)));
  }, []);

  const toggleInstance = useCallback(
    (shortcutId: string, projectId: string, name: string, useFloatingBall: boolean) => {
      setInstances((prev) => {
        // 已存在则关闭（toggle）
        if (prev.some((it) => it.shortcutId === shortcutId)) {
          return prev.filter((it) => it.shortcutId !== shortcutId);
        }
        return [...prev, { shortcutId, projectId, name, useFloatingBall, minimized: false }];
      });
    },
    [],
  );

  // 全局快捷键监听
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const item = matchEventRef.current(e);
      if (!item) return;
      // 输入框内不触发（避免与正常输入冲突）
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (item.actionType === 'openMiniAppFloating') {
        const projectId = item.params.miniAppId;
        if (projectId) {
          toggleInstance(item.id, projectId, item.name, item.params.useFloatingBall === 'true');
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleInstance]);

  // 若快捷键项被删除，关闭对应悬浮窗
  useEffect(() => {
    const ids = new Set(items.map((it) => it.id));
    setInstances((prev) => prev.filter((it) => ids.has(it.shortcutId)));
  }, [items]);

  // 同步快捷键项名称变化（标题）
  useEffect(() => {
    const map = new Map(items.map((it) => [it.id, { name: it.name, useFloatingBall: it.params.useFloatingBall === 'true' }]));
    setInstances((prev) =>
      prev.map((it) => {
        const next = map.get(it.shortcutId);
        if (!next) return it;
        const patch: Partial<FloatingInstance> = {};
        if (next.name !== it.name) patch.name = next.name;
        if (next.useFloatingBall !== it.useFloatingBall) {
          patch.useFloatingBall = next.useFloatingBall;
          // 关闭悬浮球时，若处于最小化态则恢复
          if (!next.useFloatingBall && it.minimized) patch.minimized = false;
        }
        return Object.keys(patch).length ? { ...it, ...patch } : it;
      }),
    );
  }, [items]);

  return (
    <>
      {instances.map((inst) => {
        const showBall = inst.useFloatingBall && inst.minimized;
        return (
          <div key={inst.shortcutId}>
            {/* 悬浮面板：始终挂载（保活 iframe），最小化态用 CSS 隐藏而非卸载 */}
            <div style={{ display: showBall ? 'none' : undefined }}>
              <FloatingPanel
                id={`custom-shortcut:${inst.shortcutId}`}
                title={inst.name}
                defaultWidth={420}
                defaultHeight={560}
                minWidth={320}
                minHeight={300}
                onClose={() => closeInstance(inst.shortcutId)}
                onMinimize={inst.useFloatingBall ? () => updateInstance(inst.shortcutId, { minimized: true }) : undefined}
              >
                <iframe
                  src={`/mini-apps-preview/?id=${encodeURIComponent(inst.projectId)}`}
                  title={inst.name}
                  className="h-full w-full border-0 bg-white"
                />
              </FloatingPanel>
            </div>

            {/* 悬浮球（仅 useFloatingBall 开启时存在；最小化态显示，否则隐藏但保留位置记忆） */}
            {inst.useFloatingBall && (
              <FloatingBall
                lsKey={`custom-shortcut-ball:${inst.shortcutId}`}
                visible={showBall}
                onClick={() => updateInstance(inst.shortcutId, { minimized: false })}
              >
                <Play className="size-5" />
              </FloatingBall>
            )}
          </div>
        );
      })}
    </>
  );
}
