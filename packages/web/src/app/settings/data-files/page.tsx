"use client";

import { useCallback, useMemo, useState } from "react";
import { CommonEditorPanel } from "@/components/editor/editor-panel";
import { CommonCodeEditor } from "@/components/editor/common-code-editor";
import {
  getMediaType,
  type OpenFile,
} from "@/stores/editor";
import {
  getModel,
  getModelUri,
  getOrCreateModel,
} from "@/lib/monaco-models";
import { sdk } from "@/lib/sdk";
import type { FileNode } from "@agent-spaces/shared";

const DATA_EDITOR_ID = "data-files";

export default function DataFilesPage() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [modifiedFileContents, setModifiedFileContents] = useState<Record<string, string>>({});
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      setTree(await sdk.data.tree({ depth: 1 }));
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    try {
      const children = await sdk.data.tree({ path: dirPath, depth: 1 });
      const mergeChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map((node) => {
          if (node.path === dirPath) return { ...node, children };
          if (node.children) return { ...node, children: mergeChildren(node.children) };
          return node;
        });
      setTree((prev) => mergeChildren(prev));
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, []);

  const openFile = useCallback(async (path: string) => {
    const existing = openFiles.find((file) => file.path === path);
    if (existing) {
      setActiveFilePath(path);
      return;
    }

    const name = path.split("/").pop() || path;
    const mediaType = getMediaType(path);
    if (mediaType && mediaType !== "svg" && mediaType !== "markdown" && mediaType !== "mermaid") {
      setOpenFiles((prev) => [...prev, { path, name, content: "", modified: false, mediaType }]);
      setActiveFilePath(path);
      return;
    }

    const data = await sdk.data.content(path);
    setOpenFiles((prev) => [...prev, { path, name, content: data.content, modified: false, mediaType: mediaType || undefined }]);
    setActiveFilePath(path);
  }, [openFiles]);

  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activeFilePath),
    [activeFilePath, openFiles],
  );
  const activeContent = activeFile ? modifiedFileContents[activeFile.path] ?? activeFile.content : "";
  const mediaType = activeFile?.mediaType ?? (activeFilePath ? getMediaType(activeFilePath) : null);
  const mediaUrl = activeFilePath && mediaType
    ? `/api/data/files/content?path=${encodeURIComponent(activeFilePath)}&raw=true`
    : null;
  const modelPath = activeFilePath
    ? getModelUri(DATA_EDITOR_ID, activeFilePath).toString()
    : undefined;

  const handleChange = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => prev.map((file) => (
      file.path === path ? { ...file, modified: file.content.replace(/\r\n?/g, "\n") !== content.replace(/\r\n?/g, "\n") } : file
    )));
    setModifiedFileContents((prev) => {
      const file = openFiles.find((item) => item.path === path);
      if (!file) return prev;
      const next = { ...prev };
      if (file.content.replace(/\r\n?/g, "\n") === content.replace(/\r\n?/g, "\n")) {
        delete next[path];
      } else {
        next[path] = content;
      }
      return next;
    });
  }, [openFiles]);

  const handleSave = useCallback(async () => {
    if (!activeFilePath || !activeFile) return;
    const content = modifiedFileContents[activeFilePath] ?? activeFile.content;
    await sdk.data.save(activeFilePath, content);
    setOpenFiles((prev) => prev.map((file) => (
      file.path === activeFilePath ? { ...file, content, modified: false } : file
    )));
    setModifiedFileContents((prev) => {
      const next = { ...prev };
      delete next[activeFilePath];
      return next;
    });
    await loadTree();
  }, [activeFile, activeFilePath, loadTree, modifiedFileContents]);

  const handleRefreshActiveFile = useCallback(async () => {
    if (!activeFilePath || activeFile?.modified || (mediaType && mediaType !== "svg" && mediaType !== "markdown" && mediaType !== "mermaid")) return;
    const data = await sdk.data.content(activeFilePath);
    setOpenFiles((prev) => prev.map((file) => (
      file.path === activeFilePath ? { ...file, content: data.content } : file
    )));
  }, [activeFile?.modified, activeFilePath, mediaType]);

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="h-full w-80 shrink-0 border-r bg-background">
        <CommonEditorPanel
          storageKey="data-files"
          variant="project"
          showImport={false}
          showSearchPanel={false}
          api={{
            tree,
            treeLoading,
            loadingDirs,
            openFiles,
            loadTree,
            loadDirectory,
            openFile,
            saveEmptyFile: async (path) => {
              await sdk.data.save(path, "");
              await loadTree();
            },
            deletePath: async (path) => {
              await sdk.data.deleteFile(path);
              await loadTree();
            },
            renamePath: async (oldPath, newPath) => {
              await sdk.data.rename(oldPath, newPath);
              await loadTree();
            },
            copyPath: async (srcPath, destPath) => {
              await sdk.data.copy(srcPath, destPath);
              await loadTree();
            },
          }}
        />
      </aside>
      <main className="min-w-0 flex-1">
        <CommonCodeEditor
          activeFile={activeFile}
          activeFilePath={activeFilePath}
          activeContent={activeContent}
          modelPath={modelPath}
          mediaType={mediaType}
          mediaUrl={mediaUrl}
          isCommitDiff={false}
          commitDiffData={null}
          pendingJump={null}
          onChange={handleChange}
          onSave={handleSave}
          onRefreshActiveFile={handleRefreshActiveFile}
          onClearPendingJump={() => undefined}
          onGetExpectedModelPath={(path) => getModelUri(DATA_EDITOR_ID, path).path}
          onGetModel={(path) => getModel(DATA_EDITOR_ID, path)}
          onEnsureModel={(path, content) => getOrCreateModel(DATA_EDITOR_ID, path, content)}
          onRegisterNavigation={() => undefined}
        />
      </main>
    </div>
  );
}
