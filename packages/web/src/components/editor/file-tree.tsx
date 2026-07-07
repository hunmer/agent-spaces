"use client"

import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon, Trash2, ExternalLink, Upload, Copy, FolderPlus, FilePlus, AlertTriangle, Pencil, MoveRight, Terminal } from "lucide-react"
import { createContext, type DragEvent, type HTMLAttributes, type ReactNode, useContext, useState, useCallback, useEffect, useRef } from "react"
import { useHeTree, type Stat } from "he-tree-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn, copyToClipboard } from "@/lib/utils"
import { FileContextMenu } from "./file-context-menu"
import { useTranslations } from 'next-intl'
import type { FileNode } from "@agent-spaces/shared"
import { FileIconImg, FolderIconImg } from "./file-icon"
import { useTerminalStore } from "@/stores/terminal"
import { sdk } from '@/lib/sdk'
// 通用嵌套树公共组件：类型与实现已抽取到 components/nested-tree.tsx
// 对外保持原有导出兼容；内部 he-tree 渲染仍复用其类型，故单独 import type。
import NestedTree, {
  type NestedTreeProps,
  type NestedTreeRenderState,
  type NestedTreeRenderArgs,
  type NestedTreeRowProps,
} from "@/components/nested-tree"
export {
  NestedTree,
  type NestedTreeProps,
  type NestedTreeRenderState,
  type NestedTreeRenderArgs,
  type NestedTreeRowProps,
}

interface FileTreeContextType {
  expandedPaths: Set<string>
  togglePath: (path: string) => void
  selectedPath?: string
  onFileSelect?: (path: string) => void
  workspaceId?: string
  variant: 'workspace' | 'project'
  onDelete?: (path: string) => void
  onImport?: (targetPath: string) => void
  onCopyPath?: (path: string) => void
  onCreateFile?: (targetDir: string) => void
  onCreateFolder?: (targetDir: string) => void
  onRename?: (path: string) => void
  onMove?: (path: string) => void
  onCopyItem?: (path: string) => void
  onLoadDirectory?: (path: string) => void
  loadingDirs?: Set<string>
  boundDir?: string
  fileSizeMap?: Record<string, number>
  ignoredPaths?: Set<string>
  draggedOverPath?: string | null
  onItemDragStart?: (event: DragEvent<HTMLDivElement>, path: string) => void
  onItemDragOver?: (event: DragEvent<HTMLDivElement>, path: string) => void
  onItemDragLeave?: (event: DragEvent<HTMLDivElement>) => void
  onItemDrop?: (event: DragEvent<HTMLDivElement>, path: string) => void
  onItemDragEnd?: (event: DragEvent<HTMLDivElement>) => void
  rootDropTargetId?: string
  onRootDropLineDragOver?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  onRootDropLineDragEnter?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  onRootDropLineDragLeave?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  onRootDropLineDrop?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  allowDragUpload?: boolean
  dragUploadAccept?: string | string[]
  dragUploadMaxSize?: number
  onDragUpload?: (files: File[], targetPath: string) => void | Promise<void>
  onDragUploadReject?: (file: File, reason: 'type' | 'size') => void
}

const FileTreeContext = createContext<FileTreeContextType>({
  expandedPaths: new Set(),
  togglePath: () => undefined,
  variant: 'workspace',
})

