import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, MoreVertical, Play, Trash2 } from '@agent-spaces/ui';

/**
 * 节点 hover 工具菜单：右上角纵向小图标列（运行/删除/更多），
 * 点「更多」弹出宿主 DropdownMenu 菜单；action.children 用 DropdownMenuSub
 * 渲染子菜单（hover 展开，交互由组件内置）。
 */
export default function NodeHoverMenu({ actions = [], visible, open, onOpenChange, onRun, onDelete, running = false }) {
  const availableActions = actions.filter(Boolean);
  if (availableActions.length === 0 && !onRun && !onDelete) return null;
  const buttonClass = 'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-50';

  const renderItemChildren = (item) => (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </>
  );

  return (
    <div
      className={`nodrag nopan nowheel absolute right-2 top-2 z-40 flex flex-col items-center gap-0.5 rounded-full border border-border bg-background/95 p-0.5 shadow-md backdrop-blur-sm transition-all duration-150 ${
        visible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-1 opacity-0'
      }`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onRun && (
        <button
          type="button"
          title={running ? '运行中' : '运行节点'}
          aria-label="运行节点"
          disabled={running}
          className={buttonClass}
          onClick={(event) => {
            event.stopPropagation();
            onRun();
          }}
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          title="删除节点"
          aria-label="删除节点"
          className={`${buttonClass} hover:text-destructive`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={(
            <button
              type="button"
              title="节点操作"
              aria-label="节点操作"
              className={buttonClass}
            />
          )}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-48 p-1"
          onClick={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          {availableActions.map((action, index) => {
            const key = action.key || action.label || index;
            const children = Array.isArray(action.children) ? action.children.filter(Boolean) : null;
            if (children) {
              return (
                <DropdownMenuSub key={key}>
                  <DropdownMenuSubTrigger disabled={action.disabled}>
                    {renderItemChildren(action)}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    {children.map((child, childIndex) => (
                      <DropdownMenuItem
                        key={child.key || child.label || childIndex}
                        disabled={child.disabled}
                        variant={child.destructive ? 'destructive' : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          child.onClick?.(event);
                        }}
                      >
                        {renderItemChildren(child)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            }
            return (
              <DropdownMenuItem
                key={key}
                disabled={action.disabled}
                variant={action.destructive ? 'destructive' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onClick?.(event);
                }}
              >
                {renderItemChildren(action)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
