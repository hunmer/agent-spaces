import type { NodeTypeDefinition, Workflow } from '@agent-spaces/shared';
import { summarizeOutputFields } from './output-fields.js';
import { defaultData } from './node-types.js';

export function summarizeWorkflow(workflow: Workflow, summarize: boolean): unknown {
  if (!summarize) return workflow;
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
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
    handles: definition.handles,
  };
}

export function describeNodeUsage(definition: NodeTypeDefinition) {
  const runCodeUsage = definition.type === 'run_code'
    ? {
        runCode: 'run_code 支持 data.inputFields 作为代码输入参数。把上游变量引用配置到 inputFields[].value，例如 { key: "agentResult", type: "string", value: "{{ __data__[\\"上游节点ID\\"].result }}" }；JS 代码必须使用 async function main({ params, context })，并通过 params.agentResult 读取。不要在代码签名或代码体里使用 __data__，代码里也不要写 {{ }}。如果代码直接返回数组，data.outputs 设置为 { key: "result", type: "array", children: [...] }，下游 loop.arrayPath 使用 {{ __data__[\\"run_code节点ID\\"].result }}；不要为了适配 loop 把数组强行包成对象。',
      }
    : {};
  const loopUsage = definition.type === 'loop'
    ? {
        loop: 'loop 节点通过 data.loopType 控制循环方式：array 使用 data.arrayPath 指向数组变量，count 使用 data.count，infinite 表示无限循环。如果数组来自直接返回数组的 run_code，arrayPath 使用 {{ __data__[\\"run_code节点ID\\"].result }}。loop 有两个出口：sourceHandle="loop-body" 进入循环体，sourceHandle="loop-next" 连接循环结束后的后续节点。loop_body 内节点引用当前循环项时使用 {{ loop.item }} 或 {{ loop.item.xxx }}，例如 {{ loop.item.prompt }}、{{ loop.item.copy }}；不要使用 {{ context.item }}。data.sharedVariables 用于声明循环内需要读写的额外中间变量，不用于获取当前循环项；如果 loop_body 要引用某个中间变量，必须先在父 loop.data.sharedVariables 中声明该字段。',
      }
    : {};
  return {
    ...definition,
    exampleData: defaultData(definition),
    usage: {
      variables: '字符串字段支持 {{ __data__["节点ID"].字段路径 }} 和 {{ context.some.path }}。开始节点的工作流输入也通过 {{ __data__["开始节点ID"].字段 }} 引用；{{ __inputs__["节点ID"].字段路径 }} 仅作为普通节点输入字段的兼容语法。',
      handles: definition.handles ?? {},
      ...runCodeUsage,
      ...loopUsage,
    },
  };
}
