const reactCustomView = `
export default function DemoCustomView({ nodeId, data }) {
  const {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Progress,
  } = window.AgentSpacesUI;

  const title = data.title || 'Custom View Demo';
  const count = Number(data.count || 3);
  const progress = Math.max(0, Math.min(100, count * 10));

  return (
    <div className="h-full w-full bg-background p-2">
      <Card className="h-full rounded-md shadow-none">
        <CardHeader className="space-y-1 p-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="truncate text-sm">{title}</CardTitle>
            <Badge variant="secondary">React</Badge>
          </div>
          <div className="truncate text-[10px] text-muted-foreground">{nodeId}</div>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Count</span>
            <span className="font-medium">{count}</span>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 w-full"
            onClick={() => alert('customView can run client-side interactions')}
          >
            Preview Action
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
`;

const htmlCustomView = `
<div class="h-full w-full bg-background p-2 text-foreground">
  <div class="h-full rounded-md border bg-card p-3 shadow-sm">
    <div class="flex items-center justify-between gap-2">
      <div class="truncate text-sm font-semibold" data-title></div>
      <span class="rounded bg-muted px-1.5 py-0.5 text-[10px]">HTML</span>
    </div>
    <div class="mt-2 h-2 overflow-hidden rounded bg-muted">
      <div class="h-full bg-primary transition-all" data-bar></div>
    </div>
    <button
      type="button"
      class="mt-3 h-7 w-full rounded border bg-background text-xs hover:bg-muted"
      data-button
    >
      Preview Action
    </button>
  </div>
</div>
<script>
const title = props.data.title || 'HTML Custom View';
const count = Number(props.data.count || 5);
container.querySelector('[data-title]').textContent = title;
container.querySelector('[data-bar]').style.width = Math.max(0, Math.min(100, count * 10)) + '%';
container.querySelector('[data-button]').addEventListener('click', () => {
  alert('HTML customView can run scripts with props and container');
});
</script>
`;

module.exports = (t) => [
  {
    name: 'custom_view_demo_react',
    label: t('action.react.label', 'Custom View Demo'),
    category: t('category', 'Custom View'),
    icon: 'PanelTop',
    description: t('action.react.description', 'Render a workflow node body with React and window.AgentSpacesUI components.'),
    customView: {
      type: 'react',
      sourceCode: reactCustomView,
    },
    customViewMinSize: { width: 260, height: 190 },
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', default: 'Custom View Demo' },
      { key: 'count', label: t('field.count.label', 'Count'), type: 'number', default: 3 },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object' },
    ],
    run: async (_ctx, args) => {
      return {
        success: true,
        message: `Rendered ${args.title || 'Custom View Demo'}`,
        data: {
          title: args.title || 'Custom View Demo',
          count: Number(args.count || 3),
        },
      }
    },
  },
  {
    name: 'custom_view_demo_html',
    label: t('action.html.label', 'HTML Custom View Demo'),
    category: t('category', 'Custom View'),
    icon: 'Code2',
    description: t('action.html.description', 'Render a workflow node body with plain HTML and scripts.'),
    customView: {
      type: 'html',
      sourceCode: htmlCustomView,
    },
    customViewMinSize: { width: 240, height: 160 },
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', default: 'HTML Custom View' },
      { key: 'count', label: t('field.count.label', 'Count'), type: 'number', default: 5 },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (_ctx, args) => ({
      success: true,
      message: `Rendered ${args.title || 'HTML Custom View'}`,
    }),
  },
]
