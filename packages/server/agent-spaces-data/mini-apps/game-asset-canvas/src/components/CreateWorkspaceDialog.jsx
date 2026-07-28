// 工作区对话框：创建 / 重命名复用同一组件（mode 控制）。
// 创建模式：名称 + 可选数据保存目录。
// 重命名模式：名称 + 数据保存目录（均可编辑）+ 「打开文件夹」按钮定位到当前目录。
import { useEffect, useRef, useState } from 'react';
import { FolderPicker, FolderOpen } from '@agent-spaces/ui';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button,
} = window.AgentSpacesUI;

/**
 * @param {{
 *   open: boolean,
 *   mode?: 'create' | 'rename', // 默认 create
 *   defaultName?: string,       // 创建模式默认填充名称
 *   initialName?: string,       // 重命名模式初始名称
 *   initialDirectory?: string,  // 重命名模式初始目录（预填到 FolderPicker）
 *   onClose: ()=>void,
 *   onConfirm:(payload:{name:string, directory?:string})=>void,
 * }} props
 *
 * onConfirm 统一返回 { name, directory? }：
 * - 创建模式：name + 可选 directory
 * - 重命名模式：name + directory（空串表示清除目录）
 */
export default function CreateWorkspaceDialog({
  open, mode = 'create', defaultName, initialName, initialDirectory, onClose, onConfirm,
}) {
  const isRename = mode === 'rename';
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(isRename ? (initialName || '') : (defaultName || ''));
      setDirectory(isRename ? (initialDirectory || '') : '');
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.select(); }
      });
    }
  }, [open, isRename, defaultName, initialName, initialDirectory]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const trimmedDir = directory.trim();
    // 创建模式：留空不带 directory；重命名模式：始终回传（空串=清除）
    const payload = isRename
      ? { name: trimmed, directory: trimmedDir }
      : { name: trimmed, ...(trimmedDir ? { directory: trimmedDir } : {}) };
    onConfirm(payload);
    onClose();
  };

  // 在系统文件管理器中定位到当前目录（重命名模式且已填目录时可用）
  const handleReveal = () => {
    const dir = directory.trim();
    if (!dir) return;
    window.AgentSpaces?.revealAbsolutePath?.(dir).catch((e) => console.warn('reveal failed:', e));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isRename ? '重命名工作区' : '新建工作区'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">工作区名称</label>
            <input
              ref={inputRef}
              value={name}
              placeholder="工作区名称"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                数据保存目录{isRename ? '' : '（可选）'}
              </label>
              {isRename && directory.trim() && (
                <button
                  type="button"
                  onClick={handleReveal}
                  title="在文件管理器中打开"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-primary"
                >
                  <FolderOpen className="h-3 w-3" />
                  打开文件夹
                </button>
              )}
            </div>
            <FolderPicker
              value={directory}
              onChange={setDirectory}
              placeholder={isRename ? '留空则不保存到本地目录' : '留空则不保存到本地目录'}
            />
            <p className="text-xs text-muted-foreground">
              设置后，该工作区节点产出的图片会自动复制一份到此目录。留空则仅在画布内保存。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            {isRename ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
