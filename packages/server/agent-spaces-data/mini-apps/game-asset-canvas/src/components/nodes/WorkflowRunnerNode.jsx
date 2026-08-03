import { useCallback, useState } from 'react';
import { Workflow } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import CountAndConcurrency from './CountAndConcurrency';
import { NODE_TYPES } from '../../utils/constants';
import { runWorkflow, normalizeImageUrls } from '../../utils/workflow';
import AutoResizeTextarea from '../AutoResizeTextarea';

// 宿主侧组件（已通过 ui-exports 暴露）
const { MonacoCodeEditor } = window.AgentSpacesUI || {};

/**
 * 执行工作流节点（通用）。
 *
 * 用户在节点上选一个已保存的工作流，填自定义 JSON 参数（start 节点 inputFields 的值），
 * 点击执行 → 调 execute_workflow_sync → 从返回值提取 URL 字段 → 展示到 gallery。
 *
 * data.params: { workflowId, workflowName, inputText(JSON 字符串), urlFieldPath, count, concurrency }
 * data.output: { images: string[] }  提取出的 URL 列表
 *
 * 不接收上游图（输入是纯 JSON）；不参与 settings 工作流槽位（通用节点）。
 * agent 暂不支持自动执行（input 由用户交互组装），仅支持 add/update/get。
 */

// agent 通过 get_node_params 读取的参数 schema
export const PARAMS_SCHEMA = [
  {
    key: 'workflowId',
    label: '工作流 ID',
    type: 'text',
    required: true,
    description: '目标工作流 id（UUID）。用户需先在节点上点「选择工作流」挑选，agent 不要盲填。',
  },
  {
    key: 'inputText',
    label: '输入参数(JSON)',
    type: 'text',
    required: true,
    description: '提交给工作流 start 节点的 JSON 字符串。选中工作流后会按其 inputFields 自动生成模板预填，用户在此基础上修改即可。',
  },
  {
    key: 'urlFieldPath',
    label: 'URL 字段路径',
    type: 'text',
    required: false,
    description: '可选。从执行结果里提取 URL 的字段路径（点分），如 result / data.images / output.url。留空走智能提取。',
  },
  {
    key: 'count',
    label: '执行次数',
    type: 'number',
    default: 1,
    description: '重复执行次数（每次独立提交），结果合并展示。',
  },
];

