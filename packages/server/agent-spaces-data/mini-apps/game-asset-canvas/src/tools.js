// Agent 工具元数据（与 src/api.js 一一对应）。
// 运行时启动时读此文件注入到 function tool 的 description/inputSchema；
// Agent 可先调 get_mini_app_tools 看这些描述再决策。

const NODE_TYPE_ENUM = [
  'textToImage',
  'editImage',
  'imageDisplay',
  'imageProcess',
  // 图像处理拆分节点（一个处理器 = 一个节点类型）
  'ipGifSplit',
  'ipGifMerge',
  'ipSpriteSplit',
  'ipSpriteMerge',
  'ipPixelate',
  'ipResizeNearest',
  'ipInnerStroke',
  'ipChromaKey',
  'ipWhiteKey',
  'ipComposeOverlay',
  'ipEnhance',
  'ipCompress',
  'imageEditor',
  'pixelEditor',
  'uiSplitter',
  'bboxViewer',
  'promptReverse',
  'textToVoice',
  'videoGenerator',
  'imageCompare',
  'note',
];

const NODE_TYPE_DESC = [
  'textToImage=文字生成图片',
  'editImage=编辑图片',
  'imageDisplay=图片展示（接收上游图片）',
  'imageProcess=图像处理（旧单节点，兼容；新画布用下方拆分节点）',
  'ipGifSplit=GIF 拆帧（GIF→多帧 PNG）',
  'ipGifMerge=GIF 合成（多帧→GIF，需≥2帧）',
  'ipSpriteSplit=Sheet 拆分（按行列/透明切分）',
  'ipSpriteMerge=Sheet 合成（多帧→网格图）',
  'ipPixelate=像素化（降采样+Wu量化）',
  'ipResizeNearest=最近邻缩放（硬缩放保锐利）',
  'ipInnerStroke=内描边（边缘内N像素描边）',
  'ipChromaKey=色度键抠图（绿幕/蓝幕）',
  'ipWhiteKey=白底抠图（去白底）',
  'ipComposeOverlay=图层叠加（多图alpha-over，需≥2图）',
  'ipEnhance=图片放大（云端AI高清化，支持批量）',
  'ipCompress=图片压缩（按体积/尺寸，jpeg/webp/png）',
  'imageEditor=图片编辑（浏览器端画笔）',
  'pixelEditor=像素编辑器',
  'uiSplitter=雪碧图拆分（画布框选+自动检测切片）',
  'bboxViewer=UI 拆分（JSON bbox 可视化+批量导出）',
  'promptReverse=反推提示词（多图→AI生成文生图提示词）',
  'textToVoice=生成配音（文字→语音）',
  'videoGenerator=生成视频（图/文→视频）',
  'imageCompare=图片对比（双图滑块对比）',
  'note=便签（纯文本备注）',
].join(' / ');

export default [
  {
    name: 'add_node',
    description: '在画布上新增一个节点。用户说「加一个文生图节点」「建个便签」「加图片展示节点」时调用。新增后返回节点 id，可用于后续 connect_nodes / update_node。',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: NODE_TYPE_DESC,
          enum: NODE_TYPE_ENUM,
        },
        label: { type: 'string', description: '节点显示标题（可选，不传用类型默认名）' },
        position: {
          type: 'object',
          description: '画布坐标（可选，不传则自动错落排布）',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
        data: {
          type: 'object',
          description: '节点初始 data 字段（可选，合并到默认 data）。如 note 传 {text:"备注内容"}；textToImage 传 {params:{prompt:"...",model:"gpt-image-1",aspect:"1:1",size:"1k"}}；图像处理节点（ip*）可传 {params:{processorParams:{...}}} 覆盖处理器参数（processor 由节点类型固定，无需传）。',
        },
        focus: { type: 'boolean', description: '创建后是否聚焦/居中到该节点（默认 true）' },
      },
      required: ['type'],
    },
  },
  {
    name: 'add_nodes',
    description: '批量新增多个节点（一次调用建多个，比循环调 add_node 快）。用户说「加两个便签」「建一组：文生图、编辑图片、图片展示」时调用。返回所有新节点 id。',
    inputSchema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          description: '节点规格数组，每项与 add_node 同结构：{type, label?, position?, data?}',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: NODE_TYPE_ENUM },
              label: { type: 'string' },
              position: {
                type: 'object',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
              },
              data: { type: 'object' },
            },
            required: ['type'],
          },
        },
        focusFirst: { type: 'boolean', description: '是否聚焦到首个新增节点（默认 true）' },
      },
      required: ['nodes'],
    },
  },
  {
    name: 'list_nodes',
    description: '查询画布上的节点列表。用户问「有哪些节点」「找一下文生图节点」时调用；返回的 items[].id 可作为 connect_nodes / update_node / delete_node 的参数。',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '按节点类型过滤（可选，不传则返回全部）',
          enum: NODE_TYPE_ENUM,
        },
      },
    },
  },
  {
    name: 'get_canvas',
    description: '查询画布全貌（节点 + 边 + 计数）。用户问「画布上现在有什么」「有几个节点」「节点之间怎么连的」时调用。返回节点 id/type/position 和边 source/target。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'connect_nodes',
    description: '把两个节点连起来（source 的产出图作为 target 的输入）。用户说「把 A 连到 B」「文生图的结果接到图片展示」时调用。注意：source 通常是产出节点（textToImage/editImage/imageProcess 等），target 通常是接收节点（imageDisplay/editImage/imageProcess/imageEditor/pixelEditor）。',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: '源节点 id（来自 list_nodes / get_canvas）' },
        targetId: { type: 'string', description: '目标节点 id（来自 list_nodes / get_canvas）' },
      },
      required: ['sourceId', 'targetId'],
    },
  },
  {
    name: 'connect_batch',
    description: '批量建多条连线（一次调用，比循环调 connect_nodes 快）。用户说「把这几个文生图都连到这个图片展示」「把这组源节点都连到目标」时调用。所有连线一起校验 + 一起创建，返回新增/已存在/无效计数。',
    inputSchema: {
      type: 'object',
      properties: {
        edges: {
          type: 'array',
          description: '连线规格数组，每项 {sourceId, targetId}',
          items: {
            type: 'object',
            properties: {
              sourceId: { type: 'string' },
              targetId: { type: 'string' },
            },
            required: ['sourceId', 'targetId'],
          },
        },
      },
      required: ['edges'],
    },
  },
  {
    name: 'delete_node',
    description: '删除一个节点（同时自动清理连到它的所有连线）。用户说「删掉这个节点」「去掉那个便签」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要删除的节点 id' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'delete_edge',
    description: '删除两个节点之间的连线。用户说「断开 A 和 B」「取消这条连线」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
      },
      required: ['sourceId', 'targetId'],
    },
  },
  {
    name: 'update_node',
    description: '更新节点 data 的部分字段（patch 合并，不会清空其他字段）。用户说「把便签内容改成 xxx」「修改文生图的提示词」时调用。常见 data 字段：note 用 {text}；textToImage/editImage 用 {params:{prompt,model,aspect,size}}。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '目标节点 id' },
        data: { type: 'object', description: '要合并的字段（如 {text:"新内容"} 或 {params:{prompt:"..."}}）' },
      },
      required: ['nodeId', 'data'],
    },
  },
  {
    name: 'get_selection',
    description: '查询当前画布上用户选中的节点（支持单选/多选）。用户说「这个」「它」「选中的节点」「刚才那个」等指代词时调用，拿到 id 后再 delete_node / connect_nodes / update_node。未选中时返回 count=0。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
