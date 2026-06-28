## What's New in v1.6.5

- **Integration Test Infrastructure** – Comprehensive reconnection testing with real mock server processes
  - Mock servers spawn in separate OS processes that can be killed/restarted
  - 13 integration tests covering manual/auto-reconnection, state transitions, and multiple restart cycles
  - Test helpers and utilities for easy test development
  - 900+ lines of documentation with quick-start guide and examples
  - Run with: `bun test test/integration/` or `bun run test:integration`

See [CHANGELOG.md](./CHANGELOG.md) for complete release notes.

## Examples

Check the `scripts/` directory for comprehensive examples:

- **Basic workflows:** `workflow-tutorial-basic.ts`, `test-simple-txt2img.ts`
- **Image editing:** `qwen-image-edit-demo.ts`, `qwen-image-edit-queue.ts`
- **Pooling:** `workflow-pool-demo.ts`, `workflow-pool-debug.ts`
- **Node bypass:** `demo-node-bypass.ts`, `demo-workflow-bypass.ts`
- **API nodes:** `api-node-image-edit.ts` (Comfy.org paid nodes)
- **Image loading:** `image-loading-demo.ts`

Live demo: `demos/recursive-edit/` – recursive image editing server + web client.

## API Reference

### ComfyApi Client

```ts
const api = new ComfyApi('http://127.0.0.1:8188', 'optional-id', {
  credentials: { type: 'basic', username: 'user', password: 'pass' },
  wsTimeout: 60000,
  comfyOrgApiKey: process.env.COMFY_ORG_API_KEY,
  debug: true
});

await api.ready();  // Connection + feature probing
```

### Modular Features (`api.ext`)

```ts
await api.ext.queue.queuePrompt(null, workflow);
await api.ext.queue.interrupt();
const stats = await api.ext.system.getSystemStats();
const checkpoints = await api.ext.node.getCheckpoints();
await api.ext.file.uploadImage(buffer, 'image.png');
const history = await api.ext.history.getHistory('prompt-id');
```

See [API Features docs](./docs/api-features.md) for complete namespace reference.

### Events

```ts
api.on('progress', ev => console.log(ev.detail.value, '/', ev.detail.max));
api.on('b_preview', ev => console.log('Preview:', ev.detail.size));
api.on('executed', ev => console.log('Node:', ev.detail.node));

job.on('progress_pct', pct => console.log(`${pct}%`));
job.on('preview', blob => console.log('Preview:', blob.size));
job.on('failed', err => console.error(err));
```