export default function WorkflowRunnerNode({ id, data, selected }) {
  const storedParams = data?.params || {};
  const params = { ...storedParams, ...(data?.textInputValues || {}) };
  const status = data?.status || 'idle';
  const error = data?.error;
  const running = status === 'running';
  const onUpdate = data?.onUpdate;
  const outputImages = Array.isArray(data?.output?.images) ? data.output.images : [];

  const [pickerError, setPickerError] = useState('');

  const set = useCallback((patch) => {
    onUpdate?.({ params: { ...storedParams, ...patch } });
  }, [onUpdate, storedParams]);

  const onPickWorkflow = useCallback((workflow) => {
    const wfId = workflow.workflow_id || workflow.id;
    const wfName = workflow.title || workflow.name || '未命名工作流';
    // start 节点 inputFields：listWorkflowsForMiniApp 不直接返回 inputFields，
    // 但返回完整 nodes，从 type==='start' 的节点 data.inputFields 提取。
    // 兼容兜底：顶层 inputFields / startNodes[].inputFields（其他数据源可能带）。
    let inputFields = Array.isArray(workflow.inputFields) ? workflow.inputFields : [];
    if (!inputFields.length && Array.isArray(workflow.startNodes)) {
      const s = workflow.startNodes.find((n) => Array.isArray(n?.inputFields) && n.inputFields.length);
      if (s) inputFields = s.inputFields;
    }
    if (!inputFields.length && Array.isArray(workflow.nodes)) {
      const startNode = workflow.nodes.find((n) => n?.type === 'start');
      if (startNode && Array.isArray(startNode.data?.inputFields)) {
        inputFields = startNode.data.inputFields;
      }
    }
    // 是否预填模板：inputText 为空 / 仅 {}（初始态）/ 等于上次自动生成的模板（未手改）时覆盖，
    // 避免冲掉用户已手动修改的内容。
    const currentText = (params.inputText || '').trim();
    const prevTemplate = (params.lastTemplate || '').trim();
    const isPristine = !currentText || currentText === '{}';
    const shouldPrefill = isPristine || currentText === prevTemplate;
    let nextPatch = { workflowId: wfId, workflowName: wfName, inputFields };
    if (shouldPrefill) {
      const template = buildTemplateFromFields(inputFields);
      const templateText = JSON.stringify(template, null, 2);
      nextPatch.inputText = templateText;
      nextPatch.lastTemplate = templateText;
    }
    set(nextPatch);
  }, [set, params.inputText, params.lastTemplate]);

  const openPicker = useCallback(async () => {
    setPickerError('');
    try {
      const workflow = await window.AgentSpaces.openWorkflowListDialog();
      if (workflow) onPickWorkflow(workflow);
    } catch (err) {
      setPickerError(err?.message || String(err));
    }
  }, [onPickWorkflow]);

  // 解析 JSON 输入：非法时返回 null + 通过节点 error 提示
  const parseInput = useCallback(() => {
    const raw = (params.inputText || '').trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return null; // 调用方据 e 提示
    }
  }, [params.inputText]);

  const handleRun = useCallback(async () => {
    const workflowId = (params.workflowId || '').trim();
    if (!workflowId) {
      onUpdate?.({ error: '请先选择工作流' });
      return;
    }
    const parsed = parseInput();
    if (parsed === null) {
      onUpdate?.({ error: '输入参数不是合法 JSON' });
      return;
    }

    const count = Math.max(1, Math.min(20, Number(params.count) || 1));
    const concurrency = Math.max(1, Math.min(count, Number(params.concurrency) || 1));
    const urlFieldPath = (params.urlFieldPath || '').trim();
    const AS = window.AgentSpaces;

    // 注册中断句柄：subscribeWorkflowEvents 订阅 workflow:started 回填 executionId
    let unsubStarted = null;
    let executionId = '';
    if (AS?.subscribeWorkflowEvents) {
      unsubStarted = AS.subscribeWorkflowEvents((event, payload) => {
        if (event === 'workflow:started' && payload?.executionId) {
          executionId = payload.executionId;
          onUpdate?.({ executionId: payload.executionId });
        }
      });
    }

    onUpdate?.({ status: 'running', error: undefined, output: { images: [] } });

    try {
      // 串行/并发执行 count 次，每次独立提取 URL 后合并
      const queue = Array.from({ length: count }, (_, i) => i);
      const concurrencyRun = async (taskIdx) => {
        // returnRawEndOutput:true 拿 end 节点完整 output（非图片专用提取）
        const output = await runWorkflow(workflowId, parsed, {
          returnRawEndOutput: true,
          meta: { mode: 'workflowRunner', batchIndex: taskIdx },
        });
        return extractUrls(output, urlFieldPath);
      };

      // 简易并发池
      const results = [];
      let cursor = 0;
      async function worker() {
        while (cursor < queue.length) {
          const idx = queue[cursor++];
          try {
            const urls = await concurrencyRun(idx);
            results.push(...urls);
          } catch (e) {
            // 单次失败不阻塞，记录到 console；全部失败由最终 length 判断
            console.warn('workflowRunner batch failed:', e);
          }
        }
      }
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      const urls = normalizeImageUrls(results.filter(Boolean));
      if (!urls.length) throw new Error('未提取到 URL（检查 URL 字段路径或工作流返回值）');

      onUpdate?.({ status: 'done', error: undefined, output: { images: urls }, executionId: undefined });
    } catch (err) {
      console.error('workflowRunner failed:', err);
      onUpdate?.({ status: 'error', error: err?.message || String(err), executionId: undefined });
    } finally {
      try { unsubStarted?.(); } catch { /* noop */ }
    }
  }, [params, onUpdate, parseInput]);

  // 取消执行：优先用 stopWorkflow(executionId) 中断服务端；fetch 已发出则等其自然结束
  const handleCancel = useCallback(() => {
    const AS = window.AgentSpaces;
    const execId = data?.executionId;
    if (execId && AS?.stopWorkflow) {
      try { AS.stopWorkflow(execId); } catch { /* noop */ }
    }
    onUpdate?.({ status: 'cancelled', error: undefined });
  }, [data?.executionId, onUpdate]);

  const canRun = !running && !!(params.workflowId || '').trim();

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.workflowRunner} data={data} selected={selected} sourceHandle>
      {/* 选择工作流 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">目标工作流</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openPicker(); }}
          title={params.workflowId || '未设置'}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-sm transition hover:border-primary"
        >
          <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {params.workflowName || params.workflowId || '点击选择工作流'}
          </span>
        </button>
      </div>
      {pickerError && (
        <p className="text-xs text-red-500">加载失败：{pickerError}</p>
      )}

      {/* JSON 参数编辑器 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            输入参数 (JSON)
            {params.inputFields?.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                · {params.inputFields.length} 个字段
              </span>
            )}
          </span>
          {params.inputFields?.length > 0 && (
            <button
              type="button"
              title="按 start 节点 inputFields 重置为模板"
              onClick={(e) => {
                e.stopPropagation();
                const templateText = JSON.stringify(buildTemplateFromFields(params.inputFields), null, 2);
                set({ inputText: templateText, lastTemplate: templateText });
              }}
              className="text-[10px] text-muted-foreground transition hover:text-primary"
            >
              ↺ 重置为模板
            </button>
          )}
        </div>
        <div
          className="nodrag nopan nowheel overflow-hidden rounded-md border border-border"
          onClick={(e) => e.stopPropagation()}
        >
          {MonacoCodeEditor ? (
            <MonacoCodeEditor
              height={160}
              language="json"
              theme="vs"
              value={params.inputText || '{}'}
              onChange={(val) => set({ inputText: val ?? '' })}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                automaticLayout: true,
              }}
            />
          ) : (
            <AutoResizeTextarea
              minHeight={120}
              className="w-full bg-background p-2 font-mono text-xs outline-none"
              placeholder='{"prompt":"..."}'
              value={params.inputText || ''}
              onChange={(e) => set({ inputText: e.target.value })}
            />
          )}
        </div>
      </div>

      {/* URL 字段路径 */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          URL 字段路径 <span className="text-muted-foreground/70">（可选）</span>
        </span>
        <input
          type="text"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="留空=智能提取，或填 result / data.images"
          value={params.urlFieldPath || ''}
          onChange={(e) => set({ urlFieldPath: e.target.value })}
        />
      </label>

      <CountAndConcurrency
        count={params.count ?? 1}
        concurrency={params.concurrency ?? 1}
        onChange={(patch) => set(patch)}
      />

      {running ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleCancel(); }}
          className="w-full rounded-md border border-destructive bg-background px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
        >
          取消执行
        </button>
      ) : (
        <button
          type="button"
          disabled={!canRun}
          onClick={(e) => { e.stopPropagation(); handleRun(); }}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⚙️ 执行工作流
        </button>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}

    </NodeShell>
  );
}

