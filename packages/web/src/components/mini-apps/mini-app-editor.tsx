"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Share2, Puzzle, FolderOpen, Copy, Upload } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { MiniAppPreviewToolbar } from './mini-app-preview-toolbar';
import { MiniAppChat } from './mini-app-chat';
import { PluginToolDialog } from '@/components/workflow/plugin-tool-dialog';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { BackButton } from '@/components/common/back-button';
import { ShareDialog } from '@/components/common/share-dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/editor/file-tree';
import { FileIconImg, FolderIconImg } from '@/components/editor/file-icon';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';

const FILE_POLL_INTERVAL_MS = 2000;

/** Convert flat file paths into a nested tree structure */
interface TreeNode {
    name: string;
    path: string;
    children: TreeNode[];
    isFile: boolean;
}

function buildFileTree(files: string[]): TreeNode[] {
    const root: TreeNode[] = [];
    for (const filePath of files) {
        const parts = filePath.split('/');
        let current = root;
        let currentPath = '';
        for (let i = 0; i < parts.length; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            const isFile = i === parts.length - 1;
            let node = current.find((n) => n.name === parts[i]);
            if (!node) {
                node = { name: parts[i], path: currentPath, children: [], isFile };
                current.push(node);
            }
            current = node.children;
        }
    }
    // Sort: folders first, then files; alphabetical within each group
    const sortNodes = (nodes: TreeNode[]) =>
        nodes.sort((a, b) => {
            if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
            return a.name.localeCompare(b.name);
        });
    const sortRecursive = (nodes: TreeNode[]) => {
        sortNodes(nodes);
        nodes.forEach((n) => sortRecursive(n.children));
    };
    sortRecursive(root);
    return root;
}

/** Collect all folder paths for default-expanded state */
function collectFolderPaths(nodes: TreeNode[]): string[] {
    const paths: string[] = [];
    for (const node of nodes) {
        if (!node.isFile) {
            paths.push(node.path);
            paths.push(...collectFolderPaths(node.children));
        }
    }
    return paths;
}

/** Recursively render tree nodes with folder/file icons */
function renderTreeNodes(nodes: TreeNode[]) {
    return nodes.map((node) =>
        node.isFile ? (
            <FileTreeFile key={node.path} path={node.path} name={node.name} icon={<FileIconImg name={node.name} />} />
        ) : (
            <FileTreeFolder key={node.path} path={node.path} name={node.name} folderIcon={(isOpen) => <FolderIconImg name={node.name} isOpen={isOpen} />}>
                {renderTreeNodes(node.children)}
            </FileTreeFolder>
        ),
    );
}

function areFileListsEqual(left: string[], right: string[]) {
    return left.length === right.length && left.every((file, index) => file === right[index]);
}

async function readFiles(projectId: string, files: string[]): Promise<Record<string, string>> {
    const contents: Record<string, string> = {};
    for (const file of files) {
        try {
            const { content } = await sdk.miniApp.readFile(projectId, file);
            contents[file] = content;
        } catch { /* skip unreadable files */ }
    }
    return contents;
}

type FileManifest = { path: string; mtimeMs: number };

/** Files changed between two manifests: added, modified, or removed paths. */
function diffManifest(prev: Record<string, number>, next: FileManifest[]): { changed: string[]; removed: string[] } {
    const changed: string[] = [];
    const removed: string[] = [];
    for (const entry of next) {
        if (prev[entry.path] !== entry.mtimeMs) changed.push(entry.path);
    }
    for (const path of Object.keys(prev)) {
        if (!next.some((entry) => entry.path === path)) removed.push(path);
    }
    return { changed, removed };
}

interface MiniAppEditorProps {
    projectId: string;
}

