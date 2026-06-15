'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sdk } from '@/lib/sdk';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileIcon, FolderIcon, FolderOpenIcon, ChevronRightIcon, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';
import type { SkillInfo } from './types';

interface SkillFile {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

function buildTree(files: SkillFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const partPath = parts.slice(0, i + 1).join('/');
      const isDir = i < parts.length - 1 || file.isDirectory;

      const existing = current.find((n) => n.name === parts[i]);
      if (!existing) {
        const node: TreeNode = { name: parts[i], path: partPath, isDirectory: isDir, children: [] };
        current.push(node);
        if (isDir) dirMap.set(partPath, node);
        current = node.children;
      } else {
        current = existing.children;
      }
    }
  }
  return root;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    md: 'markdown', markdown: 'markdown', json: 'json', js: 'javascript', ts: 'typescript',
    tsx: 'typescript', jsx: 'javascript', py: 'python', sh: 'shell', bash: 'shell',
    yaml: 'yaml', yml: 'yaml', xml: 'xml', html: 'html', css: 'css', sql: 'sql',
  };
  return map[ext] || 'plaintext';
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedPaths,
  toggleExpand,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (node: TreeNode) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 rounded px-2 py-1 cursor-pointer hover:bg-muted/50 text-sm',
          isSelected && 'bg-muted',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.isDirectory) {
            toggleExpand(node.path);
          } else {
            onSelect(node);
          }
        }}
      >
        {node.isDirectory && (
          <ChevronRightIcon className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
        )}
        {!node.isDirectory && <span className="size-3.5 shrink-0" />}
        {node.isDirectory ? (
          isExpanded ? <FolderOpenIcon className="size-4 text-blue-500 shrink-0" /> : <FolderIcon className="size-4 text-blue-500 shrink-0" />
        ) : (
          <FileIcon className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.isDirectory && isExpanded && node.children.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expandedPaths={expandedPaths}
          toggleExpand={toggleExpand}
        />
      ))}
    </>
  );
}

interface SkillEditDialogProps {
  skill: SkillInfo | null;
  content: string;
  onContentChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function SkillEditDialog({ skill, content: _content, onContentChange, onClose, onSave }: SkillEditDialogProps) {
  const t = useTranslations('skills');
  const tc = useTranslations('common');
  const isMobile = useIsMobile();

  const [files, setFiles] = useState<SkillFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const loadedRef = useRef<Set<string>>(new Set());

  // Load file list when skill changes
  useEffect(() => {
    if (!skill) return;
    setSelectedFilePath(null);
    setFileContents({});
    setDirty(new Set());
    setExpandedPaths(new Set());
    setFiles([]);
    loadedRef.current = new Set();
    setLoading(true);

    const skillName = skill.name;
    sdk.skills.listFiles(skillName)
      .then((data) => {
        const files = data as SkillFile[];
        setFiles(files);
        // Auto-expand root-level dirs
        const rootDirs = files.filter((f) => f.isDirectory && !f.path.includes('/'));
        setExpandedPaths(new Set(rootDirs.map((d) => d.path)));
        // Find SKILL.md as default, fallback to first file
        const defaultFile = files.find((f) => f.path === 'SKILL.md' && !f.isDirectory)
          || files.find((f) => !f.isDirectory);
        if (!defaultFile) {
          setLoading(false);
          return;
        }
        setSelectedFilePath(defaultFile.path);
        const encodedPath = defaultFile.path.split('/').map(encodeURIComponent).join('/');
        sdk.skills.getFile(skillName, defaultFile.path)
          .then((fileData) => {
            const fd = fileData as { content: string } | null;
            if (fd) {
              setFileContents({ [defaultFile.path]: fd.content });
              loadedRef.current.add(defaultFile.path);
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      })
      .catch(() => { setFiles([]); setLoading(false); });
  }, [skill]);

  const loadFileContent = useCallback((skillName: string, filePath: string) => {
    if (loadedRef.current.has(filePath)) return;
    loadedRef.current.add(filePath);
    setLoading(true);
    sdk.skills.getFile(skillName, filePath)
      .then((data) => {
        const d = data as { content: string } | null;
        if (d) {
          setFileContents((prev) => ({ ...prev, [filePath]: d.content }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildTree(files), [files]);

  const handleSelect = (node: TreeNode) => {
    if (node.isDirectory) return;
    setSelectedFilePath(node.path);
    if (skill) loadFileContent(skill.name, node.path);
  };

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const currentContent = selectedFilePath ? (fileContents[selectedFilePath] ?? '') : '';
  const language = selectedFilePath ? getLanguageFromPath(selectedFilePath) : 'markdown';

  const handleContentChange = (value: string | undefined) => {
    if (!selectedFilePath) return;
    const v = value || '';
    setFileContents((prev) => ({ ...prev, [selectedFilePath]: v }));
    setDirty((prev) => new Set(prev).add(selectedFilePath));
    onContentChange(v);
  };

  const handleSave = async () => {
    if (!skill || !selectedFilePath) return;
    const content = fileContents[selectedFilePath];
    if (content === undefined) return;

    try {
      await sdk.skills.saveFile(skill.name, selectedFilePath, content);
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(selectedFilePath);
        return next;
      });
      onSave();
    } catch { /* ignore */ }
  };

  // Flat file list for mobile tabs
  const flatFiles = useMemo(() => files.filter((f) => !f.isDirectory), [files]);

  return (
    <Dialog open={!!skill} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!w-[85vw] !max-w-[85vw] !h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>{t('editTitle', { name: skill?.name || '' })}</DialogTitle>
              <DialogDescription>{t('editDescription')}</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {dirty.size > 0 && (
                <span className="text-xs text-muted-foreground">{dirty.size} unsaved</span>
              )}
              <Button size="sm" onClick={handleSave} disabled={!selectedFilePath || !dirty.has(selectedFilePath ?? '')}>
                <Save className="size-3.5 mr-1" />
                {tc('save')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isMobile ? (
          // Mobile: scrollable tabs + editor
          <div className="flex-1 min-h-0 flex flex-col pt-2">
            <div className="flex overflow-x-auto border-b gap-0.5 px-1 shrink-0">
              {flatFiles.map((f) => (
                <button
                  key={f.path}
                  className={cn(
                    'shrink-0 px-3 py-1.5 text-xs rounded-t transition-colors whitespace-nowrap',
                    selectedFilePath === f.path
                      ? 'bg-muted font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                    dirty.has(f.path) && 'after:content-[""] after:inline-block after:size-1.5 after:bg-orange-500 after:rounded-full after:ml-1',
                  )}
                  onClick={() => handleSelect({ name: f.name, path: f.path, isDirectory: false, children: [] })}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <MonacoEditor
                  height="100%"
                  language={language}
                  value={currentContent}
                  onChange={handleContentChange}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                    renderLineHighlight: 'gutter',
                    wordWrap: 'on',
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          // Desktop: file tree + editor
          <div className="flex-1 min-h-0 flex gap-0 pt-2 border rounded-md overflow-hidden">
            <div className="w-48 shrink-0 border-r bg-muted/20 overflow-y-auto py-1">
              {tree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFilePath ?? ''}
                  onSelect={handleSelect}
                  expandedPaths={expandedPaths}
                  toggleExpand={toggleExpand}
                />
              ))}
              {files.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No files</div>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <MonacoEditor
                  height="100%"
                  language={language}
                  value={currentContent}
                  onChange={handleContentChange}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                    renderLineHighlight: 'gutter',
                    wordWrap: 'on',
                  }}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
