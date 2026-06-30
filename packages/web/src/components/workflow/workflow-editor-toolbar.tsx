'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Save, ArrowLeft, Loader2,
  Upload, PackagePlus, MoreVertical, FolderOpen, FileImage, Image as ImageIcon, Trash2, LayoutTemplate, Play, Download,
  RotateCcw, RotateCw, CheckSquare, FlipHorizontal2, ArrowRightLeft, ArrowDownUp,
  AlertTriangle, Clock, MessagesSquare, CircleDot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarTrigger,
} from '@/components/ui/menubar';
import { WorkflowInfoDialog } from './workflow-info-dialog';
import { LayoutManagerDialog, type LayoutManagerDialogConfig } from '@/components/sidebar/layout-manager-dialog';
import type { Workflow } from '@agent-spaces/shared';

interface EditorToolbarProps {
  workflow: Workflow | null;
  isDirty: boolean;
  isPreview: boolean;
  isPreviewDirty: boolean;
  onBack: () => void;
  returnToChannel?: { workspaceId: string; channelId: string } | null;
  returnToIssue?: { workspaceId: string; issueId: string } | null;
  onExitPreview: () => void;
  onSave: () => void;
  canRunTest: boolean;
  onRunTest: () => void;
  onSavePreviewEdits: (options?: { createVersion?: boolean; versionName?: string }) => Promise<void>;
  onExport: (format: 'png' | 'jpeg') => void;
  isExporting?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onAutoLayout?: (direction: 'LR' | 'TB') => void;
  onSelectAll?: () => void;
  onInvertSelection?: () => void;
  onExportWorkflow: () => void;
  onImport: () => void;
  onOpenPluginManager: () => void;
  onOpenTriggerDialog: () => void;
  missingPluginCount?: number;
  workflowErrorMessage?: string | null;
  onOpenWorkflowLocation: () => void;
  onClearNodes: () => void;
  onWorkflowInfoChange: (updates: Partial<Workflow>) => void;
  /** Layout manager config for the editor's flexlayout panel surface. */
  layoutManager: LayoutManagerDialogConfig;
}

