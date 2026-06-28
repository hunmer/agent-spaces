## Key Concepts

### Workflow vs PromptBuilder

**Use `Workflow`** for tweaking existing JSON workflows:

```ts
const wf = Workflow.from(baseJson)
  .set('3.inputs.steps', 20)
  .input('SAMPLER', 'cfg', 4)
  .output('images:9');
```

**Use `PromptBuilder`** for programmatic graph construction:

```ts
const builder = new PromptBuilder(base, ['positive', 'seed'], ['images'])
  .setInputNode('positive', '6.inputs.text')
  .validateOutputMappings();
```

See [comparison guide](./docs/workflow-guide.md#choosing-workflow-vs-promptbuilder) for details.

### WorkflowPool

Production-ready multi-instance scheduling with automatic health checks and intelligent hash-based routing:

```ts
import { WorkflowPool, MemoryQueueAdapter, SmartFailoverStrategy } from "comfyui-node";

const pool = new WorkflowPool([
  new ComfyApi("http://localhost:8188"),
  new ComfyApi("http://localhost:8189")
], {
  failoverStrategy: new SmartFailoverStrategy({
    cooldownMs: 60_000,           // Block workflow for 60s after failure
    maxFailuresBeforeBlock: 1     // Block on first failure
  }),
  healthCheckIntervalMs: 30000, // keeps connections alive
  enableProfiling: true,        // NEW: enable automatic performance profiling
  executionStartTimeoutMs: 5000 // NEW: 5s timeout for execution to start
});

// Monitor job completion and view profiling stats
pool.on("job:completed", ev => {
  if (ev.detail.job.profileStats) {
    const { totalDuration, executionTime, summary } = ev.detail.job.profileStats;
    console.log(`Job ${ev.detail.job.jobId} completed in ${totalDuration}ms`);
    console.log(`Slowest nodes:`, summary.slowestNodes);
  }
});

const jobId = await pool.enqueue(workflow, { priority: 10 });
```

Hash-based routing intelligently handles failures at the workflow level (not client level). When a workflow fails on one client, the pool routes it to others while keeping that client available for different workflows.

See [Hash-Based Routing Guide](./docs/hash-routing-guide.md) for details and demos.

### Advanced: `MultiWorkflowPool` for Heterogeneous Clusters

For complex use cases involving a heterogeneous cluster of workers (e.g., some with SDXL models, others for video generation), `MultiWorkflowPool` provides fine-grained control over job routing based on workflow requirements.

It uses an event-driven architecture to manage clients with specific **workflow affinities**, ensuring that jobs are only sent to nodes capable of processing them.

- **Workflow Affinity:** Assign clients to specific workflows. Jobs are automatically routed to the correct client.
- **Dynamic Job Queues:** A separate job queue is created for each workflow type, preventing head-of-line blocking.
- **Event-Driven Architecture:** Zero polling for maximum efficiency and responsiveness.
- **Built-in Monitoring:** Optional real-time monitoring of client and queue states.

**Example:**
```ts
import { MultiWorkflowPool, Workflow } from "comfyui-node";
import SdxlWorkflow from './sdxl-workflow.json';
import VideoWorkflow from './video-workflow.json';

// 1. Define workflows and generate their hash for affinity mapping
const sdxlWF = Workflow.from(SdxlWorkflow).updateHash();
const videoWF = Workflow.from(VideoWorkflow).updateHash();

// 2. Create a new pool
const pool = new MultiWorkflowPool({
  logLevel: "info",
  enableMonitoring: true,
});

// 3. Add clients with workflow affinity
// This client is specialized for SDXL workflows
pool.addClient("http://localhost:8188", { workflowAffinity: [sdxlWF] });

// This client is specialized for Video workflows
pool.addClient("http://localhost:8189", { workflowAffinity: [videoWF] });

// This client is a general-purpose worker
pool.addClient("http://localhost:8190");

// 4. Initialize the pool (connects to all clients)
await pool.init();

// 5. Submit jobs
// The pool automatically routes them to the correct client
const sdxlJobId = await pool.submitJob(sdxlWF);
const videoJobId = await pool.submitJob(videoWF);

// 6. Wait for a job to complete
const results = await pool.waitForJobCompletion(sdxlJobId);
console.log("SDXL Job completed!", results.images);
```