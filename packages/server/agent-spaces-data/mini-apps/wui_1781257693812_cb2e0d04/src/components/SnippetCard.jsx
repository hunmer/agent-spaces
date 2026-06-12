const { Badge, Button, Card, CardContent, CardHeader, CardTitle } = window.AgentSpacesUI;
const { Pencil, Trash2, Clock, Copy } = window.AgentSpacesUI;

// 单条片段展示。有代码则显示代码体 + 复制按钮。
export default function SnippetCard({ snippet, onEdit, onDelete }) {
  const tags = snippet.tags
    ? String(snippet.tags).split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  const updated = snippet.updated_at ? new Date(snippet.updated_at).toLocaleString() : '';

  const copyCode = () => {
    if (snippet.code) navigator.clipboard?.writeText(snippet.code);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">{snippet.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{snippet.language}</Badge>
            {tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(snippet)} title="编辑">
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(snippet)} title="删除">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      {snippet.code ? (
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
            {snippet.code}
          </pre>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />{updated}
            </span>
            <Button size="sm" variant="ghost" onClick={copyCode}>
              <Copy className="size-3.5" />复制
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
