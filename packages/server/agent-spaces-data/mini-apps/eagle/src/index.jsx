// Eagle 资源库预览
// 左侧文件夹树（多层级、新建/重命名）+ 右侧素材瀑布流（上传/删除）
// 通过 window.AgentSpaces.callPluginTool 调用 workflow.eagle 插件。
import { useCallback, useEffect, useMemo, useState } from "react";
import FolderTree from "./components/FolderTree";
import ItemGallery from "./components/ItemGallery";
import { useEagle } from "./hooks/useEagle";

const ui = window.AgentSpacesUI;
const Card = ui.Card;
const Button = ui.Button;
const Loader2 = ui.Loader2;
const RefreshCw = ui.RefreshCw;
const Breadcrumb = ui.Breadcrumb;
const BreadcrumbList = ui.BreadcrumbList;
const BreadcrumbItem = ui.BreadcrumbItem;
const BreadcrumbLink = ui.BreadcrumbLink;
const BreadcrumbSeparator = ui.BreadcrumbSeparator;
const BreadcrumbPage = ui.BreadcrumbPage;
const FolderIcon = ui.Folder;

export default function App() {
  const eagle = useEagle();
  // 暴露给子组件用（简化 props）
  if (!window.__eagleApi) window.__eagleApi = eagle;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState(null); // null = 全部素材

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await eagle.listFolders();
      setFolders(res?.data?.folders || []);
    } catch (e) {
      setError(e?.message || "加载文件夹失败");
    } finally {
      setLoadingFolders(false);
    }
  }, [eagle]);

  useEffect(() => {
    (async () => {
      try {
        await eagle.appInfo();
        await loadFolders();
        setReady(true);
      } catch (e) {
        setError(
          (e?.message || "无法连接 Eagle") +
            "\n请确认已运行 Eagle 4.0 Build 21+，且 workflow.eagle 插件已启用。"
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当前文件夹的祖先链（用于面包屑）
  const breadcrumb = useMemo(() => {
    if (activeFolderId == null) return [];
    const map = new Map(folders.map((f) => [f.id, f]));
    const chain = [];
    let cur = map.get(activeFolderId);
    let guard = 0;
    while (cur && guard < 50) {
      chain.unshift(cur);
      cur = cur.parent ? map.get(cur.parent) : undefined;
      guard++;
    }
    return chain;
  }, [folders, activeFolderId]);

  const handleCreate = useCallback(
    ({ name, parent }) => eagle.createFolder({ name, parent }),
    [eagle]
  );
  const handleRename = useCallback(
    ({ id, name }) => eagle.renameFolder({ id, name }),
    [eagle]
  );

  if (error) {
    return (
      <main className="flex min-h-full items-center justify-center bg-background p-6">
        <Card className="max-w-lg p-6">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            无法连接 Eagle
          </h2>
          <pre className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {error}
          </pre>
        </Card>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-full items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-full bg-background text-foreground">
      <FolderTree
        folders={folders}
        loading={loadingFolders}
        activeFolderId={activeFolderId}
        onSelect={setActiveFolderId}
        onRefresh={loadFolders}
        onCreate={handleCreate}
        onRename={handleRename}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* 面包屑 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Breadcrumb>
            <BreadcrumbList className="text-sm">
              <BreadcrumbItem>
                {activeFolderId == null ? (
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    <FolderIcon className="h-4 w-4 opacity-70" />
                    全部素材
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="flex cursor-pointer items-center gap-1.5"
                    onClick={() => setActiveFolderId(null)}
                  >
                    <FolderIcon className="h-4 w-4 opacity-70" />
                    全部素材
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {breadcrumb.map((f, i) => (
                <span key={f.id} className="flex items-center gap-0">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {i === breadcrumb.length - 1 ? (
                      <BreadcrumbPage className="max-w-[240px] truncate">
                        {f.name}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="cursor-pointer max-w-[200px] truncate"
                        onClick={() => setActiveFolderId(f.id)}
                      >
                        {f.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8"
            title="刷新"
            onClick={loadFolders}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <ItemGallery
          folderId={activeFolderId}
          folders={folders}
          onChange={loadFolders}
        />
      </div>
    </main>
  );
}
