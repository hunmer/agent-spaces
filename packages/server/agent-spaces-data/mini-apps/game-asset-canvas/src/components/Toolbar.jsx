import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from '@agent-spaces/ui';

/**
 * 顶部工具栏：标题 + Menubar（文件/工具/编辑器）+ 右侧插槽（工作区切换/执行队列/节点数）。
 *
 * Menubar 收纳：自动布局 / 导出 JSON / 设置 / 清空 / 动画编辑器（独立窗口）。
 * @param {{ onClear, onAutoLayout, onExport, onOpenSettings, onSelectAll, onInvertSelect, onClearSelection, count, queueSlot, workspaceSlot }} props
 */
export default function Toolbar({ onClear, onAutoLayout, onExport, onOpenSettings, onSelectAll, onInvertSelect, onClearSelection, count, queueSlot, workspaceSlot }) {
  // 像素编辑器：新窗口打开本地 Pixelorama web 版（与节点内编辑器同源，独立全屏编辑，支持像素绘制与动画帧）。
  // 用 window.location.origin 拼，兼容 dev(3000)/dist(3100)。
  const openPixelEditor = () => {
    const url = `${window.location.origin}/api/mini-apps/game-asset-canvas/src/file/vendor/pixelorama-web/index.html?nosplash=1`;
    window.open(url, '_blank', 'noopener');
  };

  // 3D 导演台：新窗口打开 director-desk-web（与节点内编辑器同源）。
  const openDirectorDesk = () => {
    const url = `${window.location.origin}/api/mini-apps/game-asset-canvas/src/file/vendor/director-desk-web/index.html`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      {workspaceSlot}
      <div className="mx-1 h-5 w-px bg-border" />

      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>文件</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onExport}>导出 JSON</MenubarItem>
            <MenubarItem onClick={onClear} variant="destructive">清空画布</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>工具</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onAutoLayout}>自动布局</MenubarItem>
            <MenubarItem onClick={onOpenSettings}>设置</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>选择</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onSelectAll}>全选</MenubarItem>
            <MenubarItem onClick={onInvertSelect}>反选</MenubarItem>
            <MenubarItem onClick={onClearSelection}>取消选择</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>编辑器</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={openPixelEditor}>像素编辑器</MenubarItem>
            <MenubarItem onClick={openDirectorDesk}>3D导演台</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="ml-auto flex items-center gap-2">
        {queueSlot}
        <span className="text-xs text-muted-foreground">{count} 个节点</span>
      </div>
    </div>
  );
}
