const webviewCustomView = `
export default function WebviewCustomView({ data }) {
  const [url, setUrl] = React.useState(
    typeof data.url === 'string' && data.url.trim() ? data.url.trim() : 'https://example.com',
  );
  const [title, setTitle] = React.useState(
    typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Webview',
  );

  React.useEffect(() => {
    const nextUrl = typeof data.url === 'string' && data.url.trim() ? data.url.trim() : 'https://example.com';
    setUrl(nextUrl);
  }, [data.url]);

  React.useEffect(() => {
    const nextTitle = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Webview';
    setTitle(nextTitle);
  }, [data.title]);

  const isWeb = typeof window !== 'undefined' && !window.electronAPI;
  const viewer = isWeb ? (
    <iframe
      key={url}
      src={url}
      title={title}
      className="h-full w-full border-0"
      sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      referrerPolicy="no-referrer"
    />
  ) : (
    <webview
      key={url}
      src={url}
      className="h-full w-full border-0"
      allowpopups=""
    />
  );

  return (
    <div className="h-full w-full bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
          <div className="min-w-0 flex-1 truncate text-xs font-medium">{title || url}</div>
          <a
            className="shrink-0 rounded border px-2 py-1 text-[11px] hover:bg-muted"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            {isWeb ? 'Open' : 'Window'}
          </a>
        </div>
        <div className="min-h-0 flex-1 bg-background">
          {viewer}
        </div>
      </div>
    </div>
  );
}
`;

module.exports = (t) => [
  {
    name: 'open_webview',
    label: t('action.open_webview.label', 'Open Webview'),
    category: t('category', 'Webview'),
    icon: 'PanelTopOpen',
    description: t('action.open_webview.description', 'Add a webview node rendered with customView. Electron uses webview; Web falls back to iframe.'),
    customView: {
      type: 'react',
      sourceCode: webviewCustomView,
    },
    customViewMinSize: { width: 420, height: 300 },
    tool: false,
    properties: [
      { key: 'url', label: t('field.url.label', 'URL'), type: 'text', required: true, default: 'https://example.com', tooltip: t('field.url.tooltip', 'The URL to show in the webview') },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', default: 'Webview', tooltip: t('field.title.tooltip', 'Webview title') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'url', type: 'string' },
        { key: 'title', type: 'string' },
        { key: 'fallback', type: 'boolean' },
      ] },
    ],
    run: async (ctx, args) => {
      const url = String(args.url || '').trim()
      if (!url) {
        return { success: false, message: t('message.urlRequired', 'URL is required'), data: { fallback: true } }
      }

      const title = args.title || 'Webview'
      return {
        success: true,
        message: t('message.webviewReady', 'Webview ready'),
        data: { url, title, fallback: true },
      }
    },
  },
]