export function MiniAppEditor({ projectId }: MiniAppEditorProps) {
    const t = useTranslations('mini-apps');
    const [project, setProject] = useState<MiniAppProject | null>(null);
    const [files, setFiles] = useState<string[]>([]);
    const [activeFile, setActiveFile] = useState<string>('');
    const [sourceCode, setSourceCode] = useState('');
    const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [loading, setLoading] = useState(true);
    const [pluginDialogOpen, setPluginDialogOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);

    const shareUrl = (() => {
        if (typeof window === 'undefined') return '';
        let route = '';
        try { route = new URLSearchParams(window.location.search).get('route') || ''; } catch { /* noop */ }
        const base = `${window.location.origin}/mini-apps-preview/${encodeURIComponent(projectId)}`;
        return route ? `${base}?route=${encodeURIComponent(route)}` : base;
    })();
    const localDirtyRef = useRef(false);
    const loadedFileContentRef = useRef('');
    const filesRef = useRef<string[]>([]);
    const filesContentRef = useRef<Record<string, string>>({});
    const fileMtimeRef = useRef<Record<string, number>>({});
    const [saveStatus, setSaveStatus] = useState<'saved' | 'modified' | 'saving'>('saved');
    const handleSaveRef = useRef<() => Promise<void>>(async () => { });
    const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

    const refreshPreviewFrame = useCallback(() => {
        setPreviewRefreshKey((key) => key + 1);
    }, []);

    // Load project
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const p = await sdk.miniApp.get(projectId);
                const manifest = await sdk.miniApp.getFileManifest(projectId);
                if (cancelled) return;
                const tree = manifest.map((entry) => entry.path);
                setProject(p);
                setFiles(tree);
                filesRef.current = tree;

                // Build mtime baseline + read all contents once (for import resolution).
                const mtimeMap: Record<string, number> = {};
                for (const entry of manifest) mtimeMap[entry.path] = entry.mtimeMs;
                fileMtimeRef.current = mtimeMap;

                const contents = await readFiles(projectId, tree);
                filesContentRef.current = contents;

                if (tree.length > 0) {
                    const mainFile = tree.includes(p.mainFile) ? p.mainFile : tree[0];
                    setActiveFile(mainFile);
                    const mainContent = contents[mainFile] || '';
                    if (!cancelled) {
                        setSourceCode(mainContent);
                        refreshPreviewFrame();
                        loadedFileContentRef.current = mainContent;
                        localDirtyRef.current = false;
                        setSaveStatus('saved');
                    }
                }
            } catch (error) {
                console.error('Failed to load project:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [projectId, refreshPreviewFrame]);

    const refreshFileTree = useCallback(async (): Promise<FileManifest[] | null> => {
        try {
            const manifest = await sdk.miniApp.getFileManifest(projectId);
            const tree = manifest.map((entry) => entry.path);
            if (!areFileListsEqual(filesRef.current, tree)) {
                filesRef.current = tree;
                setFiles(tree);
            }
            return manifest;
        } catch (error) {
            console.error('Failed to refresh file tree:', error);
            return null;
        }
    }, [projectId]);

    const refreshProjectFiles = useCallback(async (
        manifest: FileManifest[],
        options?: { force?: boolean; syncPreview?: boolean },
    ) => {
        if (!activeFile) return;

        try {
            const nextMtime: Record<string, number> = {};
            for (const entry of manifest) nextMtime[entry.path] = entry.mtimeMs;

            // force: re-read everything. Otherwise only read files whose mtime changed.
            const changed = options?.force
                ? manifest.map((entry) => entry.path)
                : diffManifest(fileMtimeRef.current, manifest).changed;
            const removed = options?.force ? [] : diffManifest(fileMtimeRef.current, manifest).removed;

            fileMtimeRef.current = nextMtime;

            // Drop removed files from cache before merging.
            if (removed.length > 0) {
                for (const path of removed) delete filesContentRef.current[path];
            }

            let contentChanged = removed.length > 0;

            if (changed.length > 0) {
                const fetched = await readFiles(projectId, changed);
                for (const [file, nextContent] of Object.entries(fetched)) {
                    if (filesContentRef.current[file] !== nextContent) contentChanged = true;
                    filesContentRef.current[file] = nextContent;
                }
            }

            const content = filesContentRef.current[activeFile];
            if (content === undefined) {
                if (options?.syncPreview) {
                    refreshPreviewFrame();
                }
                return;
            }

            const fileChanged = content !== loadedFileContentRef.current;
            const shouldUpdateEditor = options?.force || !localDirtyRef.current;

            if (shouldUpdateEditor) {
                loadedFileContentRef.current = content;
                localDirtyRef.current = false;
                setSaveStatus('saved');
                setSourceCode(content);
            }

            if (options?.syncPreview && (contentChanged || fileChanged || options?.force)) {
                refreshPreviewFrame();
            }
        } catch (error) {
            console.error('Failed to refresh workflow UI files:', error);
        }
    }, [projectId, activeFile, refreshPreviewFrame]);

    // Poll latest files written outside this editor, for example by workflow UI agents.
    useEffect(() => {
        if (!activeFile) return;

        const interval = setInterval(() => {
            refreshFileTree().then((tree) => {
                if (tree) refreshProjectFiles(tree, { syncPreview: autoRefresh });
            });
        }, FILE_POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [activeFile, autoRefresh, refreshFileTree, refreshProjectFiles]);

    const handleSave = useCallback(async () => {
        if (!activeFile) return;
        try {
            setSaveStatus('saving');
            await sdk.miniApp.writeFile(projectId, activeFile, sourceCode);
            loadedFileContentRef.current = sourceCode;
            filesContentRef.current[activeFile] = sourceCode;
            localDirtyRef.current = false;
            setSaveStatus('saved');
            refreshPreviewFrame();
        } catch (error) {
            console.error('Failed to save file:', error);
            setSaveStatus(localDirtyRef.current ? 'modified' : 'saved');
        }
    }, [projectId, activeFile, sourceCode, refreshPreviewFrame]);

    useEffect(() => {
        handleSaveRef.current = handleSave;
    }, [handleSave]);

    // ---- 路由同步：iframe <-> 宿主页 URL ----
    // 接收 iframe Router 的 route 变化，写进宿主页 URL（replaceState，保留 embedded/refresh）。
    // iframe load 后把宿主当前 route 透传回去（手动刷新 key 变导致 iframe reload 丢 hash）。
    useEffect(() => {
        if (!project) return;
        const ROUTE_MSG_SOURCE = 'agent-spaces:mini-app-router';

        const syncRouteToHostUrl = (route: string) => {
            try {
                const url = new URL(window.location.href);
                if (route) url.searchParams.set('route', route);
                else url.searchParams.delete('route');
                window.history.replaceState(null, '', url.pathname + url.search);
            } catch { /* noop */ }
        };

        const onMessage = (e: MessageEvent) => {
            const iframe = previewIframeRef.current;
            if (!iframe || e.source !== iframe.contentWindow) return;
            const data = e.data;
            if (!data || data.source !== ROUTE_MSG_SOURCE) return;
            if (data.projectId && data.projectId !== project.id) return;
            syncRouteToHostUrl(typeof data.route === 'string' ? data.route : '');
        };

        const sendRouteToIframe = () => {
            const iframe = previewIframeRef.current;
            if (!iframe?.contentWindow) return;
            let route = '';
            try { route = new URLSearchParams(window.location.search).get('route') || ''; } catch { /* noop */ }
            iframe.contentWindow.postMessage(
                { source: ROUTE_MSG_SOURCE + ':init', projectId: project.id, route },
                '*',
            );
        };

        window.addEventListener('message', onMessage);
        const iframe = previewIframeRef.current;
        if (iframe) {
            iframe.addEventListener('load', sendRouteToIframe);
        }
        return () => {
            window.removeEventListener('message', onMessage);
            if (iframe) iframe.removeEventListener('load', sendRouteToIframe);
        };
    }, [project, previewRefreshKey]);

    const handleManualRefresh = useCallback(async () => {
        const tree = await refreshFileTree();
        if (tree) await refreshProjectFiles(tree, { force: true, syncPreview: true });
    }, [refreshFileTree, refreshProjectFiles]);

    const handleFileSelect = useCallback(async (file: string) => {
        // Save current file and update cache
        if (activeFile && sourceCode) {
            await sdk.miniApp.writeFile(projectId, activeFile, sourceCode).catch(() => { });
            filesContentRef.current[activeFile] = sourceCode;
            loadedFileContentRef.current = sourceCode;
            localDirtyRef.current = false;
            setSaveStatus('saved');
        }
        try {
            const { content } = await sdk.miniApp.readFile(projectId, file);
            setActiveFile(file);
            setSourceCode(content);
            filesContentRef.current[file] = content;
            loadedFileContentRef.current = content;
            localDirtyRef.current = false;
            setSaveStatus('saved');
        } catch (error) {
            console.error('Failed to load file:', error);
        }
    }, [projectId, activeFile, sourceCode]);

    const uploadInputRef = useRef<HTMLInputElement | null>(null);

    const handleUploadFiles = useCallback(async (selected: FileList | null) => {
        if (!selected || selected.length === 0) return;
        const folder = activeFile.includes('/') ? activeFile.slice(0, activeFile.lastIndexOf('/')) : '';
        const formData = new FormData();
        for (const file of Array.from(selected)) formData.append('files', file);
        if (folder) formData.append('folder', folder);
        try {
            await sdk.miniApp.uploadFiles(projectId, formData);
            const tree = await refreshFileTree();
            if (tree) await refreshProjectFiles(tree, { force: true, syncPreview: true });
        } catch (error) {
            console.error('Failed to upload files:', error);
        }
    }, [projectId, activeFile, refreshFileTree, refreshProjectFiles]);

    // Unified path-input dialog for create file / create folder / rename / move / copy.
    type PathDialogState = {
        open: boolean;
        mode: 'newFile' | 'newFolder' | 'rename' | 'move' | 'copy';
        baseDir: string;   // target dir for create; source path for rename/move/copy
        value: string;
    };
    const [pathDialog, setPathDialog] = useState<PathDialogState>({ open: false, mode: 'newFile', baseDir: '', value: '' });
    const pathDialogT = useTranslations('mini-apps.editor.pathDialog');

    const refreshAfter = useCallback(async () => {
        const tree = await refreshFileTree();
        if (tree) await refreshProjectFiles(tree, { force: true, syncPreview: true });
    }, [refreshFileTree, refreshProjectFiles]);

    const handleDeleteFile = useCallback(async (path: string) => {
        try {
            await sdk.miniApp.deleteFile(projectId, path);
            await refreshAfter();
        } catch (error) {
            console.error('Failed to delete file:', error);
        }
    }, [projectId, refreshAfter]);

    const openCreateDialog = useCallback((mode: 'newFile' | 'newFolder', targetDir: string) => {
        const dir = mode === 'newFolder' && targetDir ? targetDir : targetDir;
        setPathDialog({ open: true, mode, baseDir: dir, value: '' });
    }, []);

    const handleCreateFile = useCallback((targetDir: string) => openCreateDialog('newFile', targetDir), [openCreateDialog]);
    const handleCreateFolder = useCallback((targetDir: string) => openCreateDialog('newFolder', targetDir), [openCreateDialog]);

    const handleRenameFile = useCallback((path: string) => {
        const name = path.split('/').pop() || '';
        setPathDialog({ open: true, mode: 'rename', baseDir: path, value: name });
    }, []);

    const handleMoveFile = useCallback((path: string) => {
        const dir = path.substring(0, path.lastIndexOf('/'));
        setPathDialog({ open: true, mode: 'move', baseDir: path, value: dir });
    }, []);

    const handleCopyFile = useCallback((path: string) => {
        const dir = path.substring(0, path.lastIndexOf('/'));
        setPathDialog({ open: true, mode: 'copy', baseDir: path, value: dir });
    }, []);

    const handlePathDialogConfirm = useCallback(async () => {
        const { mode, baseDir, value } = pathDialog;
        const trimmed = value.trim();
        if (!trimmed) return;
        try {
            if (mode === 'newFile') {
                const rel = baseDir ? `${baseDir}/${trimmed}` : trimmed;
                await sdk.miniApp.writeFile(projectId, rel, '');
            } else if (mode === 'newFolder') {
                const rel = baseDir ? `${baseDir}/${trimmed}` : trimmed;
                await sdk.miniApp.createFolder(projectId, rel);
            } else if (mode === 'rename') {
                const dir = baseDir.substring(0, baseDir.lastIndexOf('/'));
                const newName = trimmed.includes('/') ? trimmed.split('/').pop()! : trimmed;
                const to = dir ? `${dir}/${newName}` : newName;
                await sdk.miniApp.renameFile(projectId, baseDir, to);
            } else if (mode === 'move') {
                const name = baseDir.split('/').pop() || '';
                const to = trimmed ? `${trimmed}/${name}` : name;
                await sdk.miniApp.renameFile(projectId, baseDir, to);
            } else if (mode === 'copy') {
                const { content } = await sdk.miniApp.readFile(projectId, baseDir);
                const name = baseDir.split('/').pop() || '';
                const to = trimmed ? `${trimmed}/${name}` : name;
                await sdk.miniApp.writeFile(projectId, to, content);
            }
            await refreshAfter();
            setPathDialog(s => ({ ...s, open: false }));
        } catch (error) {
            console.error('Failed to perform file operation:', error);
        }
    }, [pathDialog, projectId, refreshAfter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!project) {
        return <div className="p-4 text-muted-foreground">{t('editor.notFound')}</div>;
    }

    const previewUrl = `/mini-apps-preview/${encodeURIComponent(project.id)}?embedded=1&refresh=${previewRefreshKey}`;

    return (
        <div className="flex flex-col h-full gap-2 p-2">
            {/* Top toolbar */}
            <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-muted/30 border border-border">
                <BackButton />
                <span className="text-sm font-medium truncate max-w-40">{project.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                    {project.type === 'react' ? 'React' : 'HTML'}
                </span>
                <div className="flex-1" />
                {saveStatus === 'modified' && (
                    <span className="flex items-center gap-1 text-xs text-amber-500">
                        <Pencil className="h-3 w-3" />
                        {t('editor.modified')}
                    </span>
                )}
                {saveStatus === 'saving' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t('editor.saving')}
                    </span>
                )}
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setPluginDialogOpen(true)}>
                    <Puzzle className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShareOpen(true)}>
                    <Share2 className="size-4" />
                </Button>
            </div>

            {/* Main content */}
            <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
                {/* Left: file tree + editor */}
                <ResizablePanel id="mini-app-editor" defaultSize="30%" minSize="15%" className="flex flex-col">
                    <div className="flex flex-col h-full rounded-xl border border-border bg-background overflow-hidden">
                        {/* Toolbar with file picker */}
                        <div className="flex items-center justify-between px-2 py-1 border-b border-border">
                            <div className="flex items-center gap-0.5 min-w-0 flex-1">
                                <span className="text-xs text-muted-foreground truncate max-w-[60%]" title={activeFile}>{activeFile}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-5 shrink-0"
                                    onClick={() => navigator.clipboard.writeText(activeFile)}
                                >
                                    <Copy className="size-3" />
                                </Button>
                            </div>
                            <input
                                ref={uploadInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    handleUploadFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0"
                                title={t('editor.upload')}
                                onClick={() => uploadInputRef.current?.click()}
                            >
                                <Upload className="size-3.5" />
                            </Button>
                            <Popover>
                                <PopoverTrigger
                                    render={<Button variant="ghost" size="icon" className="size-6" />}
                                >
                                    <FolderOpen className="size-3.5" />
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-56 p-0 max-h-64 overflow-auto">
                                    <FileTree
                                        variant="project"
                                        defaultExpanded={new Set(collectFolderPaths(buildFileTree(files)))}
                                        selectedPath={activeFile}
                                        onFileSelect={(path) => { handleFileSelect(path); }}
                                        onDelete={handleDeleteFile}
                                        onRename={handleRenameFile}
                                        onMove={handleMoveFile}
                                        onCopyItem={handleCopyFile}
                                        onCreateFile={handleCreateFile}
                                        onCreateFolder={handleCreateFolder}
                                    >
                                        {renderTreeNodes(buildFileTree(files))}
                                    </FileTree>
                                </PopoverContent>
                            </Popover>
                        </div>
                        {/* Code editor */}
                        <div className="flex-1 min-h-0">
                            <MonacoEditor
                                height="100%"
                                language="typescript"
                                theme="vs-dark"
                                value={sourceCode}
                                onChange={(v) => {
                                    const nextCode = v || '';
                                    const dirty = nextCode !== loadedFileContentRef.current;
                                    localDirtyRef.current = dirty;
                                    setSaveStatus(dirty ? 'modified' : 'saved');
                                    setSourceCode(nextCode);
                                }}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 12,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    padding: { top: 8 },
                                    overviewRulerBorder: false,
                                    hideCursorInOverviewRuler: true,
                                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                                    "semanticHighlighting.enabled": false,
                                    renderWhitespace: 'none',
                                    wordBasedSuggestions: 'off',
                                }}
                                onMount={(editor, monaco) => {
                                    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                                        noSemanticValidation: true,
                                        noSyntaxValidation: true,
                                    });
                                    editor.addCommand(
                                        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                                        () => handleSaveRef.current(),
                                    );
                                }}
                            />
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right: preview */}
                <ResizablePanel id="mini-app-preview" defaultSize="70%" minSize="30%" className="flex flex-col">
                    <div className="flex flex-col h-full rounded-xl border border-border bg-background overflow-hidden">
                        <div className="flex items-center justify-between px-2 py-1 border-b border-border">
                            <MiniAppPreviewToolbar
                                autoRefresh={autoRefresh}
                                onAutoRefreshChange={setAutoRefresh}
                                onRefresh={handleManualRefresh}
                            />
                        </div>
                        <iframe
                            key={previewUrl}
                            src={previewUrl}
                            ref={previewIframeRef}
                            title={project.name}
                            className="flex-1 min-h-0 w-full border-0 bg-background"
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>

            <MiniAppChat
                project={project}
                activeFilePath={activeFile}
                fileContent={sourceCode}
                onUpdateProject={(updates) => {
                    if (project) {
                        sdk.miniApp.update(project.id, updates);
                        setProject({ ...project, ...updates });
                    }
                }}
            />

            <ShareDialog open={shareOpen} onOpenChange={setShareOpen} title={project.name} url={shareUrl} />

            <PluginToolDialog
                open={pluginDialogOpen}
                onOpenChange={setPluginDialogOpen}
                projectId={project.id}
                enabledPlugins={project.enabledPlugins ?? []}
                onEnabledPluginsChange={(plugins) => {
                    if (project) setProject({ ...project, enabledPlugins: plugins });
                }}
            />

            <Dialog open={pathDialog.open} onOpenChange={(open) => setPathDialog(s => ({ ...s, open }))}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>{pathDialogT(`${pathDialog.mode}Title`)}</DialogTitle>
                        <DialogDescription>{pathDialogT(`${pathDialog.mode}Desc`)}</DialogDescription>
                    </DialogHeader>
                    <Input
                        autoFocus
                        value={pathDialog.value}
                        onChange={(e) => setPathDialog(s => ({ ...s, value: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handlePathDialogConfirm(); }}
                        placeholder={pathDialogT(`${pathDialog.mode}Placeholder`)}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPathDialog(s => ({ ...s, open: false }))}>
                            {pathDialogT('cancel')}
                        </Button>
                        <Button onClick={handlePathDialogConfirm}>
                            {pathDialogT('confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