/**
 * 根据 start 节点 inputFields 生成 JSON 模板（用于选中工作流后预填）。
 * 每个字段取其 value 作为默认值；无 value 时按 type 给占位空值。
 * 递归处理 object 类型的 children（展平为嵌套对象）。
 * @param {Array} fields start 节点 data.inputFields（OutputField[]）
 * @returns {object} 可直接 JSON.stringify 的模板对象
 */
function buildTemplateFromFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return {};
  const out = {};
  for (const f of fields) {
    if (!f || typeof f.key !== 'string' || !f.key) continue;
    out[f.key] = defaultFieldValue(f);
  }
  return out;
}

/** 单个 OutputField 的默认值：有 value 用 value；否则按 type 给空占位 */
function defaultFieldValue(field) {
  if (field && Object.prototype.hasOwnProperty.call(field, 'value') && field.value !== undefined) {
    return field.value;
  }
  switch (field?.type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'object': {
      const childObj = {};
      for (const c of field.children || []) {
        if (c && typeof c.key === 'string' && c.key) childObj[c.key] = defaultFieldValue(c);
      }
      return childObj;
    }
    case 'select': return Array.isArray(field.options) && field.options.length ? field.options[0] : '';
    case 'array':
    case 'string[]':
    case 'number[]':
    case 'file[]':
    case 'image[]':
    case 'audio[]':
    case 'video[]':
    case 'any[]':
      return [];
    default: return '';
  }
}

/**
 * 从执行结果提取 URL 列表。
 * @param {Record<string, unknown>} output runWorkflow returnRawEndOutput 返回的 end 节点完整 output
 * @param {string} fieldPath 用户配置的点分路径（如 result / data.images）；空则走智能提取
 * @returns {string[]}
 */
function extractUrls(output, fieldPath) {
  if (!output || typeof output !== 'object') return [];

  // 1. 配置了字段路径：按点分取值，数组展开
  if (fieldPath) {
    const vals = getByPath(output, fieldPath);
    const urls = collectUrls(vals);
    if (urls.length) return urls;
    // 路径未命中，继续走智能兜底
  }

  // 2. 智能提取：output 上的常见字段
  const direct = collectUrls(output.result) || collectUrls(output.images) || collectUrls(output.image_urls);
  if (direct.length) return direct;

  // 3. 兜底：递归扫描整个 output，收集所有 URL 字符串
  const scanned = [];
  walkForUrls(output, scanned);
  return scanned;
}

/** 按点分路径取值（支持数组下标 result[0].url，也支持数组整体 result.images） */
function getByPath(obj, path) {
  if (!path) return undefined;
  // 支持 a.b[0].c 写法
  const parts = path.split('.').flatMap((seg) => {
    const m = seg.match(/^([^\[\]]*)((?:\[\d+\])*)$/);
    if (!m) return [seg];
    const name = m[1];
    const idxs = (m[2].match(/\[(\d+)\]/g) || []).map((s) => Number(s.slice(1, -1)));
    return name ? [name, ...idxs] : idxs;
  });
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** 从任意值收集 URL 字符串（递归数组/对象，过滤非 URL 字符串） */
function collectUrls(val) {
  const out = [];
  walkForUrls(val, out);
  return out;
}

/** 递归遍历，把所有 http(s)/data:/blob: URL 字符串压入 out */
function walkForUrls(val, out) {
  if (val == null) return;
  if (typeof val === 'string') {
    if (/^(https?:\/\/|data:|blob:)/i.test(val)) out.push(val);
    return;
  }
  if (Array.isArray(val)) {
    for (const v of val) walkForUrls(v, out);
    return;
  }
  if (typeof val === 'object') {
    for (const v of Object.values(val)) walkForUrls(v, out);
  }
}
