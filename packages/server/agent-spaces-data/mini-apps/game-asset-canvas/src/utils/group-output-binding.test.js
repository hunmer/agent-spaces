import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROUP_OUTPUT_FILTER_MODES,
  applyAssetToNodeStates,
  applyExecutionNodePatch,
  applyNodePropertiesToAssetRuns,
  collectGroupOutputAssets,
  createExecutionNodeId,
  ensureGroupExecution,
  getRunExecutionTarget,
  normalizeGroupOutputBinding,
  resolveGroupOutputFilter,
  updateRunNodeState,
  wouldCreateGroupOutputBindingCycle,
} from './group-execution.js';

const canvasFixture = JSON.parse(readFileSync(new URL(
  '../../configs/workspaces/ws-ms2k5lgk-fy8e/canvas.json',
  import.meta.url,
), 'utf8'));

const nodes = [
  { id: 'a', type: 'textToImage', data: { label: 'A', output: { images: ['a1', 'a2'] } } },
  { id: 'b', type: 'editImage', data: { label: 'B', output: { images: ['b1'] } } },
  { id: 'c', type: 'textToImage', data: { label: 'C', output: { images: ['c1'] } } },
  { id: 'd', type: 'imageDisplay', data: { images: ['upload-only'] } },
];

test('真实三分组快照：输出过滤只产生派生结果，不覆盖来源分组实例', () => {
  const sourceGroup = canvasFixture.groups.find((group) => group.id === 'group-mtbadts3-4');
  const targetGroup = canvasFixture.groups.find((group) => group.id === 'group-mt9vl4s7-22');
  assert.ok(sourceGroup);
  assert.ok(targetGroup);
  assert.equal(sourceGroup.batchExecution.assets.runs.length, 8);
  const targetRunCount = targetGroup.batchExecution.assets.runs.length;
  assert.ok(targetRunCount > 0);

  const sourceNodeIds = sourceGroup.childNodeIds;
  const sourceNodes = canvasFixture.nodes.filter((node) => sourceNodeIds.includes(node.id));
  const beforeSource = JSON.stringify(sourceNodes);
  const filtered = collectGroupOutputAssets(sourceNodes, sourceNodeIds, {
    sourceGroupId: sourceGroup.id,
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.types, nodeTypes: ['imageDisplay'] },
  }, canvasFixture.edges);

  // 当前画布输出应少于来源执行历史，过滤只是派生读取。
  assert.equal(filtered.length, targetRunCount);
  assert.ok(filtered.length < sourceGroup.batchExecution.assets.runs.length);
  assert.equal(JSON.stringify(sourceNodes), beforeSource);
  assert.equal(sourceGroup.batchExecution.assets.runs.length, 8);
  assert.equal(targetGroup.batchExecution.assets.runs.length, targetRunCount);
});


test('不同实例的同一模板节点拥有稳定且不重复的执行节点 ID', () => {
  const first = createExecutionNodeId('group-1', 'asset-1', 'node-1');
  const second = createExecutionNodeId('group-1', 'asset-2', 'node-1');
  assert.equal(first, createExecutionNodeId('group-1', 'asset-1', 'node-1'));
  assert.notEqual(first, second);
});

test('固定执行身份只更新请求所属实例，不受当前激活实例影响', () => {
  const execution = ensureGroupExecution({
    mode: 'assets',
    count: { target: 1, activeId: 'count-1', runs: [] },
    assets: {
      activeId: 'asset-2',
      runs: [
        { id: 'asset-1', nodeStates: { 'node-1': { output: { images: [] } } } },
        { id: 'asset-2', nodeStates: { 'node-1': { output: { images: ['b.png'] } } } },
      ],
    },
  }, [{ id: 'node-1', data: {} }], ['node-1'], 'group-1');
  const target = getRunExecutionTarget(execution, 'group-1', 'node-1', 'assets', 'asset-1');
  const next = updateRunNodeState(execution, target, {
    status: 'done', output: { images: ['a.png'] },
  });
  assert.deepEqual(next.assets.runs[0].nodeStates['node-1'].output.images, ['a.png']);
  assert.deepEqual(next.assets.runs[1].nodeStates['node-1'].output.images, ['b.png']);
  assert.equal(next.assets.activeId, 'asset-2');
});

