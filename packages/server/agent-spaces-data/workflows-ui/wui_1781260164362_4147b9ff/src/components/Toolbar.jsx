const { Button, Plus, Settings } = window.AgentSpacesUI;

export default function Toolbar({ total, onNew, onOpenSettings }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">文案管理</h1>
        {total > 0 && <span className="text-sm text-muted-foreground">共 {total} 条</span>}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onOpenSettings} title="存储设置">
          <Settings className="size-4" />
        </Button>
        <Button onClick={onNew}>
          <Plus className="size-4" />新建文案
        </Button>
      </div>
    </div>
  );
}
