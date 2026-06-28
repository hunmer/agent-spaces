# ComfyUI SDK

[![NPM Version](https://img.shields.io/npm/v/comfyui-node?style=flat-square)](https://www.npmjs.com/package/comfyui-node)
[![License](https://img.shields.io/npm/l/comfyui-node?style=flat-square)](https://github.com/igorls/comfyui-node/blob/main/LICENSE)
![CI](https://github.com/igorls/comfyui-node/actions/workflows/ci.yml/badge.svg)
![Type Coverage](https://img.shields.io/badge/type--coverage-95%25-brightgreen?style=flat-square)
![Node Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square)

TypeScript SDK for interacting with the [ComfyUI](https://github.com/comfyanonymous/ComfyUI) API – focused on workflow construction, prompt execution orchestration, multi-instance scheduling and extension integration.

## Features

- Fully typed TypeScript surface with progressive output typing
- High-level `Workflow` API – tweak existing JSON workflows with minimal boilerplate
- Low-level `PromptBuilder` – programmatic graph construction with validation
- WebSocket events – progress, preview, output, completion with reconnection
- Multi-instance pooling – `WorkflowPool` with smart failover & health checks (v1.4.1+)
- Modular features – `api.ext.*` namespaces (queue, history, system, file, etc.)
- Authentication – basic, bearer token, custom headers
- Image attachments – upload files directly with workflow submissions
- Preview metadata – rich preview frames with metadata support
- Auto seed substitution – `seed: -1` randomized automatically
- API node support – compatible with custom/paid API nodes (Comfy.org)

## Installation

Requires Node.js >= 22. Works with Bun.

```bash
npm install comfyui-node
```

## Quick Start

```ts
import { ComfyApi, Workflow } from 'comfyui-node';
import BaseWorkflow from './example-txt2img-workflow.json';

const api = await new ComfyApi('http://127.0.0.1:8188').ready();

const wf = Workflow.from(BaseWorkflow)
  .set('6.inputs.text', 'A dramatic cinematic landscape')
  .output('images:9');

const job = await api.run(wf, { autoDestroy: true });
job.on('progress_pct', p => console.log(`${p}%`));

const result = await job.done();
for (const img of (result.images?.images || [])) {
  console.log(api.ext.file.getPathImage(img));
}
```

## Documentation

### Getting Started

- **[Getting Started Guide](./docs/getting-started.md)** – Installation, quick start, core concepts, cheat sheet
- **[Workflow Guide](./docs/workflow-guide.md)** – Complete high-level Workflow API tutorial with progressive typing
- **[PromptBuilder Guide](./docs/prompt-builder.md)** – Lower-level graph construction, validation, serialization

### Multi-Instance Pooling

- **[WorkflowPool Documentation](./docs/workflow-pool.md)** – Production-ready pooling with health checks, profiling, and timeout protection
- **[Event-Based Logging](./docs/logging.md)** – Guide to the new event-based logging system (v1.6.7+)
- **[Connection Stability Guide](./docs/websocket-idle-issue.md)** – WebSocket health check implementation details
- **[Hash-Based Routing Guide](./docs/hash-routing-guide.md)** – Workflow-level failure tracking and intelligent failover
- **[Profiling Guide](./docs/profiling.md)** – Automatic per-node performance profiling (v1.5.0+)
- **[Execution Timeout Guide](./docs/execution-timeout.md)** – Timeout protection for stuck servers and nodes (v1.5.0+)

### Advanced Features

- **[Advanced Usage](./docs/advanced-usage.md)** – Authentication, events, preview metadata, API nodes, image attachments
- **[API Features](./docs/api-features.md)** – Modular `api.ext.*` namespaces (queue, file, system, etc.)

### Help & Migration

- **[Troubleshooting](./docs/troubleshooting.md)** – Common issues, error types, testing, diagnostics
- **[Migration Guide](./docs/migration-guide.md)** – Upgrading from <1.0 to 1.0+ with complete API mappings