test('执行实例函数 patch 只更新指定字段并保留其他数据', () => {
  const previous = {
    params: { prompt: '保留' },
    status: 'done',
    output: { images: ['a.png', 'b.png'], resources: [{ id: 'a' }, { id: 'b' }] },
    versions: [{ output: { images: ['a.png', 'b.png'] } }],
    unrelated: 'keep',
  };
  const next = applyExecutionNodePatch(previous, (data) => ({
    __versionSkip: true,
    output: {
      ...data.output,
      images: ['b.png'],
      resources: [{ id: 'b' }],
    },
  }));

  assert.deepEqual(next.output.images, ['b.png']);
  assert.deepEqual(next.output.resources, [{ id: 'b' }]);
  assert.deepEqual(next.params, previous.params);
  assert.deepEqual(next.versions, previous.versions);
  assert.equal(next.unrelated, 'keep');
  assert.equal(next.__versionSkip, undefined);
});

test('删除执行实例中的一张图片不会清空其他实例产出', () => {
  const execution = ensureGroupExecution({
    mode: 'assets',
    assets: {
      activeId: 'run-a',
      runs: [
        {
          id: 'run-a',
          nodeStates: {
            output: {
              status: 'done',
              output: { images: ['a-1', 'a-2'] },
              versions: [{ output: { images: ['a-1', 'a-2'] } }],
            },
          },
        },
        {
          id: 'run-b',
          nodeStates: {
            output: { status: 'done', output: { images: ['b-1', 'b-2'] } },
          },
        },
      ],
    },
  }, [{ id: 'output', data: {} }], ['output'], 'group-1');
  const target = getRunExecutionTarget(execution, 'group-1', 'output', 'assets', 'run-a');
  const nextData = applyExecutionNodePatch(
    execution.assets.runs[0].nodeStates.output,
    (data) => ({
      __versionSkip: true,
      output: { ...data.output, images: ['a-2'] },
    }),
  );
  const next = updateRunNodeState(execution, target, nextData);

  assert.deepEqual(next.assets.runs[0].nodeStates.output.output.images, ['a-2']);
  assert.deepEqual(next.assets.runs[1].nodeStates.output.output.images, ['b-1', 'b-2']);
});

test('全部模式收集来源组节点的输出图片和图片展示内容', () => {
  const result = collectGroupOutputAssets(nodes, ['a', 'b', 'd'], {
    sourceGroupId: 'source',
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.all },
  });
  assert.deepEqual(result.map((item) => item.url), ['a1', 'a2', 'b1', 'upload-only']);
});

test('图片展示节点的 data.images 可作为组输出传递', () => {
  const result = collectGroupOutputAssets(
    [{ id: 'display', type: 'imageDisplay', data: { images: ['display-image'] } }],
    ['display'],
    { sourceGroupId: 'source', filter: { mode: GROUP_OUTPUT_FILTER_MODES.nodes, nodeIds: ['display'] } },
  );
  assert.deepEqual(result.map((item) => item.url), ['display-image']);
});

test('图片展示节点可把入边派生图片作为组输出传递', () => {
  const topologyNodes = [
    { id: 'generator', type: 'textToImage', data: { output: { images: ['generated-image'] } } },
    { id: 'display', type: 'imageDisplay', data: { images: [] } },
  ];
  const result = collectGroupOutputAssets(
    topologyNodes,
    ['generator', 'display'],
    { sourceGroupId: 'source', filter: { mode: GROUP_OUTPUT_FILTER_MODES.nodes, nodeIds: ['display'] } },
    [{ source: 'generator', target: 'display', data: { inputType: 'image', inputTarget: 'images' } }],
  );
  assert.deepEqual(result.map((item) => item.url), ['generated-image']);
  assert.deepEqual(result.map((item) => item.sourceNodeId), ['display']);
});

test('指定节点模式支持多选', () => {
  const result = collectGroupOutputAssets(nodes, ['a', 'b', 'c'], {
    sourceGroupId: 'source',
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.nodes, nodeIds: ['b', 'c'] },
  });
  assert.deepEqual(result.map((item) => item.url), ['b1', 'c1']);
});

test('节点类型模式支持多选并限制在来源组内', () => {
  const result = collectGroupOutputAssets(nodes, ['a', 'b'], {
    sourceGroupId: 'source',
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.types, nodeTypes: ['textToImage', 'editImage'] },
  });
  assert.deepEqual(result.map((item) => item.url), ['a1', 'a2', 'b1']);
});

test('绑定配置会去重并补齐默认过滤字段', () => {
  assert.deepEqual(normalizeGroupOutputBinding({
    sourceGroupId: 'source',
    filter: { mode: 'nodes', nodeIds: ['a', 'a'] },
  }), {
    sourceGroupId: 'source',
    filter: { mode: 'nodes', nodeIds: ['a'], nodeTypes: [] },
  });
});

