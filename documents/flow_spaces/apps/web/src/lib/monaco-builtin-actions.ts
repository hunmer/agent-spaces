import { registerMonacoAction, toRelativePath } from './monaco-action-registry';
import { useEditorSendStore } from '@/stores/editor-send';
import { toast } from 'sonner';
import zhEditor from '@/locales/zh/editor.json';
import enEditor from '@/locales/en/editor.json';
import { copyToClipboard } from '@/lib/utils';

const localeMap = { zh: zhEditor, en: enEditor } as const;

function t(key: string) {
  const locale = (typeof localStorage !== 'undefined' && localStorage.getItem('agent-spaces-locale')) || 'zh';
  const msgs = localeMap[(locale === 'en' ? 'en' : 'zh') as keyof typeof localeMap];
  return (msgs as Record<string, string>)[key] ?? key;
}

export const monacoBuiltinActions = [
  {
  id: 'copyPosition',
  label: t('copyPosition'),
  contextMenuGroupId: '9_cutcopypaste',
  contextMenuOrder: 10,
  run: (editor, ctx) => {
    const model = editor.getModel();
    const sel = editor.getSelection();
    if (!model || !sel) return;
    const relPath = toRelativePath(model.uri.path, ctx);
    const pos = `${relPath || model.uri.path}:${sel.startLineNumber}:${sel.endLineNumber}`;
    copyToClipboard(pos).then(() => {
      toast.success(t('copiedPosition').replace('{pos}', pos));
    });
  },
  },
  {
  id: 'sendToNewChannel',
  label: t('sendToNewChannel'),
  contextMenuGroupId: '9_cutcopypaste',
  contextMenuOrder: 12,
  run: (editor, ctx) => {
    const model = editor.getModel();
    const sel = editor.getSelection();
    if (!model || !sel) return;
    const relPath = toRelativePath(model.uri.path, ctx);
    const pos = `${relPath || model.uri.path}:${sel.startLineNumber}:${sel.endLineNumber}`;
    useEditorSendStore.getState().setPendingSendToChannel({
      workspaceId: ctx.workspaceId,
      position: pos,
    });
  },
  },
  {
  id: 'sendToNewIssue',
  label: t('sendToNewIssue'),
  contextMenuGroupId: '9_cutcopypaste',
  contextMenuOrder: 13,
  run: (editor, ctx) => {
    const model = editor.getModel();
    const sel = editor.getSelection();
    if (!model || !sel) return;
    const relPath = toRelativePath(model.uri.path, ctx);
    const pos = `${relPath || model.uri.path}:${sel.startLineNumber}:${sel.endLineNumber}`;
    useEditorSendStore.getState().setPendingSendToIssue({
      workspaceId: ctx.workspaceId,
      position: pos,
    });
  },
  },
] satisfies Parameters<typeof registerMonacoAction>[0][];

for (const action of monacoBuiltinActions) {
  registerMonacoAction(action);
}