function ToolBtn({ tooltip, children, ...props }: React.ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div />}>
          <Button {...props}>{children}</Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function WorkflowEditorToolbar({
  workflow, isDirty, isPreview, isPreviewDirty,
  onBack, returnToChannel, returnToIssue, onExitPreview, onSave, canRunTest, onRunTest, onSavePreviewEdits,
  onExport, isExporting,
  canUndo, canRedo, onUndo, onRedo, onAutoLayout, onSelectAll, onInvertSelection,
  onExportWorkflow, onImport,
  onOpenPluginManager, onOpenTriggerDialog, missingPluginCount = 0, workflowErrorMessage = null, onOpenWorkflowLocation, onClearNodes, onWorkflowInfoChange,
  layoutManager,
}: EditorToolbarProps) {
  const router = useRouter();
  const [infoOpen, setInfoOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [clearNodesOpen, setClearNodesOpen] = useState(false);
  const [savePreviewOpen, setSavePreviewOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [savingPreview, setSavingPreview] = useState<'save' | 'version' | null>(null);
  const t = useTranslations('workflows');
  const hasTriggers = (workflow?.triggers?.length || 0) > 0;

  const handleSavePreview = async (createVersion: boolean) => {
    setSavingPreview(createVersion ? 'version' : 'save');
    try {
      await onSavePreviewEdits({ createVersion, versionName });
      setSavePreviewOpen(false);
      setVersionName('');
    } finally {
      setSavingPreview(null);
    }
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-background border rounded-xl shrink-0">
      <ToolBtn tooltip={t('editor.backToList')} variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </ToolBtn>
      {returnToIssue && (
        <ToolBtn
          tooltip="返回对应议题"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            const params = new URLSearchParams({ issueId: returnToIssue.issueId });
            router.push(`/workspace/${returnToIssue.workspaceId}?${params.toString()}`);
          }}
        >
          <CircleDot className="h-4 w-4" />
        </ToolBtn>
      )}
      {returnToChannel && (
        <ToolBtn
          tooltip="返回对应频道"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            const params = new URLSearchParams({ channelId: returnToChannel.channelId });
            router.push(`/workspace/${returnToChannel.workspaceId}?${params.toString()}`);
          }}
        >
          <MessagesSquare className="h-4 w-4" />
        </ToolBtn>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      <ToolBtn tooltip={t('editor.pluginManager')} variant="ghost" size="icon" className="h-7 w-7" onClick={onOpenPluginManager} disabled={!workflow}>
        <PackagePlus className="h-4 w-4" />
      </ToolBtn>

      <div className="w-px h-5 bg-border mx-1" />

      <Menubar className="h-7 border-none bg-transparent p-0">
        <MenubarMenu>
          <MenubarTrigger className="h-7 px-2 text-sm">{t('menubar.edit')}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onSave} disabled={!isDirty}>
              <Save className="h-4 w-4" />
              {t('menubar.save')}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onUndo} disabled={!canUndo}>
              <RotateCcw className="h-4 w-4" />
              {t('menubar.undo')}
            </MenubarItem>
            <MenubarItem onClick={onRedo} disabled={!canRedo}>
              <RotateCw className="h-4 w-4" />
              {t('menubar.redo')}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onSelectAll} disabled={!onSelectAll}>
              <CheckSquare className="h-4 w-4" />
              {t('menubar.selectAll')}
            </MenubarItem>
            <MenubarItem onClick={onInvertSelection} disabled={!onInvertSelection}>
              <FlipHorizontal2 className="h-4 w-4" />
              {t('menubar.invertSelection')}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-7 px-2 text-sm">{t('menubar.canvas')}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => onAutoLayout?.('LR')} disabled={!onAutoLayout}>
              <ArrowRightLeft className="h-4 w-4" />
              {t('menubar.horizontalLayout')}
            </MenubarItem>
            <MenubarItem onClick={() => onAutoLayout?.('TB')} disabled={!onAutoLayout}>
              <ArrowDownUp className="h-4 w-4" />
              {t('menubar.verticalLayout')}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => onExport('png')} disabled={isExporting}>
              <FileImage className="h-4 w-4" />
              {t('menubar.exportPng')}
            </MenubarItem>
            <MenubarItem onClick={() => onExport('jpeg')} disabled={isExporting}>
              <ImageIcon className="h-4 w-4" />
              {t('menubar.exportJpeg')}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onExportWorkflow} disabled={!workflow}>
              <Download className="h-4 w-4" />
              {t('card.export')}
            </MenubarItem>
            <MenubarItem onClick={onImport}>
              <Upload className="h-4 w-4" />
              {t('editor.import')}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="h-7 px-2 text-sm">{t('menubar.run')}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onRunTest} disabled={!canRunTest}>
              <Play className="h-4 w-4" />
              {t('menubar.runWorkflow')}
            </MenubarItem>
            <MenubarItem disabled={!workflow} onClick={() => window.open(`/workflows/share.html?workflow_id=${workflow!.id}`)}>
              <LayoutTemplate className="h-4 w-4" />
              {t('menubar.preview')}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="w-px h-5 bg-border mx-1" />

      {workflow && (
        <button
          className="h-7 px-2 text-sm font-medium hover:bg-muted/50 rounded cursor-pointer flex items-center gap-1.5"
          onClick={() => setInfoOpen(true)}
        >
          {workflow.icon ? (
            <span className="text-base leading-none">{workflow.icon}</span>
          ) : (
            <span className="w-4 h-4 rounded bg-primary/10 text-[10px] font-bold flex items-center justify-center text-primary">
              {(workflow.name || t('card.defaultInitial')).charAt(0).toUpperCase()}
            </span>
          )}
          {workflow.name || t('editor.untitled')}
          {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
        </button>
      )}

      <WorkflowInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        workflow={workflow}
        onSave={onWorkflowInfoChange}
      />

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="h-7 gap-1" disabled={!workflow} onClick={() => window.open(`/workflows/share.html?workflow_id=${workflow!.id}`)}>
        {t('editor.preview')}
      </Button>
      <Button variant="ghost" size="sm" className="h-7 gap-1" disabled={!workflow} onClick={onOpenTriggerDialog}>
        <Clock className="h-3.5 w-3.5" />
        {hasTriggers ? t('editor.manageTriggers') : t('editor.triggerSettings')}
      </Button>

      {missingPluginCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
          disabled={!workflow}
          onClick={onOpenPluginManager}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('editor.missingPlugins', { count: missingPluginCount })}
        </Button>
      )}

      {workflowErrorMessage && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-red-300 text-red-600 hover:bg-red-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('editor.executionError')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div className="min-w-0">
                <div className="mb-1 text-xs font-medium text-red-600">{t('editor.workflowExecutionError')}</div>
                <div className="break-all text-xs text-muted-foreground">{workflowErrorMessage}</div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      <Button variant="ghost" size="sm" className="h-7 gap-1" disabled={!canRunTest} onClick={onRunTest}>
        <Play className="h-3.5 w-3.5" />
        {t('editor.runTest')}
      </Button>

      {isPreview && (
        <>
          {isPreviewDirty && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-blue-500"
              onClick={() => setSavePreviewOpen(true)}
              disabled={!workflow || savingPreview !== null}
            >
              {savingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t('editor.savePreviewEdits')}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-blue-500" onClick={() => {
            if (isPreviewDirty) {
              setExitConfirmOpen(true);
            } else {
              onExitPreview();
            }
          }}>
            {t('editor.exitPreview')}
          </Button>
          <Dialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t('editor.unsavedPreviewTitle')}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t('editor.unsavedPreviewDesc')}</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setExitConfirmOpen(false)}>{t('editor.cancel')}</Button>
                <Button variant="destructive" size="sm" onClick={() => { setExitConfirmOpen(false); onExitPreview(); }}>{t('editor.discard')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      <ToolBtn tooltip={t('editor.save')} variant="ghost" size="icon" className="h-7 w-7" onClick={onSave} disabled={!isDirty}>
        <Save className="h-4 w-4" />
      </ToolBtn>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setLayoutOpen(true)} disabled={!workflow}>
            <LayoutTemplate className="h-4 w-4 mr-2" />
            {t('editor.layoutManager')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenWorkflowLocation} disabled={!workflow}>
            <FolderOpen className="h-4 w-4 mr-2" />
            {t('editor.openLocation')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={!workflow}
            onClick={() => setClearNodesOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('editor.clearNodes')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={savePreviewOpen} onOpenChange={setSavePreviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('editor.savePreviewEditsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('editor.savePreviewEditsConfirm')}</p>
            <Input
              value={versionName}
              onChange={(event) => setVersionName(event.target.value)}
              placeholder={t('version.namePlaceholder')}
              className="h-8 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSavePreviewOpen(false)} disabled={savingPreview !== null}>
              {t('version.cancel')}
            </Button>
            <Button size="sm" onClick={() => handleSavePreview(false)} disabled={savingPreview !== null}>
              {savingPreview === 'save' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {t('version.save')}
            </Button>
            <Button size="sm" onClick={() => handleSavePreview(true)} disabled={savingPreview !== null}>
              {savingPreview === 'version' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {t('editor.createVersionAndSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearNodesOpen} onOpenChange={setClearNodesOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('editor.clearNodesConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('editor.clearNodesConfirmDesc')}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setClearNodesOpen(false)}>{t('editor.cancel')}</Button>
            <Button variant="destructive" size="sm" onClick={() => { setClearNodesOpen(false); onClearNodes(); }}>{t('editor.clearNodes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LayoutManagerDialog open={layoutOpen} onOpenChange={setLayoutOpen} {...layoutManager} />
    </div>
  );
}
