"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCustomShortcuts } from "@/stores/custom-shortcuts";
import { FloatingPanel } from "@/components/common/floating-panel";
import { MiniAppPreview } from "@/components/mini-apps/mini-app-preview";
import { sdk } from "@/lib/sdk";
import type { MiniAppProject } from "@agent-spaces/sdk";
import { Loader2 } from "lucide-react";

/** 单个悬浮窗实例的加载状态 */
interface FloatingInstance {
  /** 关联的 CustomShortcutItem.id，用于 toggle */
  shortcutId: string;
  projectId: string;
  loading: boolean;
  project: MiniAppProject | null;
  sourceCode: string;
  files: Record<string, string>;
  error: string | null;
}

async function loadMiniApp(projectId: string): Promise<Pick<FloatingInstance, 'project' | 'sourceCode' | 'files' | 'error'>> {
  try {
    const project = await sdk.miniApp.get(projectId);
    const tree = await sdk.miniApp.getFileTree(projectId);
    const files: Record<string, string> = {};
    for (const file of tree) {
      try {
        const { content } = await sdk.miniApp.readFile(projectId, file);
        files[file] = content;
      } catch {
        /* skip */
      }
    }
    const mainFile = tree.find((f) => f === project.mainFile);
    if (!mainFile) {
      return { project, sourceCode: '', files, error: `入口文件 ${project.mainFile} 未找到` };
    }
    return { project, sourceCode: files[mainFile] || '', files, error: null };
  } catch (err: unknown) {
    return {
      project: null,
      sourceCode: '',
      files: {},
      error: err instanceof Error ? err.message : 'Failed to load project',
    };
  }
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

  const openInstance = useCallback(async (shortcutId: string, projectId: string) => {
    // 已存在则关闭（toggle）
    if (instances.some((it) => it.shortcutId === shortcutId)) {
      closeInstance(shortcutId);
      return;
    }
    const placeholder: FloatingInstance = {
      shortcutId,
      projectId,
      loading: true,
      project: null,
      sourceCode: '',
      files: {},
      error: null,
    };
    setInstances((prev) => [...prev, placeholder]);
    const result = await loadMiniApp(projectId);
    setInstances((prev) =>
      prev.map((it) => (it.shortcutId === shortcutId ? { ...it, loading: false, ...result } : it)),
    );
  }, [instances, closeInstance]);

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
        if (projectId) openInstance(item.id, projectId);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openInstance]);

  // 若快捷键项被删除，关闭对应悬浮窗
  useEffect(() => {
    const ids = new Set(items.map((it) => it.id));
    setInstances((prev) => prev.filter((it) => ids.has(it.shortcutId)));
  }, [items]);

  return (
    <>
      {instances.map((inst) =>
        inst.loading || !inst.project ? (
          <div
            key={inst.shortcutId}
            className="fixed bottom-6 right-6 z-[99991] flex items-center gap-2 rounded-lg border bg-white dark:bg-zinc-900 px-3 py-2 shadow-xl text-xs"
          >
            {inst.loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span className="text-muted-foreground">{inst.error ?? 'Loading...'}</span>
            <button
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => closeInstance(inst.shortcutId)}
            >
              ✕
            </button>
          </div>
        ) : (
          <FloatingPanel
            key={inst.shortcutId}
            id={`custom-shortcut:${inst.shortcutId}`}
            title={inst.project.name}
            defaultWidth={420}
            defaultHeight={560}
            minWidth={320}
            minHeight={300}
            onClose={() => closeInstance(inst.shortcutId)}
          >
            <MiniAppPreview
              type={inst.project.type}
              sourceCode={inst.sourceCode}
              error={inst.error}
              onError={() => {
                /* 错误已由加载阶段处理 */
              }}
              projectId={inst.project.id}
              projectName={inst.project.name}
              enabledPlugins={inst.project.enabledPlugins}
              enableAgents={inst.project.enableAgents}
              files={inst.files}
              mainFile={inst.project.mainFile}
              hideHeader={false}
            />
          </FloatingPanel>
        ),
      )}
    </>
  );
}
