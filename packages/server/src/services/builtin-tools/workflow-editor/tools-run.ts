import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';
import { getWorkflowExecutionManager } from '../workflow-exec-tools.js';
import * as workflowService from '../../workflow.js';
import {
  arrayStringInput,
  asRecord,
  clone,
  compactObject,
  numberInput,
  objectInputAny,
  schema,
  sleep,
  stringInputAny,
  stringInputObject,
} from './helpers.js';
import { getRequiredInputKeys, missingRequiredKeys } from './validation.js';
import type { ToolDeps } from './types.js';

const DEFAULT_DRY_RUN_TIMEOUT_MS = 120_000;
const MAX_DRY_RUN_TIMEOUT_MS = 600_000;
const DRY_RUN_POLL_INTERVAL_MS = 500;

export function createDryRunTool(deps: ToolDeps): AgentFunctionTool {
  return {
    name: 'dry_run',
    description: '使用当前未保存的工作流草稿执行一次 dry run。可传 node_ids 限定哪些节点使用自定义输入/输出；不传 node_ids 时，所有提供了自定义 inputs/outputs 的节点都会生效。outputs 用于跳过需要密钥或会产生实际消耗的节点。',
    inputSchema: schema({
      startNodeId: { type: 'string', description: '可选，起始节点 ID。多开始节点时必须提供。' },
      start_node_id: { type: 'string', description: '起始节点 ID，兼容蛇形命名。' },
      workflow_input: { type: 'object', description: '可选，工作流整体输入，会传给 start 节点。', properties: {} },
      input: { type: 'object', description: 'workflow_input alias.', properties: {} },
      workflowInput: { type: 'object', description: 'workflow_input alias.', properties: {} },
      node_ids: { type: 'array', description: '可选，只对这些节点启用自定义 inputs/outputs。', items: { type: 'string' } },
      nodeIds: { type: 'array', description: 'node_ids alias.', items: { type: 'string' } },
      inputs: { type: ['object', 'string'], description: '可选，按节点 ID 设置运行时输入，例如 { "node_id": { "field": "value" } }。也兼容 JSON 字符串。', properties: {} },
      custom_inputs: { type: ['object', 'string'], description: 'inputs alias.', properties: {} },
      outputs: { type: ['object', 'string'], description: '可选，按节点 ID 设置模拟输出；提供后该节点不执行真实逻辑，直接返回此输出。也兼容 JSON 字符串。', properties: {} },
      custom_outputs: { type: ['object', 'string'], description: 'outputs alias.', properties: {} },
      max_wait_ms: { type: 'number', description: `等待 dry run 完成的最长时间，默认 ${DEFAULT_DRY_RUN_TIMEOUT_MS}，最大 ${MAX_DRY_RUN_TIMEOUT_MS}。` },
    }),
    annotations: { readOnly: true },
    execute: async (input) => {
      const { draft } = deps;
      const manager = getWorkflowExecutionManager();
      if (!manager) return { success: false, message: 'Workflow execution manager is not initialized' };

      const record = asRecord(input);
      const startNodeId = stringInputAny(record, ['startNodeId', 'start_node_id']);
      const startNode = startNodeId
        ? draft.current.nodes.find((node) => node.id === startNodeId)
        : draft.current.nodes.filter((node) => node.type === 'start').length === 1
          ? draft.current.nodes.find((node) => node.type === 'start')
          : undefined;
      const snakeNodeIds = arrayStringInput(record.node_ids);
      const nodeIds = snakeNodeIds.length > 0 ? snakeNodeIds : arrayStringInput(record.nodeIds);
      const workflowInput = objectInputAny(record, ['workflow_input', 'workflowInput', 'input']);
      const dryRunInputs = {
        ...stringInputObject(record, 'inputs'),
        ...objectInputAny(record, ['inputs', 'custom_inputs']),
      };
      const dryRunOutputs = {
        ...stringInputObject(record, 'outputs'),
        ...objectInputAny(record, ['outputs', 'custom_outputs']),
      };
      const result = await manager.execute({
        workflowId: draft.current.id,
        input: workflowInput,
        startNodeId,
        snapshot: {
          nodes: clone(draft.current.nodes),
          edges: clone(draft.current.edges),
          groups: clone(draft.current.groups || []),
          variables: clone(draft.current.variables || []),
        },
        dryRun: {
          ...(nodeIds.length > 0 ? { nodeIds } : {}),
          inputs: dryRunInputs,
          outputs: dryRunOutputs,
        },
      }, 'workflow-editor-dry-run');

      const timeoutMs = Math.min(MAX_DRY_RUN_TIMEOUT_MS, Math.max(DRY_RUN_POLL_INTERVAL_MS, numberInput(record, 'max_wait_ms', DEFAULT_DRY_RUN_TIMEOUT_MS)));
      const startedAt = Date.now();
      let status = result.status;
      let log = manager.getExecutionRecovery({ workflowId: draft.current.id, executionId: result.executionId }, 'workflow-editor-dry-run').execution?.log;
      while (Date.now() - startedAt < timeoutMs) {
        const recovery = manager.getExecutionRecovery({ workflowId: draft.current.id, executionId: result.executionId }, 'workflow-editor-dry-run');
        log = recovery.execution?.log ?? workflowService.getExecutionLog(draft.current.id, result.executionId) ?? log;
        status = log?.status ?? recovery.execution?.status ?? status;
        if (status !== 'running') break;
        await sleep(DRY_RUN_POLL_INTERVAL_MS);
      }

      log = log ?? workflowService.getExecutionLog(draft.current.id, result.executionId) ?? undefined;
      const recovery = manager.getExecutionRecovery({ workflowId: draft.current.id, executionId: result.executionId }, 'workflow-editor-dry-run');
      const timedOut = status === 'running';
      const steps = log?.steps.map((step) => ({
        nodeId: step.nodeId,
        nodeLabel: step.nodeLabel,
        status: step.status,
        input: step.input,
        output: step.output,
        error: step.error,
        logs: step.logs,
      })) ?? [];
      const overrideNodeIds = Array.from(new Set([
        ...Object.keys(dryRunInputs),
        ...Object.keys(dryRunOutputs),
      ]));
      const skippedOverrideNodeIds = overrideNodeIds.filter((nodeId) => steps.some((step) => step.nodeId === nodeId && step.status === 'skipped'));
      const executedOrMockedNodeIds = steps.filter((step) => step.status === 'completed').map((step) => step.nodeId);
      const endNodeIds = draft.current.nodes.filter((node) => node.type === 'end').map((node) => node.id);
      const completedEndNodeIds = endNodeIds.filter((nodeId) => executedOrMockedNodeIds.includes(nodeId));
      const missingStartInputs = missingRequiredKeys(getRequiredInputKeys(startNode), workflowInput);
      const skippedStepCount = steps.filter((step) => step.status === 'skipped').length;
      const success = !timedOut
        && status === 'completed'
        && missingStartInputs.length === 0
        && (endNodeIds.length === 0 || completedEndNodeIds.length > 0)
        && skippedOverrideNodeIds.length === 0
        && (overrideNodeIds.length === 0 || overrideNodeIds.some((nodeId) => executedOrMockedNodeIds.includes(nodeId)));
      const failureReasons = [
        ...(timedOut ? ['dry_run timed out'] : []),
        ...(status !== 'completed' ? [`workflow status is ${status}`] : []),
        ...(missingStartInputs.length > 0 ? [`missing required workflow_input fields: ${missingStartInputs.join(', ')}`] : []),
        ...(endNodeIds.length > 0 && completedEndNodeIds.length === 0 ? ['no end node completed; workflow likely took no valid branch'] : []),
        ...(skippedOverrideNodeIds.length > 0 ? [`override nodes were skipped: ${skippedOverrideNodeIds.join(', ')}`] : []),
        ...(overrideNodeIds.length > 0 && !overrideNodeIds.some((nodeId) => executedOrMockedNodeIds.includes(nodeId)) ? ['none of the requested override nodes were exercised'] : []),
      ];
      return {
        success,
        message: timedOut
          ? `Dry run is still running after ${timeoutMs}ms.`
          : success
            ? `Dry run finished with status: ${status}.`
            : `Dry run finished with status: ${status}, but validation failed: ${failureReasons.join('; ')}.`,
        execution_id: result.executionId,
        status,
        timed_out: timedOut,
        failure_reasons: failureReasons,
        missing_start_inputs: missingStartInputs,
        override_node_ids: overrideNodeIds,
        skipped_override_node_ids: skippedOverrideNodeIds,
        end_node_ids: endNodeIds,
        completed_end_node_ids: completedEndNodeIds,
        skipped_step_count: skippedStepCount,
        effective_workflow_input: workflowInput,
        effective_inputs: compactObject(dryRunInputs),
        effective_outputs: compactObject(dryRunOutputs),
        steps,
        context: recovery.execution?.context,
      };
    },
  };
}