export type FileTreeProps = HTMLAttributes<HTMLDivElement> & {
  expanded?: Set<string>
  defaultExpanded?: Set<string>
  selectedPath?: string
  onFileSelect?: (path: string) => void
  onExpandedChange?: (expanded: Set<string>) => void
  workspaceId?: string
  variant?: 'workspace' | 'project'
  onDelete?: (path: string) => void
  onImport?: (targetPath: string) => void
  onCopyPath?: (path: string) => void
  onCreateFile?: (targetDir: string) => void
  onCreateFolder?: (targetDir: string) => void
  onRename?: (path: string) => void
  onMove?: (path: string) => void
  onCopyItem?: (path: string) => void
  onLoadDirectory?: (path: string) => void
  loadingDirs?: Set<string>
  boundDir?: string
  fileSizeMap?: Record<string, number>
  refreshInterval?: number
  ignoredPaths?: Set<string>
  draggedOverPath?: string | null
  onItemDragStart?: (event: DragEvent<HTMLDivElement>, path: string) => void
  onItemDragOver?: (event: DragEvent<HTMLDivElement>, path: string) => void
  onItemDragLeave?: (event: DragEvent<HTMLDivElement>) => void
  onItemDrop?: (event: DragEvent<HTMLDivElement>, path: string) => void
  onItemDragEnd?: (event: DragEvent<HTMLDivElement>) => void
  rootDropTargetId?: string
  onRootDropLineDragOver?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  onRootDropLineDragEnter?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  onRootDropLineDragLeave?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  onRootDropLineDrop?: (event: DragEvent<HTMLDivElement>, targetId: string) => void
  allowDragUpload?: boolean
  dragUploadAccept?: string | string[]
  dragUploadMaxSize?: number
  onDragUpload?: (files: File[], targetPath: string) => void | Promise<void>
  onDragUploadReject?: (file: File, reason: 'type' | 'size') => void
}

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onFileSelect,
  onExpandedChange,
  workspaceId,
  variant = 'workspace',
  onDelete,
  onImport,
  onCopyPath,
  onCreateFile,
  onCreateFolder,
  onRename,
  onMove,
  onCopyItem,
  onLoadDirectory,
  loadingDirs,
  boundDir,
  fileSizeMap,
  refreshInterval,
  ignoredPaths,
  draggedOverPath,
  onItemDragStart,
  onItemDragOver,
  onItemDragLeave,
  onItemDrop,
  onItemDragEnd,
  rootDropTargetId,
  onRootDropLineDragOver,
  onRootDropLineDragEnter,
  onRootDropLineDragLeave,
  onRootDropLineDrop,
  allowDragUpload,
  dragUploadAccept,
  dragUploadMaxSize,
  onDragUpload,
  onDragUploadReject,
  className,
  children,
  ...props
}: FileTreeProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const expandedPaths = controlledExpanded ?? internalExpanded

  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setInternalExpanded(newExpanded)
    onExpandedChange?.(newExpanded)
  }

  useEffect(() => {
    if (!refreshInterval || !onLoadDirectory || expandedPaths.size === 0) return
    const id = setInterval(() => {
      expandedPaths.forEach(p => onLoadDirectory(p))
    }, refreshInterval)
    return () => clearInterval(id)
  }, [refreshInterval, onLoadDirectory, expandedPaths])

  const handleRootDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!allowDragUpload || !event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [allowDragUpload])

  const handleRootDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!allowDragUpload || event.dataTransfer.files.length === 0) return
    event.preventDefault()
    const accepted = filterDragUploadFiles([...event.dataTransfer.files], dragUploadAccept, dragUploadMaxSize, onDragUploadReject)
    if (accepted.length > 0) void onDragUpload?.(accepted, '')
  }, [allowDragUpload, dragUploadAccept, dragUploadMaxSize, onDragUpload, onDragUploadReject])

  return (
    <FileTreeContext.Provider value={{ expandedPaths, togglePath, selectedPath, onFileSelect, workspaceId, variant, onDelete, onImport, onCopyPath, onCreateFile, onCreateFolder, onRename, onMove, onCopyItem, onLoadDirectory, loadingDirs, boundDir, fileSizeMap, ignoredPaths, draggedOverPath, onItemDragStart, onItemDragOver, onItemDragLeave, onItemDrop, onItemDragEnd, rootDropTargetId, onRootDropLineDragOver, onRootDropLineDragEnter, onRootDropLineDragLeave, onRootDropLineDrop, allowDragUpload, dragUploadAccept, dragUploadMaxSize, onDragUpload, onDragUploadReject }}>
      <div
        className={cn("flex flex-col bg-background font-mono text-sm h-full", className)}
        role="tree"
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
        {...props}
      >
        <div className="p-2 flex-1 min-h-0 overflow-y-auto overflow-x-auto">{children}</div>
      </div>
    </FileTreeContext.Provider>
  )
}

interface FileTreeFolderContextType {
  path: string
  name: string
  isExpanded: boolean
  ignored: boolean
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  path: "",
  name: "",
  isExpanded: false,
  ignored: false,
})

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string
  name: string
  folderIcon?: (isOpen: boolean) => ReactNode
  ignored?: boolean
}

