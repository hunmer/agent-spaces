// Agent 工具元数据（与 src/api.js 一一对应）。
// 运行时启动时读此文件注入到 function tool 的 description/inputSchema；
// Agent 可先调 get_mini_app_tools 看这些描述再决策。
//
// 节点参数的 required/default/options 等元信息**不在本文件维护**，
// 而是定义在各节点组件（src/components/nodes/*.jsx）的 PARAMS_SCHEMA 里，
// agent 调 get_node_params(type) 实时读取（单一数据源：节点即文档）。


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
  'cutout',
  'directorDesk',
  'photopea',
  'workflowRunner',
  'spineEditor',
  'videoDisplay',
  'videoEditor',
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
  'cutout=抠图（白底/色度键/工作流/rembg 四合一）',
  'directorDesk=3D导演台（3D摆位+多视角截图）',
  'photopea=在线PS（Photopea云端，完整图层/蒙版/滤镜编辑）',
  'workflowRunner=执行工作流（选工作流+JSON参数→执行→提取URL展示，通用节点）',
  'spineEditor=骨骼编辑器（Spine骨骼姿势编辑+动画预览，上传.skel/.atlas/.png）',
  'videoDisplay=视频展示（接收上游视频，上传/播放/导出）',
  'videoEditor=视频编辑器（接收/上传多视频，ffmpeg按帧截取，帧拖拽分组循环播放，调整尺寸）',
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
          description: '节点初始 data 字段（可选，合并到默认 data）。生成类节点（textToImage/editImage/textToVoice/videoGenerator）的 params 含枚举字段（如 model/aspect），改前先调 get_node_params(type) 查合法值。note 传 {text:"备注内容"}；图像处理节点（ip*）传 {params:{processorParams:{...}}}。',
        },
        groupName: { type: 'string', description: '可选。把新建的节点归入此名称的分组（画布上的可视化 group）：同名分组不存在则自动创建，已存在则直接加入。用于把同一项目/同一角色的多个节点归类管理。' },
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
        groupName: { type: 'string', description: '可选。把这批节点一起归入此名称的分组（同名分组不存在则自动创建）。用于一次性建一组相关节点并归类。' },
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
    description: '更新节点 data 的部分字段（patch 合并，不会清空其他字段）。用户说「把便签内容改成 xxx」「修改文生图的提示词」「换成即梦模型」时调用。常见 data 字段：note 用 {text}；生成类节点用 {params:{...}}。**改枚举型参数（model/aspect/size 等）先调 get_node_params(type) 查合法值**，不要盲填。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '目标节点 id' },
        data: {
          type: 'object',
          description: '要合并的字段。如 {text:"新内容"} 或 {params:{prompt:"...",model:"jimeng-5.0"}}。生成类节点的 params 合法枚举值由 get_node_params 返回。',
        },
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
  {
    name: 'get_node_params',
    description: '查询某类节点支持的参数清单（含 required/default/options/description 等元信息）。**改枚举型参数前必查**——例如要把 textToImage 的 model 改为「即梦」，先调此工具拿到 model 的合法 value 列表，再 update_node 写入选中的 value。用户说「支持哪些模型」「有哪些比例可选」时调用。',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '节点类型（与 add_node 的 type 同枚举）',
          enum: NODE_TYPE_ENUM,
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'execute_node',
    description: '执行（生成）一个已存在于画布上的节点，等价于用户点节点上的「生成图片/编辑图片/生成配音/生成视频」按钮。用户说「帮我生成」「执行这个节点」「跑一下」时调用。仅支持生成类节点：textToImage（文字生成图片）/ editImage（编辑图片）/ textToVoice（生成配音）/ videoGenerator（生成视频）。其他类型（imageDisplay/note/图像处理/抠图等）调用会返回 ok:false 提示。默认是「触发即返回」（status:running），如需拿到产出结果用于后续操作（如把产出连到展示节点），传 waitForResult=true 阻塞等待完成，返回时带 outputs 产出 URL 列表。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要执行的节点 id（来自 list_nodes / get_canvas / add_node 返回值）' },
        waitForResult: { type: 'boolean', description: '是否等到生成完成再返回。默认 false（触发即返回）。true 时阻塞等待，返回带 outputs 产出 URL 列表与 status(done/error/timeout)。视频生成较慢，建议 timeout 设大些。' },
        waitForResultTimeoutMs: { type: 'number', description: 'waitForResult=true 时的最长等待毫秒数，默认 180000（3 分钟），上限 600000（10 分钟）。图片生成通常 30-60s 够，视频建议 300000+。' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'execute_nodes',
    description: '批量执行多个生成类节点（一次调用触发多个）。用户说「把这些都生成」「一起执行这几个」时调用，避免循环调 execute_node。仅 textToImage/editImage/textToVoice/videoGenerator 可执行。默认触发即返回，传 waitForResult=true 等全部完成并返回每个节点的产出。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: {
          type: 'array',
          description: '要执行的节点 id 数组',
          items: { type: 'string' },
        },
        waitForResult: { type: 'boolean', description: '是否等待全部完成。默认 false（触发即返回）。true 时返回 results 数组，每项含 {nodeId, nodeType, status, outputs, error}。' },
        waitForResultTimeoutMs: { type: 'number', description: 'waitForResult=true 时的最长等待毫秒数（所有节点共享同一时间窗口），默认 180000，上限 600000。' },
      },
      required: ['nodeIds'],
    },
  },

  // —— 素材库：查询 ——
  // 素材库按工作区隔离（configs/workspaces/<id>/asset-library.json），
  // 结构 { categories: [{ id, name, assets: [{ id, url, name, size, uploadedAt }] }] }。
  // 每个分类 = 一个分组；agent 改动后会广播，前端 useAssetLibrary 自动刷新。

  {
    name: 'list_asset_categories',
    description: '查询素材库的所有分组（分类）。用户问「素材库有哪些分组/分类」「素材库分了哪几类」「角色/UI/场景分组都有没有」时调用。仅返回分组摘要（id/name/资产数），要看具体图片用 list_assets。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '工作区 id（可选，不传则用当前激活工作区）' },
      },
    },
  },
  {
    name: 'list_assets',
    description: '查看素材库（可按分组过滤）。用户说「看一下角色分组里有什么」「素材库都有哪些图」「分类 xxx 里的图」时调用。不传过滤条件返回全部分组及其图片；传 categoryId（精确 id）或 categoryName（分组名，模糊匹配）只看该分组。',
    inputSchema: {
      type: 'object',
      properties: {
        categoryId: { type: 'string', description: '按分组 id 精确过滤（可选，来自 list_asset_categories）' },
        categoryName: { type: 'string', description: '按分组名过滤（可选，模糊匹配；与 categoryId 二选一）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
    },
  },
  {
    name: 'find_asset_by_name',
    description: '按文件名查询素材（跨全库搜索）。用户说「找一下 berserker.png」「有没有叫 xxx 的图」「这张图在哪个分组」时调用。默认模糊包含匹配，传 exact=true 走精确匹配。返回的 assetId/categoryId 可用于 update_asset / remove_asset。',
    inputSchema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: '要查的图片文件名（关键字）' },
        exact: { type: 'boolean', description: '是否精确匹配文件名（默认 false 模糊包含）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
      required: ['fileName'],
    },
  },

  // —— 素材库：编辑 ——

  {
    name: 'add_asset',
    description: '往素材库的指定分组插入一张新图片。用户说「把这张图加到角色分组」「往素材库加张图」时调用。url 必填（已上传图片的 http 路径）；目标分组用 categoryId（精确）或 categoryName（分组名，模糊）二选一，找不到分组会提示先建分组。返回新 assetId。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '图片 http 路径（必填，如 http://.../xxx.png；通常来自节点产出或上传）' },
        categoryId: { type: 'string', description: '目标分组 id（来自 list_asset_categories）' },
        categoryName: { type: 'string', description: '目标分组名（categoryId 缺省时模糊匹配此名）' },
        fileName: { type: 'string', description: '图片文件名（可选，默认 untitled）' },
        assetId: { type: 'string', description: '自定义资产 id（可选，默认自动生成）' },
        size: { type: 'number', description: '文件字节数（可选）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
      required: ['url'],
    },
  },
  {
    name: 'update_asset',
    description: '更新素材库里的图片（换 url 换图、改文件名、改 size 等）。用户说「把这张图换掉」「改一下 xxx.png 的名字」时调用。assetId 必填；data 里至少传一个要改的字段。可选 categoryId 限定分组（不传则全库按 assetId 定位）。',
    inputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: '要改的图片 id（来自 find_asset_by_name / list_assets）' },
        data: {
          type: 'object',
          description: '要改的字段，支持 { url }（换图）、{ name }（改文件名）、{ size }。可组合。',
          properties: {
            url: { type: 'string', description: '新的图片 http 路径' },
            name: { type: 'string', description: '新的文件名' },
            size: { type: 'number', description: '新的文件字节数' },
          },
        },
        categoryId: { type: 'string', description: '限定在哪个分组内查找（可选，不传则全库搜）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
      required: ['assetId', 'data'],
    },
  },
  {
    name: 'remove_asset',
    description: '删除素材库里的图片。用户说「删掉这张图」「移除 xxx.png」「这张不要了」时调用。assetId 必填；categoryId 可选（不传则全库按 assetId 删除）。',
    inputSchema: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: '要删除的图片 id（来自 find_asset_by_name / list_assets）' },
        categoryId: { type: 'string', description: '限定在哪个分组内删除（可选）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
      required: ['assetId'],
    },
  },

  // —— 素材库：分组管理 ——
  // 让 agent 能完整管理分组生命周期（建/改名/删），对应前端 useAssetLibrary 的同名能力。

  {
    name: 'create_asset_category',
    description: '在素材库新建一个分组（分类）。用户说「建个 UI 分组」「加一个新分类叫场景」「素材库分组里加一项」时调用。name 可选（不传则自动命名「新建分类 N」）。返回新分组 categoryId。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '新分组名（可选，不传则自动命名「新建分类 N」）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
    },
  },
  {
    name: 'rename_asset_category',
    description: '重命名素材库的分组。用户说「把角色分组改名成主角」「这个分类名不对」时调用。目标分组用 categoryId（精确）或 categoryName（模糊）定位，newName 指定新名字。',
    inputSchema: {
      type: 'object',
      properties: {
        categoryId: { type: 'string', description: '目标分组 id（来自 list_asset_categories）' },
        categoryName: { type: 'string', description: '目标分组名（categoryId 缺省时模糊匹配此名）' },
        newName: { type: 'string', description: '新分组名（必填）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
      required: ['newName'],
    },
  },
  {
    name: 'delete_asset_category',
    description: '删除素材库的分组（连同分组内所有图片）。用户说「删掉这个分组」「不要 UI 分类了」时调用。目标分组用 categoryId（精确）或 categoryName（模糊）定位。',
    inputSchema: {
      type: 'object',
      properties: {
        categoryId: { type: 'string', description: '目标分组 id（来自 list_asset_categories）' },
        categoryName: { type: 'string', description: '目标分组名（categoryId 缺省时模糊匹配此名）' },
        workspaceId: { type: 'string', description: '工作区 id（可选）' },
      },
    },
  },
];