test('组输出绑定不能形成循环', () => {
  const groups = [
    { id: 'a' },
    { id: 'b', batchExecution: { assets: { binding: { sourceGroupId: 'a' } } } },
    { id: 'c', batchExecution: { assets: { binding: { sourceGroupId: 'b' } } } },
  ];
  assert.equal(wouldCreateGroupOutputBindingCycle(groups, 'c', 'a'), true);
  assert.equal(wouldCreateGroupOutputBindingCycle(groups, 'a', 'c'), false);
  assert.equal(wouldCreateGroupOutputBindingCycle(groups, 'a', 'a'), true);
});

test('执行模型归一化会保留持久化的绑定配置', () => {
  const execution = ensureGroupExecution({
    assets: {
      binding: { sourceGroupId: 'source', filter: { mode: 'types', nodeTypes: ['textToImage'] } },
      sourceSignature: 'signature',
      runs: [],
    },
  }, [], []);
  assert.deepEqual(execution.assets.binding, {
    sourceGroupId: 'source',
    filter: { mode: 'types', nodeIds: [], nodeTypes: ['textToImage'] },
  });
  assert.equal(execution.assets.sourceSignature, 'signature');
});

test('绑定图片会应用到目标组的上传素材槽位', () => {
  const targetNodes = [{ id: 'target', type: 'editImage', data: {} }];
  const result = applyAssetToNodeStates(
    { target: {} },
    targetNodes,
    [],
    ['target'],
    'current-output.png',
  );
  assert.deepEqual(result.target.uploadedImages, ['current-output.png']);
  assert.deepEqual(result.target.groupAssetInputUrls, ['current-output.png']);
});

test('节点属性只应用到其他素材实例并保留各自素材图', () => {
  const execution = {
    mode: 'assets',
    assets: {
      activeId: 'run-a',
      templateNodeStates: {
        target: { params: { prompt: 'template' }, uploadedImages: ['template-manual.png'] },
      },
      runs: [
        {
          id: 'run-a',
          nodeStates: {
            target: {
              params: { prompt: 'active' },
              uploadedImages: ['asset-a.png', 'active-manual.png'],
              groupAssetInputUrls: ['asset-a.png'],
            },
          },
        },
        {
          id: 'run-b',
          nodeStates: {
            target: {
              params: { prompt: 'old' },
              uploadedImages: ['asset-b.png', 'old-manual.png'],
              groupAssetInputUrls: ['asset-b.png'],
            },
          },
        },
      ],
    },
  };
  const result = applyNodePropertiesToAssetRuns(
    execution,
    'target',
    execution.assets.runs[0].nodeStates.target,
    ['params.prompt', 'uploadedImages'],
  );

  assert.deepEqual(result.assets.runs[0], execution.assets.runs[0]);
  assert.deepEqual(result.assets.runs[1].nodeStates.target, {
    params: { prompt: 'active' },
    uploadedImages: ['asset-b.png', 'active-manual.png'],
    groupAssetInputUrls: ['asset-b.png'],
  });
  assert.deepEqual(result.assets.templateNodeStates.target, {
    params: { prompt: 'active' },
    uploadedImages: ['active-manual.png'],
  });
});

test('对话框关闭时空绑定返回默认过滤器', () => {
  assert.deepEqual(resolveGroupOutputFilter(null, undefined), {
    mode: GROUP_OUTPUT_FILTER_MODES.all,
    nodeIds: [],
    nodeTypes: [],
  });
  assert.deepEqual(resolveGroupOutputFilter({
    sourceGroupId: 'source',
    filter: { mode: 'nodes', nodeIds: ['a'] },
  }, 'source'), {
    mode: GROUP_OUTPUT_FILTER_MODES.nodes,
    nodeIds: ['a'],
    nodeTypes: [],
  });
});

