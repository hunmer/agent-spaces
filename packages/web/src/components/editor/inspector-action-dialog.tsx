'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useInspectorHistoryStore } from '@/stores/inspector-history';
import { useEditorStore } from '@/stores/editor';
import { useEditorSendStore } from '@/stores/editor-send';
import { toast } from 'sonner';
import { Copy, Code2, MessageSquarePlus, CirclePlus } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils';

function emitFlutterInspectorJump(data: { path: string; line: number; column?: number }) {
  const bridge = (window as Window & { __flutterBridge?: { emit?: (event: string, data: unknown) => void } }).__flutterBridge;
  bridge?.emit?.('inspector.jump', data);
}

function t(key: string) {
  const locale = (typeof localStorage !== 'undefined' && localStorage.getItem('agent-spaces-locale')) || 'zh';
  const isEn = locale === 'en';
  const map: Record<string, string> = {
    title: isEn ? 'Inspector Action' : '代码定位操作',
    desc: isEn ? 'Choose an action for this code location' : '选择对此代码位置的操作',
    copy: isEn ? 'Copy Code Position' : '复制代码位置',
    jump: isEn ? 'Jump to Code Editor' : '定位到代码编辑器',
    channel: isEn ? 'Send to New Channel' : '发送到新频道',
    issue: isEn ? 'Send to New Issue' : '发送到新议题',
    copied: isEn ? 'Copied: {pos}' : '已复制: {pos}',
  };
  return map[key] ?? key;
}

export function InspectorActionDialog() {
  const { pendingJump, setPendingJump } = useInspectorHistoryStore();

  if (!pendingJump) return null;

  const { workspaceId, path, line, column } = pendingJump;
  const pos = `${path}:${line}:${column}`;

  const handleClose = (open: boolean) => {
    if (!open) setPendingJump(null);
  };

  const actions: { icon: React.ReactNode; label: string; onClick: () => void }[] = [
    {
      icon: <Copy size={16} />,
      label: t('copy'),
      onClick: () => {
        copyToClipboard(pos).then(() => {
          toast.success(t('copied').replace('{pos}', pos));
        });
        setPendingJump(null);
      },
    },
    {
      icon: <Code2 size={16} />,
      label: t('jump'),
      onClick: () => {
        useEditorStore.getState().jumpToPosition(workspaceId, path, line, column);
        emitFlutterInspectorJump({ path, line, column });
        setPendingJump(null);
      },
    },
    {
      icon: <MessageSquarePlus size={16} />,
      label: t('channel'),
      onClick: () => {
        useEditorSendStore.getState().setPendingSendToChannel({ workspaceId, position: pos });
        setPendingJump(null);
      },
    },
    {
      icon: <CirclePlus size={16} />,
      label: t('issue'),
      onClick: () => {
        useEditorSendStore.getState().setPendingSendToIssue({ workspaceId, position: pos });
        setPendingJump(null);
      },
    },
  ];

  return (
    <Dialog open={!!pendingJump} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 max-w-xs overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-sm">{t('title')}</DialogTitle>
          <DialogDescription className="text-xs font-mono truncate">{pos}</DialogDescription>
        </DialogHeader>
        <div className="p-2 pt-0">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors text-left"
            >
              <span className="text-muted-foreground">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
