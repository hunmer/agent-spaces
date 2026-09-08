import { MoreVertical, Play, Popover, PopoverContent, PopoverTrigger, Trash2 } from '@agent-spaces/ui';

export default function NodeHoverMenu({ actions = [], visible, open, onOpenChange, onRun, onDelete, running = false }) {
  const availableActions = actions.filter(Boolean);
  if (availableActions.length === 0 && !onRun && !onDelete) return null;
  const buttonClass = 'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-50';

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
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
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
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-48 p-1"
          onClick={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          {availableActions.map((action, index) => (
            <button
              key={action.key || action.label || index}
              type="button"
              disabled={action.disabled}
              onClick={(event) => {
                event.stopPropagation();
                action.onClick?.(event);
                onOpenChange?.(false);
              }}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50 ${
                action.destructive
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                {action.icon}
              </span>
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
