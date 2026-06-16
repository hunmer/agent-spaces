import type { NodeTypeDefinition } from '@agent-spaces/shared';

const KB_PROP = {
  key: 'knowledgeBase',
  label: 'nodes.kb.props.knowledgeBase',
  type: 'knowledge-base' as const,
  required: true,
  tooltip: 'nodes.kb.props.knowledgeBase_tooltip',
};

export const knowledgeBaseNodes: NodeTypeDefinition[] = [
  {
    type: 'kb_add',
    label: 'nodes.kb_add.label',
    category: 'nodes.categories.knowledgeBase',
    icon: 'Library',
    description: 'nodes.kb_add.description',
    properties: [
      KB_PROP,
      { key: 'filePath', label: 'nodes.kb.props.filePath', type: 'text', required: true, tooltip: 'nodes.kb.props.filePath_tooltip' },
      { key: 'fileName', label: 'nodes.kb.props.fileName', type: 'text', tooltip: 'nodes.kb.props.fileName_tooltip' },
    ],
    outputs: [
      { key: 'fileId', type: 'string' },
      { key: 'fileName', type: 'string' },
      { key: 'chunkCount', type: 'number' },
      { key: 'status', type: 'string' },
    ],
  },
  {
    type: 'kb_query',
    label: 'nodes.kb_query.label',
    category: 'nodes.categories.knowledgeBase',
    icon: 'Search',
    description: 'nodes.kb_query.description',
    properties: [
      KB_PROP,
      { key: 'query', label: 'nodes.kb.props.query', type: 'textarea', required: true },
      { key: 'topK', label: 'nodes.kb.props.topK', type: 'number', default: 5 },
    ],
    outputs: [
      { key: 'matches', type: 'any' },
      { key: 'count', type: 'number' },
    ],
  },
  {
    type: 'kb_delete',
    label: 'nodes.kb_delete.label',
    category: 'nodes.categories.knowledgeBase',
    icon: 'Trash2',
    description: 'nodes.kb_delete.description',
    properties: [
      KB_PROP,
      { key: 'fileId', label: 'nodes.kb.props.fileId', type: 'text', required: true, tooltip: 'nodes.kb.props.fileId_tooltip' },
    ],
    outputs: [{ key: 'deletedCount', type: 'number' }],
  },
];
