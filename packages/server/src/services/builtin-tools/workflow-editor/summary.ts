import type { NodeTypeDefinition, Workflow } from '@agent-spaces/shared';
import { summarizeOutputFields } from './output-fields.js';
import { defaultData } from './node-types.js';

export function summarizeWorkflow(workflow: Workflow, summarize: boolean): unknown {
  if (!summarize) return workflow;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    enabledPlugins: workflow.enabledPlugins,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      dataKeys: Object.keys(node.data ?? {}),
      inputFields: summarizeOutputFields(node.data?.inputFields),
      outputs: summarizeOutputFields(node.data?.outputs),
    })),
    edges: workflow.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })),
  };
}

export function summarizeNodeDefinition(definition: NodeTypeDefinition) {
  return {
    type: definition.type,
    label: definition.label,
    category: definition.category,
    description: definition.description,
    pluginId: (definition as { pluginId?: string }).pluginId,
    handles: definition.handles,
  };
}

export function describeNodeUsage(definition: NodeTypeDefinition) {
  const runCodeUsage = definition.type === 'run_code'
    ? {
        runCode: 'run_code 适合数据整形、字段映射或结构转换。支持 data.inputFields 作为代码输入参数：把上游变量引用配置到 inputFields[].value，例如 { key: "agentResult", type: "string", value: "{{ __data__[\\"上游节点ID\\"].result }}" }；JS 代码必须定义 async function main({ params, context })，并通过 params.agentResult 读取。代码签名和代码体里不要使用 __data__，也不要写 {{ }}。main 必须返回 object，禁止直接返回数组、字符串、数字、布尔值或 null。返回结构变化后，必须同步设置 data.outputs；建议设置一个 type 为 "object" 的输出项，并按返回对象字段展开 children，例如返回 { a, count, items } 时输出 children 包含 a:string、count:number、items:array。',
      }
    : {};
  const runPythonUsage = definition.type === 'run_python'
    ? {
        runPython: 'run_python 支持 data.inputFields 作为 Python 输入参数，规则与 run_code 一致：把上游变量引用配置到 inputFields[].value，代码从 params 读取输入。Python 代码必须返回 object/dict，禁止直接返回数组、字符串、数字、布尔值或 null。返回结构变化后，必须同步设置 data.outputs；建议设置一个 type 为 "object" 的输出项，并按返回 dict 的键展开 children。',
      }
    : {};
  const loopUsage = definition.type === 'loop'
    ? {
        loop: 'loop 节点通过 data.loopType 控制循环方式：array 使用 data.arrayPath 指向数组变量，count 使用 data.count，infinite 表示无限循环。如果数组来自 run_code/run_python 返回对象中的字段，arrayPath 使用 {{ __data__[\\"代码节点ID\\"].字段名 }}。loop 有两个出口：sourceHandle="loop-body" 进入循环体，sourceHandle="loop-next" 连接循环结束后的后续节点。在 loop 内创建节点时，必须把节点放进 loop_body：create_node 传 scopeNodeId/scope_node_id 为 loop_body 节点 ID；如果从 loop 的 loop-body 句柄继续创建，也可以传 source 和 sourceHandle=loop-body 让工具自动推断。loop_body 内节点引用当前循环项时使用 {{ loop.item }} 或 {{ loop.item.xxx }}，例如 {{ loop.item.prompt }}、{{ loop.item.copy }}；不要使用 {{ context.item }}。data.sharedVariables 用于声明循环内需要读写的额外中间变量，不用于获取当前循环项；如果 loop_body 要引用某个中间变量，必须先在父 loop.data.sharedVariables 中声明该字段。',
      }
    : {};
  return {
    ...definition,
    exampleData: defaultData(definition),
    usage: {
      variables: '字符串字段支持 {{ __data__["节点ID"].字段路径 }} 和 {{ context.some.path }}。开始节点的工作流输入也通过 {{ __data__["开始节点ID"].字段 }} 引用；{{ __inputs__["节点ID"].字段路径 }} 仅作为普通节点输入字段的兼容语法。',
      handles: definition.handles ?? {},
      ...runCodeUsage,
      ...runPythonUsage,
      ...loopUsage,
    },
  };
}
