// 文件夹树侧边栏
// 把 Eagle 扁平文件夹数组（含 id / parent / name）构建成树，
// 支持新建子文件夹、重命名、面包屑式逐层浏览。
import { useMemo, useState } from "react";

const ui = window.AgentSpacesUI;
const Button = ui.Button;
const Input = ui.Input;
const ScrollArea = ui.ScrollArea;
const Loader2 = ui.Loader2;
const FolderIcon = ui.Folder;
const FolderPlus = ui.FolderPlus;
const ChevronRight = ui.ChevronRight;
const Pencil = ui.Pencil;

// 把扁平数组按 parent 组装成子节点映射
function buildTree(folders) {
  const byParent = new Map();
  const nodeMap = new Map();
  folders.forEach((f) => nodeMap.set(f.id, { ...f, children: [] }));
  folders.forEach((f) => {
    const p = f.parent;
    const key = p == null || p === "" ? "__root__" : p;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(nodeMap.get(f.id));
  });
  // 排序
  byParent.forEach((arr) => arr.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
  return { byParent, nodeMap };
}

export default function FolderTree({
  folders,
  loading,
  activeFolderId,
  onSelect,
  onRefresh,
  onCreate,
  onRename,
}) {
  const { byParent } = useMemo(() => buildTree(folders || []), [folders]);
  const [creatingParent, setCreatingParent] = useState(null); // null | "__root__" | folderId
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCreate(parentKey) {
    const name = newName.trim();
    if (!name) {
      setCreatingParent(null);
      setNewName("");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        name,
        parent: parentKey === "__root__" ? undefined : parentKey,
      });
      setNewName("");
      setCreatingParent(null);
      onRefresh();
    } catch (e) {
      alert(e?.message || "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitRename(id) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    try {
      await onRename({ id, name });
      setRenamingId(null);
      onRefresh();
    } catch (e) {
      alert(e?.message || "重命名失败");
    } finally {
      setBusy(false);
    }
  }

  function renderNodes(parentKey, depth) {
    const nodes = byParent.get(parentKey) || [];
    return nodes.map((node) => {
      const isActive = node.id === activeFolderId;
      const hasChildren = (byParent.get(node.id) || []).length > 0;
      return (
        <div key={node.id}>
          <div
            className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
              isActive
                ? "bg-primary/15 text-primary"
                : "hover:bg-muted text-foreground"
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => onSelect(node.id)}
          >
            <FolderIcon className="h-4 w-4 shrink-0 opacity-70" />
            {renamingId === node.id ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename(node.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="h-6 flex-1 py-0 text-sm"
              />
            ) : (
              <span className="flex-1 truncate">{node.name || "未命名"}</span>
            )}
            <button
              className="hidden group-hover:flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
              title="重命名"
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(node.id);
                setRenameValue(node.name || "");
              }}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="hidden group-hover:flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
              title="新建子文件夹"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingParent(node.id);
                setNewName("");
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          {hasChildren && renderNodes(node.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">文件夹</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="新建根文件夹"
          disabled={busy}
          onClick={() => {
            setCreatingParent("__root__");
            setNewName("");
          }}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* 全部素材 */}
          <div
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 mx-2 text-sm cursor-pointer ${
              activeFolderId == null
                ? "bg-primary/15 text-primary"
                : "hover:bg-muted text-foreground"
            }`}
            onClick={() => onSelect(null)}
          >
            <FolderIcon className="h-4 w-4 shrink-0 opacity-70" />
            <span className="flex-1">全部素材</span>
          </div>

          {creatingParent === "__root__" && (
            <div className="flex items-center gap-1 px-2 py-1">
              <Input
                autoFocus
                value={newName}
                placeholder="文件夹名"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate("__root__");
                  if (e.key === "Escape") setCreatingParent(null);
                }}
                className="h-7 flex-1 text-sm"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => submitCreate("__root__")}
              >
                确定
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            renderNodes("__root__", 0)
          )}

          {creatingParent && creatingParent !== "__root__" && (
            <div
              className="flex items-center gap-1 px-2 py-1"
              style={{ paddingLeft: 24 }}
            >
              <Input
                autoFocus
                value={newName}
                placeholder="子文件夹名"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreate(creatingParent);
                  if (e.key === "Escape") setCreatingParent(null);
                }}
                className="h-7 flex-1 text-sm"
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
