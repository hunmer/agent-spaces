import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from '@agent-spaces/ui';

/**
 * 顶部工具栏：标题 + Menubar + 右侧插槽（工作区切换/执行队列/节点数）。
 *
 * Menubar 布局：
 *   文件▾(导出/导入) | 画布▾(自动布局/清空) | 工具▾(像素编辑器/3D导演台/在线PS/提示词管理/设置) | 选择▾(全选/反选/取消选择)
 *
 * @param {{ onClear, onAutoLayout, onExport, onImport, onOpenSettings, onOpenPromptManager,
 *           edgePathStyle, edgeLineStyle, edgePathStyles, edgeLineStyles, onEdgePathStyleChange, onEdgeLineStyleChange,
 *           onSelectAll, onInvertSelect, onClearSelection,
 *           count, queueSlot, workspaceSlot }} props
 */
export default function Toolbar({
  onClear, onAutoLayout, onExport, onImport, onOpenSettings, onOpenPromptManager,
  edgePathStyle, edgeLineStyle, edgePathStyles, edgeLineStyles, onEdgePathStyleChange, onEdgeLineStyleChange,
  onSelectAll, onInvertSelect, onClearSelection,
  count, queueSlot, workspaceSlot,
}) {
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

  // 在线PS：新窗口打开 Photopea（浏览器版 Photoshop，无需本地依赖）。
  const openOnlinePS = () => {
    window.open('https://www.photopea.com', '_blank', 'noopener');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      {workspaceSlot}
      <div className="mx-1 h-5 w-px bg-border" />

      <Menubar>
        {/* 文件▾：导出 / 导入 */}
        <MenubarMenu>
          <MenubarTrigger>文件</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onExport}>导出</MenubarItem>
            <MenubarItem onClick={onImport}>导入</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* 画布▾：自动布局 / 清空 */}
        <MenubarMenu>
          <MenubarTrigger>画布</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onAutoLayout}>自动布局</MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>连线</MenubarSubTrigger>
              <MenubarSubContent>
                {(edgePathStyles || []).map((style) => (
                  <MenubarItem key={style} onClick={() => onEdgePathStyleChange?.(style)}>
                    {edgePathStyle === style ? '✓ ' : ''}{style}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>线条</MenubarSubTrigger>
              <MenubarSubContent>
                {(edgeLineStyles || []).map((style) => (
                  <MenubarItem key={style} onClick={() => onEdgeLineStyleChange?.(style)}>
                    {edgeLineStyle === style ? '✓ ' : ''}{style === 'dashed' ? '虚线' : '实线'}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onClick={onClear} variant="destructive">清空</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* 工具▾：像素编辑器 / 3D导演台 / 在线PS / 提示词管理 / 设置（原「编辑器」菜单改名） */}
        <MenubarMenu>
          <MenubarTrigger>工具</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={openPixelEditor}>像素编辑器</MenubarItem>
            <MenubarItem onClick={openDirectorDesk}>3D导演台</MenubarItem>
            <MenubarItem onClick={openOnlinePS}>在线PS</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={onOpenPromptManager}>提示词管理</MenubarItem>
            <MenubarItem onClick={onOpenSettings}>设置</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* 选择▾：全选 / 反选 / 取消选择 */}
        <MenubarMenu>
          <MenubarTrigger>选择</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={onSelectAll}>全选</MenubarItem>
            <MenubarItem onClick={onInvertSelect}>反选</MenubarItem>
            <MenubarItem onClick={onClearSelection}>取消选择</MenubarItem>
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
