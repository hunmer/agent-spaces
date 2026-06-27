"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomShortcuts } from "@/stores/custom-shortcuts";
import { FloatingPanel } from "@/components/common/floating-panel";

/** 单个悬浮窗实例 */
interface FloatingInstance {
  /** 关联的 CustomShortcutItem.id，用于 toggle */
  shortcutId: string;
  /** mini-app 项目 id */
  projectId: string;
  /** 用户给该快捷键起的名称，作为面板标题 fallback */
  name: string;
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

  const toggleInstance = useCallback(
    (shortcutId: string, projectId: string, name: string) => {
      setInstances((prev) => {
        // 已存在则关闭（toggle）
        if (prev.some((it) => it.shortcutId === shortcutId)) {
          return prev.filter((it) => it.shortcutId !== shortcutId);
        }
        return [...prev, { shortcutId, projectId, name }];
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
        if (projectId) toggleInstance(item.id, projectId, item.name);
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
    const map = new Map(items.map((it) => [it.id, it.name]));
    setInstances((prev) =>
      prev.map((it) => {
        const next = map.get(it.shortcutId);
        return next && next !== it.name ? { ...it, name: next } : it;
      }),
    );
  }, [items]);

  return (
    <>
      {instances.map((inst) => (
        <FloatingPanel
          key={inst.shortcutId}
          id={`custom-shortcut:${inst.shortcutId}`}
          title={inst.name}
          defaultWidth={420}
          defaultHeight={560}
          minWidth={320}
          minHeight={300}
          onClose={() => closeInstance(inst.shortcutId)}
        >
          <iframe
            src={`/mini-apps-preview/?id=${encodeURIComponent(inst.projectId)}`}
            title={inst.name}
            className="h-full w-full border-0 bg-white"
          />
        </FloatingPanel>
      ))}
    </>
  );
}
