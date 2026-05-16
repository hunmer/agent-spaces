"use client"

import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon, Trash2, ExternalLink, Upload, Copy, FolderPlus, FilePlus, AlertTriangle, Pencil, MoveRight } from "lucide-react"
import { createContext, type HTMLAttributes, type ReactNode, useContext, useState, useCallback } from "react"
/**
 * @title React AI File Tree
 * @credit {"name": "Vercel", "url": "https://ai-sdk.dev/elements", "license": {"name": "Apache License 2.0", "url": "https://www.apache.org/licenses/LICENSE-2.0"}}
 * @description React AI file tree component for displaying hierarchical file and folder structures
 * @opening When your AI generates code or explores a project, you need to show the file structure. This component renders a tree view with collapsible folders, file icons, and selection support. Perfect for showing code generation results, repository structures, or letting users navigate project files. Folders expand/collapse on click, files can be selected, and the whole thing uses proper accessibility attributes for keyboard navigation.
 * @related [
 *   {"href":"/ai/code-block","title":"React AI Code Block","description":"Syntax highlighted code"},
 *   {"href":"/ai/artifact","title":"React AI Artifact","description":"Generated content container"},
 *   {"href":"/ai/terminal","title":"React AI Terminal","description":"Command output display"},
 *   {"href":"/ai/tool","title":"React AI Tool","description":"Tool execution display"},
 *   {"href":"/ai/message","title":"React AI Message","description":"Chat message bubbles"},
 *   {"href":"/ai/context","title":"React AI Context","description":"File context display"}
 * ]
 * @questions [
 *   {"id":"filetree-expand","title":"How do I control which folders are expanded?","answer":"Pass expanded as a Set of paths for controlled mode, or defaultExpanded for uncontrolled. The onExpandedChange callback fires when folders toggle."},
 *   {"id":"filetree-select","title":"How do I handle file selection?","answer":"Pass selectedPath and onSelect props. When a file or folder is clicked, onSelect fires with the path. The selected item gets highlighted styling."},
 *   {"id":"filetree-icons","title":"Can I customize file icons?","answer":"FileTreeFile takes an icon prop. Pass any React node—use lucide-react icons for different file types like TypeScript, JSON, images, etc."},
 *   {"id":"filetree-actions","title":"Can I add actions to files?","answer":"Use FileTreeActions inside FileTreeFile to add buttons that don't trigger selection when clicked. Good for delete, rename, or other file operations."}
 * ]
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from 'next-intl'

interface FileTreeContextType {
  expandedPaths: Set<string>
  togglePath: (path: string) => void
  selectedPath?: string
  onFileSelect?: (path: string) => void
  workspaceId?: string
  onDelete?: (path: string) => void
  onImport?: (targetPath: string) => void
  onCopyPath?: (path: string) => void
  onCreateFile?: (targetDir: string) => void
  onCreateFolder?: (targetDir: string) => void
  onRename?: (path: string) => void
  onMove?: (path: string) => void
  onCopyItem?: (path: string) => void
  onLoadDirectory?: (path: string) => void
  loadedDirs?: Set<string>
  boundDir?: string
  fileSizeMap?: Record<string, number>
}

const FileTreeContext = createContext<FileTreeContextType>({
  expandedPaths: new Set(),
  togglePath: () => undefined,
})

export type FileTreeProps = HTMLAttributes<HTMLDivElement> & {
  expanded?: Set<string>
  defaultExpanded?: Set<string>
  selectedPath?: string
  onFileSelect?: (path: string) => void
  onExpandedChange?: (expanded: Set<string>) => void
  workspaceId?: string
  onDelete?: (path: string) => void
  onImport?: (targetPath: string) => void
  onCopyPath?: (path: string) => void
  onCreateFile?: (targetDir: string) => void
  onCreateFolder?: (targetDir: string) => void
  onRename?: (path: string) => void
  onMove?: (path: string) => void
  onCopyItem?: (path: string) => void
  onLoadDirectory?: (path: string) => void
  loadedDirs?: Set<string>
  boundDir?: string
  fileSizeMap?: Record<string, number>
}

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onFileSelect,
  onExpandedChange,
  workspaceId,
  onDelete,
  onImport,
  onCopyPath,
  onCreateFile,
  onCreateFolder,
  onRename,
  onMove,
  onCopyItem,
  onLoadDirectory,
  loadedDirs,
  boundDir,
  fileSizeMap,
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

  return (
    <FileTreeContext.Provider value={{ expandedPaths, togglePath, selectedPath, onFileSelect, workspaceId, onDelete, onImport, onCopyPath, onCreateFile, onCreateFolder, onRename, onMove, onCopyItem, onLoadDirectory, loadedDirs, boundDir, fileSizeMap }}>
      <div
        className={cn("flex flex-col bg-background font-mono text-sm h-full", className)}
        role="tree"
        {...props}
      >
        <div className="p-2 flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </FileTreeContext.Provider>
  )
}

interface FileTreeFolderContextType {
  path: string
  name: string
  isExpanded: boolean
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  path: "",
  name: "",
  isExpanded: false,
})

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string
  name: string
  folderIcon?: (isOpen: boolean) => ReactNode
}

export const FileTreeFolder = ({
  path,
  name,
  folderIcon,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { expandedPaths, togglePath, selectedPath, onFileSelect, workspaceId, onDelete, onImport, onCopyPath, onCreateFile, onCreateFolder, onRename, onMove, onCopyItem, onLoadDirectory, loadedDirs, boundDir } = useContext(FileTreeContext)
  const isExpanded = expandedPaths.has(path)
  const isSelected = selectedPath === path
  const isLoading = loadedDirs?.has(path)
  const t = useTranslations('editor')
  const tc = useTranslations('common')

  const handleOpenChange = () => {
    const willExpand = !isExpanded
    togglePath(path)
    if (willExpand && !loadedDirs?.has(path) && onLoadDirectory) {
      onLoadDirectory(path)
    }
  }

  const handleReveal = () => {
    fetch(`/api/workspaces/${workspaceId}/files/reveal?path=${encodeURIComponent(path)}`, { method: 'POST' })
  }

  return (
    <FileTreeFolderContext.Provider value={{ path, name, isExpanded }}>
      <ContextMenu>
        <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
          <div className={className} role="treeitem" tabIndex={0} {...props}>
            <ContextMenuTrigger className="contents">
              <div className="group/folder relative">
                <CollapsibleTrigger
                  className={cn(
                    "flex w-full items-center gap-1 rounded px-2 py-1 pr-16 text-left transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted",
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
                  {isLoading && <span className="size-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />}
                </CollapsibleTrigger>
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 invisible group-hover/folder:visible" onClick={e => e.stopPropagation()}>
                  <button onClick={handleReveal} className="p-0.5 rounded hover:bg-accent" title={t('revealInFinder')}>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </button>
                  <button onClick={() => onDelete?.(path)} className="p-0.5 rounded hover:bg-accent" title={tc('delete')}>
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            </ContextMenuTrigger>
            <CollapsibleContent>
              <div className="ml-4 border-l pl-2">{children}</div>
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
            navigator.clipboard.writeText(absPath);
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
        </ContextMenuContent>
      </ContextMenu>
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
}

export const FileTreeFile = ({
  path,
  name,
  icon,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { selectedPath, onFileSelect, workspaceId, onDelete, onRename, onMove, onCopyItem, fileSizeMap } = useContext(FileTreeContext)
  const isSelected = selectedPath === path
  const t = useTranslations('editor')
  const tc = useTranslations('common')
  const [confirmOpen, setConfirmOpen] = useState(false)

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
    fetch(`/api/workspaces/${workspaceId}/files/reveal?path=${encodeURIComponent(path)}`, { method: 'POST' })
  }

  return (
    <FileTreeFileContext.Provider value={{ path, name }}>
      <ContextMenu>
        <ContextMenuTrigger className="contents">
          <div
            className={cn(
              "group/file flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/50",
              isSelected && "bg-muted",
              className,
            )}
            onClick={handleSelect}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                handleSelect()
              }
            }}
            role="treeitem"
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
                  <button onClick={handleReveal} className="p-0.5 rounded hover:bg-accent" title={t('revealInFinder')}>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </button>
                  <button onClick={() => onDelete?.(path)} className="p-0.5 rounded hover:bg-accent" title={tc('delete')}>
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </FileTreeActions>
              </>
            )}
          </div>
        </ContextMenuTrigger>
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
          <ContextMenuItem onClick={handleReveal}>
            <ExternalLink className="size-4" />
            {t('revealInFinder')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-yellow-500" />
              {t('fileTooLargeTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t('fileTooLargeDesc', { name, size: formatSize(fileSize!) })}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleConfirmOpen}>{t('openAnyway')}</Button>
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