export const FileTreeFolder = ({
  path,
  name,
  folderIcon,
  ignored,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { expandedPaths, togglePath, selectedPath, onFileSelect: _onFileSelect, workspaceId, variant, onDelete, onImport, onCopyPath: _onCopyPath, onCreateFile, onCreateFolder, onRename, onMove, onCopyItem, onLoadDirectory, loadingDirs, boundDir } = useContext(FileTreeContext)
  const parentFolder = useContext(FileTreeFolderContext)
  const isExpanded = expandedPaths.has(path)
  const isIgnored = ignored || parentFolder.ignored
  const isSelected = selectedPath === path
  const isLoading = !!loadingDirs?.has(path)
  const t = useTranslations('editor')
  const tc = useTranslations('common')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const handleOpenChange = () => {
    const willExpand = !isExpanded
    togglePath(path)
    if (willExpand && onLoadDirectory) {
      onLoadDirectory(path)
    }
  }

  const handleReveal = () => {
    if (workspaceId) sdk.editor.reveal(workspaceId, path)
  }

  return (
    <FileTreeFolderContext.Provider value={{ path, name, isExpanded, ignored: isIgnored }}>
      <ContextMenu>
        <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
          <div className={className} role="treeitem" aria-selected={false} tabIndex={0} {...props}>
            <ContextMenuTrigger className="contents">
              <div className="group/folder relative">
                <CollapsibleTrigger
                  className={cn(
                    "flex w-full items-center gap-1 rounded px-2 py-1 pr-16 text-left transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted",
                    isIgnored && "opacity-50",
                  )}
                >
                  <ChevronRightIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <FileTreeIcon>
                    {folderIcon ? folderIcon(isExpanded) : isExpanded ? (
                      <FolderOpenIcon className="size-4 text-blue-500" />
                    ) : (
                      <FolderIcon className="size-4 text-blue-500" />
                    )}
                  </FileTreeIcon>
                  <FileTreeName>{name}</FileTreeName>
                  {isLoading && <span className="size-3 border border-muted-foreground border-t-transparent rounded-full animate-spin shrink-0" />}
                </CollapsibleTrigger>
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 invisible group-hover/folder:visible" onClick={e => e.stopPropagation()}>
                  {variant === 'workspace' && (
                    <button onClick={handleReveal} className="p-0.5 rounded hover:bg-accent cursor-pointer" title={t('revealInFinder')}>
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </button>
                  )}
                  <button onClick={() => setDeleteConfirmOpen(true)} className="p-0.5 rounded hover:bg-accent cursor-pointer" title={tc('delete')}>
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            </ContextMenuTrigger>
            <CollapsibleContent>
              <div className="ml-4 border-l pl-2">
                {isLoading ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <span className="size-3 border border-muted-foreground border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>{t('loading')}</span>
                  </div>
                ) : children}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onRename?.(path)}>
            <Pencil className="size-4" />
            {t('rename')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onMove?.(path)}>
            <MoveRight className="size-4" />
            {t('move')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCopyItem?.(path)}>
            <Copy className="size-4" />
            {t('copyFile')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onImport?.(path)}>
            <Upload className="size-4" />
            {t('importFile')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            const absPath = boundDir ? boundDir.replace(/\/+$/, '') + '/' + path : path;
            copyToClipboard(absPath);
          }}>
            <Copy className="size-4" />
            {t('copyPath')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCreateFile?.(path)}>
            <FilePlus className="size-4" />
            {t('newFile')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCreateFolder?.(path)}>
            <FolderPlus className="size-4" />
            {t('newFolder')}
          </ContextMenuItem>
          {variant === 'workspace' && (
            <ContextMenuItem onClick={handleReveal}>
              <ExternalLink className="size-4" />
              {t('revealInFinder')}
            </ContextMenuItem>
          )}
          {variant === 'workspace' && (
            <ContextMenuItem onClick={() => {
              const absPath = boundDir ? boundDir.replace(/\/+$/, '') + '/' + path : path;
              useTerminalStore.getState().createSession(undefined, absPath);
            }}>
              <Terminal className="size-4" />
              {t('openInTerminal')}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => setDeleteConfirmOpen(true)} className="text-destructive focus:text-destructive">
            <Trash2 className="size-4" />
            {tc('delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              {t('deleteFolderTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t('deleteFolderDesc', { name })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={() => { setDeleteConfirmOpen(false); onDelete?.(path) }}>{tc('delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FileTreeFolderContext.Provider>
  )
}

interface FileTreeFileContextType {
  path: string
  name: string
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  path: "",
  name: "",
})

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string
  name: string
  icon?: ReactNode
  ignored?: boolean
}

export const FileTreeFile = ({
  path,
  name,
  icon,
  ignored,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { selectedPath, onFileSelect, workspaceId, variant, onDelete, onRename, onMove, onCopyItem, fileSizeMap, boundDir } = useContext(FileTreeContext)
  const parentFolder = useContext(FileTreeFolderContext)
  const isIgnored = ignored || parentFolder.ignored
  const isSelected = selectedPath === path
  const t = useTranslations('editor')
  const tc = useTranslations('common')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [isSelected])

  const fileSize = fileSizeMap?.[path]
  const isLargeFile = fileSize != null && fileSize > 1024 * 1024

  const handleSelect = useCallback(() => {
    if (isLargeFile) {
      setConfirmOpen(true)
      return
    }
    onFileSelect?.(path)
  }, [isLargeFile, onFileSelect, path])

  const handleConfirmOpen = useCallback(() => {
    setConfirmOpen(false)
    onFileSelect?.(path)
  }, [onFileSelect, path])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleReveal = () => {
    if (workspaceId) sdk.editor.reveal(workspaceId, path)
  }

  return (
    <FileTreeFileContext.Provider value={{ path, name }}>
      <ContextMenu>
        <ContextMenuTrigger className="contents">
          <div
            ref={itemRef}
            className={cn(
              "group/file flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/50",
              isSelected && "bg-muted",
              isIgnored && "opacity-50",
              className,
            )}
            onClick={handleSelect}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                handleSelect()
              }
            }}
            role="treeitem"
            aria-selected={false}
            tabIndex={0}
            {...props}
          >
            {children ?? (
              <>
                <span className="size-4" />
                <FileTreeIcon>
                  {icon ?? <FileIcon className="size-4 text-muted-foreground" />}
                </FileTreeIcon>
                <FileTreeName>{name}</FileTreeName>
                <FileTreeActions>
                  {variant === 'workspace' && (
                    <button onClick={handleReveal} className="p-0.5 rounded hover:bg-accent cursor-pointer" title={t('revealInFinder')}>
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </button>
                  )}
                  <button onClick={() => setDeleteConfirmOpen(true)} className="p-0.5 rounded hover:bg-accent cursor-pointer" title={tc('delete')}>
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </FileTreeActions>
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <FileContextMenu
          filePath={path}
          workspaceId={workspaceId}
          boundDir={boundDir}
          onRename={() => onRename?.(path)}
          onMove={() => onMove?.(path)}
          onCopyItem={() => onCopyItem?.(path)}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
      </ContextMenu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-yellow-500" />
              {t('fileTooLargeTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="break-all">
            {t('fileTooLargeDesc', { name, size: formatSize(fileSize!) })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleConfirmOpen}>{t('openAnyway')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              {t('deleteFileTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t('deleteFileDesc', { name })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={() => { setDeleteConfirmOpen(false); onDelete?.(path) }}>{tc('delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FileTreeFileContext.Provider>
  )
}

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>

export const FileTreeIcon = ({ className, children, ...props }: FileTreeIconProps) => (
  <span className={cn("shrink-0", className)} {...props}>
    {children}
  </span>
)

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>

export const FileTreeName = ({ className, children, ...props }: FileTreeNameProps) => (
  <span className={cn("truncate flex-1 min-w-0", className)} {...props}>
    {children}
  </span>
)

export type FileTreeActionsProps = HTMLAttributes<HTMLDivElement>

export const FileTreeActions = ({ className, children, ...props }: FileTreeActionsProps) => (
  <div
    className={cn("ml-auto flex items-center gap-1 shrink-0 invisible group-hover/file:visible", className)}
    onClick={e => e.stopPropagation()}
    onKeyDown={e => e.stopPropagation()}
    role="group"
    {...props}
  >
    {children}
  </div>
)

type HeTreeFileNode = FileNode & Record<string, unknown>
type HeTreePlaceholder = {
  parentStat: Stat<HeTreeFileNode> | null
  level: number
  index: number
} | null | undefined

const asFileTreeDragEvent = (event: DragEvent<HTMLElement>) => (
  event as unknown as DragEvent<HTMLDivElement>
)

const canDropIntoDirectory = (sourcePath: string | null | undefined, targetDir: string) => {
  if (!sourcePath) return true
  return targetDir !== sourcePath && !targetDir.startsWith(`${sourcePath}/`)
}

const matchesDragUploadAccept = (file: File, accept?: string | string[]) => {
  if (!accept || accept.length === 0) return true
  const rules = Array.isArray(accept) ? accept : accept.split(',')
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return rules.some((rule) => {
    const value = rule.trim().toLowerCase()
    if (!value) return false
    if (value.startsWith('.')) return name.endsWith(value)
    if (value.endsWith('/*')) return type.startsWith(value.slice(0, -1))
    return type === value
  })
}

const filterDragUploadFiles = (
  files: File[],
  accept?: string | string[],
  maxSize?: number,
  onReject?: (file: File, reason: 'type' | 'size') => void,
) => files.filter((file) => {
  if (!matchesDragUploadAccept(file, accept)) {
    onReject?.(file, 'type')
    return false
  }
  if (maxSize != null && file.size > maxSize) {
    onReject?.(file, 'size')
    return false
  }
  return true
})

const hasIgnoredParent = (stat: Stat<HeTreeFileNode>) => {
  let parent = stat.parentStat
  while (parent) {
    if (parent.node.ignored) return true
    parent = parent.parentStat
  }
  return false
}

export function FileTreeNodes({ nodes }: { nodes: FileNode[] }) {
  const {
    expandedPaths,
    togglePath,
    onLoadDirectory,
    draggedOverPath,
    onItemDragStart,
    onItemDragOver,
    onItemDragLeave,
    onItemDrop,
    onItemDragEnd,
    rootDropTargetId,
    onRootDropLineDragOver,
    onRootDropLineDragEnter,
    onRootDropLineDragLeave,
    onRootDropLineDrop,
    allowDragUpload,
    dragUploadAccept,
    dragUploadMaxSize,
    onDragUpload,
    onDragUploadReject,
  } = useContext(FileTreeContext)
  const draggingPathRef = useRef<string | null>(null)
  const dragOpenedPathsRef = useRef(new Set<string>())
  const placeholderRef = useRef<HeTreePlaceholder>(undefined)

  const tree = useHeTree<HeTreeFileNode>({
    data: nodes as HeTreeFileNode[],
    dataType: "tree",
    idKey: "path",
    childrenKey: "children",
    indent: 16,
    openIds: [...expandedPaths],
    dragOpen: true,
    onChange: () => undefined,
    canDrop: (stat) => {
      if (stat.node.type !== "directory") return undefined
      return canDropIntoDirectory(draggingPathRef.current, stat.node.path)
    },
    canDropToRoot: () => true,
    onDragStart: (event, stat) => {
      draggingPathRef.current = stat.node.path
      onItemDragStart?.(asFileTreeDragEvent(event), stat.node.path)
    },
    onDragOver: (event, stat) => {
      if (allowDragUpload && event.dataTransfer.types.includes('Files')) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        return
      }
      onItemDragOver?.(asFileTreeDragEvent(event), stat.node.path)
    },
    onDragEnd: (event, _stat) => {
      const dragEvent = asFileTreeDragEvent(event)
      const placeholder = placeholderRef.current

      if (!placeholder) {
        onItemDragEnd?.(dragEvent)
        draggingPathRef.current = null
        dragOpenedPathsRef.current.clear()
        return false
      }
      if (placeholder.parentStat) {
        onItemDrop?.(dragEvent, placeholder.parentStat.node.path)
      } else if (rootDropTargetId) {
        onRootDropLineDrop?.(dragEvent, rootDropTargetId)
      }

      onItemDragEnd?.(dragEvent)
      draggingPathRef.current = null
      dragOpenedPathsRef.current.clear()
      return false
    },
    onDragOpen: (stat) => {
      if (stat.node.type !== "directory" || expandedPaths.has(stat.node.path)) return
      if (!dragOpenedPathsRef.current.has(stat.node.path)) {
        dragOpenedPathsRef.current.add(stat.node.path)
        togglePath(stat.node.path)
        onLoadDirectory?.(stat.node.path)
      }
    },
    renderNodeBox: ({ stat, attrs, isPlaceholder }) => {
      if (isPlaceholder) {
        return (
          <div key="__file_tree_drag_placeholder__" {...attrs} draggable={false} className="flex h-1.5 items-center px-2">
            <div className="h-px flex-1 rounded-full bg-primary opacity-100 transition-opacity" />
          </div>
        )
      }

      const node = stat.node
      const isIgnored = node.ignored || hasIgnoredParent(stat)
      const state: NestedTreeRenderState = {
        level: stat.level - 1,
        hasChildren: node.type === "directory" && (node.children?.length ?? 0) > 0,
        isExpanded: expandedPaths.has(node.path),
        isActive: false,
        isDraggedOver: draggedOverPath === node.path,
      }
      const { key: _rowKey, ...restAttrs } = attrs as typeof attrs & { key?: string }
      const rowProps = {
        ...restAttrs,
        style: attrs.style,
        onDragLeave: onItemDragLeave,
        onDragOver: (event) => {
          if (allowDragUpload && event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            return
          }
          restAttrs.onDragOver?.(event)
        },
        onDrop: (event) => {
          if (allowDragUpload && event.dataTransfer.files.length > 0) {
            event.preventDefault()
            event.stopPropagation()
            const targetPath = node.type === 'directory' ? node.path : node.path.replace(/\/[^/]*$/, '')
            const accepted = filterDragUploadFiles([...event.dataTransfer.files], dragUploadAccept, dragUploadMaxSize, onDragUploadReject)
            if (accepted.length > 0) void onDragUpload?.(accepted, targetPath)
            return
          }
          restAttrs.onDrop?.(event)
        },
      } as NestedTreeRowProps
      const levelPadding = Math.max(0, state.level * 16)
      const rootDropLineId = rootDropTargetId ? `${rootDropTargetId}:${node.path}` : undefined
      const rootDropLine = state.level === 0 && node.type === "directory" && onRootDropLineDrop ? (
        <div
          className="flex h-1.5 items-center px-2"
          draggable={false}
          onDragEnterCapture={rootDropLineId ? (event) => onRootDropLineDragEnter?.(event, rootDropLineId) : undefined}
          onDragOverCapture={rootDropLineId ? (event) => onRootDropLineDragOver?.(event, rootDropLineId) : undefined}
          onDragLeaveCapture={rootDropLineId ? (event) => onRootDropLineDragLeave?.(event, rootDropLineId) : undefined}
          onDropCapture={rootDropLineId ? (event) => onRootDropLineDrop(event, rootDropLineId) : undefined}
          onDragEnter={rootDropLineId ? (event) => onRootDropLineDragEnter?.(event, rootDropLineId) : undefined}
          onDragOver={rootDropLineId ? (event) => onRootDropLineDragOver?.(event, rootDropLineId) : undefined}
          onDragLeave={rootDropLineId ? (event) => onRootDropLineDragLeave?.(event, rootDropLineId) : undefined}
          onDrop={rootDropLineId ? (event) => onRootDropLineDrop(event, rootDropLineId) : undefined}
        >
          <div
            className={cn(
              "h-px flex-1 rounded-full bg-primary opacity-0 transition-opacity",
              rootDropLineId && draggedOverPath === rootDropLineId && "opacity-100",
            )}
          />
        </div>
      ) : null

      return node.type === "directory" ? (
        <div key={node.path}>
          {rootDropLine}
          <FileTreeFolder
            {...rowProps}
            style={{ paddingLeft: levelPadding }}
            path={node.path}
            name={node.name}
            ignored={isIgnored}
            className={cn(
              state.isDraggedOver && "rounded border border-dashed border-primary/40 bg-primary/5",
              rowProps.className,
            )}
            folderIcon={(isOpen) => <FolderIconImg name={node.name} isOpen={isOpen} />}
          />
        </div>
      ) : (
        <FileTreeFile
          key={node.path}
          {...rowProps}
          style={{ paddingLeft: levelPadding }}
          path={node.path}
          name={node.name}
          icon={<FileIconImg name={node.name} />}
          ignored={isIgnored}
          className={cn(
            state.isDraggedOver && "border border-dashed border-primary/40 bg-primary/5",
            rowProps.className,
          )}
        />
      )
    },
  })

  useEffect(() => { placeholderRef.current = tree.placeholder })

  return (
    tree.renderTree({
      className: "contents",
      listClassName: "contents",
      listInnerClassName: "contents",
    })
  )
}