test('组拖线预览不依赖 renderer 未暴露的 react-dom createPortal', () => {
  const source = readFileSync(new URL('../components/canvas/GroupExecutionToolbar.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]react-dom['"]/);
  assert.doesNotMatch(source, /\bcreatePortal\s*\(/);
  assert.match(source, /data-group-connect-id=\{groupId\}/);
  assert.match(source, /querySelectorAll\('\[data-group-connect-id\]'\)/);
});

test('已连接的分组工具栏支持直接解除组间连接', () => {
  const toolbarSource = readFileSync(
    new URL('../components/canvas/GroupExecutionToolbar.jsx', import.meta.url),
    'utf8',
  );
  const overlaysSource = readFileSync(
    new URL('../components/canvas/GroupOverlays.jsx', import.meta.url),
    'utf8',
  );
  assert.match(toolbarSource, /outputBinding && \(/);
  assert.match(toolbarSource, /title="解除与来源分组的连接"/);
  assert.match(toolbarSource, /onDisconnectGroup\?\.\(group\.id\)/);
  assert.match(overlaysSource, /onDisconnectGroup=\{onDisconnectOutputBinding\}/);
});

test('分组素材移除按钮不依赖缩略图 hover 状态', () => {
  const source = readFileSync(
    new URL('../components/canvas/GroupExecutionToolbar.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /\{!outputBinding && \(/);
  assert.doesNotMatch(source, /hoveredAssetId/);
  assert.doesNotMatch(source, /setHoveredAssetId/);
});

test('共享组输出手柄支持连接到组输入手柄', () => {
  const source = readFileSync(new URL('../../../../../../web/src/components/workflow/workflow-group-node.tsx', import.meta.url), 'utf8');
  assert.match(source, /onConnectGroup\?: \(sourceGroupId: string, targetGroupId: string\)/);
  assert.match(source, /getGroupConnectTargetAtScreenPoint\(upEvent\.clientX, upEvent\.clientY\)/);
});

test('分组工具栏支持运行所有并展示素材实例状态', () => {
  const toolbarSource = readFileSync(
    new URL('../components/canvas/GroupExecutionToolbar.jsx', import.meta.url),
    'utf8',
  );
  const executionSource = readFileSync(
    new URL('../hooks/useGroupExecution.js', import.meta.url),
    'utf8',
  );
  const selectionDialogSource = readFileSync(
    new URL('../components/canvas/GroupRunSelectionDialog.jsx', import.meta.url),
    'utf8',
  );
  assert.match(toolbarSource, /'运行所有'/);
  assert.match(toolbarSource, /'停止所有'/);
  assert.match(toolbarSource, /function RunStatusLabel/);
  assert.match(toolbarSource, /Loader2[^\n]*animate-spin/);
  assert.match(selectionDialogSource, /全选/);
  assert.match(selectionDialogSource, /反选/);
  assert.match(selectionDialogSource, /runs\.map\(\(run\) => run\.id\)/);
  assert.match(executionSource, /for \(const run of runs\)/);
  assert.match(executionSource, /selectedRunIds\.has\(run\.id\)/);
  assert.match(executionSource, /await executeCurrentRun\(context\.nodeIds, run\.id\)/);
  assert.match(executionSource, /const stopAllRuns = useCallback/);
  assert.match(executionSource, /activeId: initialActiveId/);
  const switchRunSource = executionSource.slice(
    executionSource.indexOf('const switchRun = useCallback'),
    executionSource.indexOf('const uploadAssets = useCallback'),
  );
  assert.match(switchRunSource, /if \(!context\) return;/);
  assert.doesNotMatch(switchRunSource, /context\.busy/);
  assert.doesNotMatch(switchRunSource, /saveActiveRun\(context\.execution, context\.currentStates\)/);
});

test('普通节点执行冻结实例身份并由队列按执行节点 ID 隔离', () => {
  const canvasSource = readFileSync(
    new URL('../components/Canvas.jsx', import.meta.url),
    'utf8',
  );
  const queueSource = readFileSync(
    new URL('../hooks/useExecutionQueue.js', import.meta.url),
    'utf8',
  );
  assert.match(canvasSource, /executionTarget: groupExecution\.getExecutionTargetForNode\(nodeId\)/);
  assert.match(canvasSource, /executionNodeId: executionTarget\?\.nodeId \|\| node\.id/);
  assert.match(canvasSource, /onGenerate: handleScopedGenerate, onGenerateMedia: handleScopedGenerateMedia/);
  assert.doesNotMatch(canvasSource, /syncActiveRunForNode/);
  assert.match(queueSource, /executionNodeId: task\.executionNodeId \|\| task\.placeholderNodeId/);
  assert.match(queueSource, /executionTarget: task\.executionTarget \|\| null/);
});

test('历史版本切换和图片删除都写回当前执行实例', () => {
  const canvasSource = readFileSync(
    new URL('../components/Canvas.jsx', import.meta.url),
    'utf8',
  );
  const executionSource = readFileSync(
    new URL('../hooks/useGroupExecution.js', import.meta.url),
    'utf8',
  );
  const switchVersionSource = canvasSource.slice(
    canvasSource.indexOf('const handleSwitchVersion = useCallback'),
    canvasSource.indexOf('const nodeCallbacks = useMemo'),
  );
  assert.match(switchVersionSource, /groupExecution\.updateExecutionNodeData\(target, patchVersion\)/);
  assert.match(canvasSource, /groupExecution\.updateExecutionNodeData\(target, patchOutput\)/);
  const targetSource = executionSource.slice(
    executionSource.indexOf('const getExecutionTargetForNode = useCallback'),
    executionSource.indexOf('const updateExecutionNodeData = useCallback'),
  );
  assert.doesNotMatch(targetSource, /mode === GROUP_EXECUTION_MODES\.assets/);
});
