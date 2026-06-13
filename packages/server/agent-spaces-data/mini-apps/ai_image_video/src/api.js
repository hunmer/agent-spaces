/**
 * Agent 可调用的项目 API。
 *
 * 设计原则：与 ai_image_video 的「任务驱动模型」对齐——agent 不直接
 * 调插件生成，而是通过 broadcast 指挥前端走完整的 callPluginTool →
 * task 队列 → 自动落库流程；agent 自己负责读历史 / 切 UI 状态。
 *
 * 对应前端事件监听见 src/index.jsx。
 */

// 可用模式（与 utils/providers.js 同步，handler 不能 import）
const MODE_LIST = [
  { id: 'text_to_image', label: '文生图', needInput: 'none' },
  { id: 'image_to_image', label: '图生图', needInput: 'image' },
  { id: 'image_edit', label: '图片编辑', needInput: 'image' },
  { id: 'image_to_video', label: '图生视频', needInput: 'image' },
  { id: 'image_outpainting', label: '扩图', needInput: 'image' },
  { id: 'video_editing', label: '视频编辑', needInput: 'video' },
  { id: 'video_retalk', label: '数字人', needInput: 'video+audio' },
];

// 提供商×模式支持矩阵（与 utils/providers.js 同步）
const PROVIDER_MATRIX = {
  minimax: ['image_to_video'],
  jimeng: ['text_to_image', 'image_to_image', 'image_to_video'],
  aliyun: ['text_to_image', 'image_to_image', 'image_edit', 'image_to_video', 'image_outpainting', 'video_editing', 'video_retalk'],
  openai: ['text_to_image', 'image_to_image', 'image_edit'],
};

const PROVIDER_LABELS = {
  minimax: 'MiniMax',
  jimeng: '即梦',
  aliyun: '阿里云',
  openai: 'OpenAI',
};

export default {
  /**
   * 读取生成历史。结果由前端 useGeneration 自动落库到 configs/generation-history.json。
   */
  get_generation_history: (input, ctx) => {
    const raw = ctx.readConfig('generation-history.json');
    const all = Array.isArray(raw) ? raw : [];

    const mode = String(input?.mode || '').trim();
    const provider = String(input?.provider || '').trim();
    const filtered = all.filter((item) => {
      if (mode && item?.mode !== mode) return false;
      if (provider && item?.provider !== provider) return false;
      return true;
    });

    const limit = Number.isFinite(input?.limit) ? Math.max(1, Math.min(100, input.limit)) : 20;
    const sorted = filtered.slice().sort((a, b) => {
      const ta = new Date(a?.createdAt || a?.timestamp || 0).getTime();
      const tb = new Date(b?.createdAt || b?.timestamp || 0).getTime();
      return tb - ta;
    });

    return {
      ok: true,
      total: filtered.length,
      returned: Math.min(sorted.length, limit),
      items: sorted.slice(0, limit).map((item) => ({
        id: item.id,
        type: item.type,
        url: item.url,
        mode: item.mode,
        modeLabel: MODE_LIST.find((m) => m.id === item.mode)?.label || item.mode,
        provider: item.provider,
        providerLabel: PROVIDER_LABELS[item.provider] || item.provider,
        prompt: item.prompt,
        createdAt: item.createdAt,
      })),
      message: filtered.length
        ? `共 ${filtered.length} 条历史`
        : '历史为空',
    };
  },

  /**
   * 列出可用模式与对应支持的提供商。agent 决定 switch_mode 目标前应先查询。
   */
  get_capabilities: (_input, _ctx) => {
    const modes = MODE_LIST.map((m) => ({
      id: m.id,
      label: m.label,
      needInput: m.needInput,
      providers: Object.keys(PROVIDER_MATRIX)
        .filter((p) => PROVIDER_MATRIX[p].includes(m.id))
        .map((p) => ({ id: p, label: PROVIDER_LABELS[p] })),
    }));
    return {
      ok: true,
      modes,
      providers: Object.entries(PROVIDER_LABELS).map(([id, label]) => ({
        id,
        label,
        supportedModes: PROVIDER_MATRIX[id],
      })),
    };
  },

  /**
   * 切换左侧面板的创作模式。前端会自动联动可用提供商与默认模型。
   */
  switch_mode: (input, ctx) => {
    const mode = String(input?.mode || '').trim();
    const valid = MODE_LIST.some((m) => m.id === mode);
    if (!valid) {
      return {
        ok: false,
        message: `未知模式：${mode || '(空)'}。可选用：${MODE_LIST.map((m) => m.id).join(', ')}`,
      };
    }
    const supportedProviders = Object.keys(PROVIDER_MATRIX).filter((p) =>
      PROVIDER_MATRIX[p].includes(mode),
    );
    ctx.broadcast('miniApp.switchMode', { mode });
    return {
      ok: true,
      mode,
      modeLabel: MODE_LIST.find((m) => m.id === mode).label,
      supportedProviders,
      message: `已切到「${MODE_LIST.find((m) => m.id === mode).label}」模式，可用提供商：${supportedProviders.join(', ')}`,
    };
  },

  /**
   * 设置左侧表单字段。仅更新表单状态，不立即提交。
   * 支持字段：prompt, negativePrompt, provider, model, size, ratio, resolution,
   *           duration, n, quality, outputFormat, sampleStrength, expandMode,
   *           outputRatio, xScale, yScale。
   */
  set_form: (input, ctx) => {
    const allowed = [
      'prompt', 'negativePrompt', 'provider', 'model',
      'size', 'ratio', 'resolution', 'duration', 'n',
      'quality', 'outputFormat', 'sampleStrength',
      'expandMode', 'outputRatio', 'xScale', 'yScale',
      'leftOffset', 'rightOffset', 'topOffset', 'bottomOffset', 'angle',
    ];
    const patch = {};
    for (const key of allowed) {
      if (input && Object.prototype.hasOwnProperty.call(input, key)) {
        patch[key] = input[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      return { ok: false, message: '未提供任何字段。可用字段：' + allowed.join(', ') };
    }
    if (patch.provider) {
      const valid = Object.keys(PROVIDER_MATRIX).includes(patch.provider);
      if (!valid) {
        return {
          ok: false,
          message: `未知提供商：${patch.provider}。可选用：${Object.keys(PROVIDER_MATRIX).join(', ')}`,
        };
      }
    }
    ctx.broadcast('miniApp.setForm', patch);
    return {
      ok: true,
      applied: Object.keys(patch),
      message: `已更新 ${Object.keys(patch).length} 个字段`,
    };
  },

  /**
   * 触发当前左侧表单提交。前端会走完整任务流程（callPluginTool → task 队列 → 自动落库）。
   * 提交前确保必填字段已通过 set_form 设置（不同模式要求不同）。
   */
  trigger_generate: (_input, ctx) => {
    ctx.broadcast('miniApp.triggerGenerate', {});
    return { ok: true, message: '已发起生成请求，前端将通过任务队列执行；用户可在右侧结果区查看进度' };
  },

  /**
   * 把历史结果（或任意远程 URL）作为输入源，自动切到目标模式并预填到左侧表单。
   * 用于「把这张图改成 X」「把这张图变成视频」等二次创作场景。
   */
  use_as_source: (input, ctx) => {
    const targetMode = String(input?.mode || '').trim();
    const valid = MODE_LIST.some((m) => m.id === targetMode);
    if (!valid) {
      return {
        ok: false,
        message: `未知目标模式：${targetMode || '(空)'}。可选用：${MODE_LIST.map((m) => m.id).join(', ')}`,
      };
    }

    const sourceId = String(input?.sourceId || '').trim();
    const sourceUrl = String(input?.sourceUrl || '').trim();

    let resolved = null;
    if (sourceUrl) {
      resolved = { type: input?.type || 'image', url: sourceUrl, prompt: '' };
    } else if (sourceId) {
      const raw = ctx.readConfig('generation-history.json');
      const history = Array.isArray(raw) ? raw : [];
      const found = history.find((item) => item?.id === sourceId);
      if (!found) {
        return { ok: false, message: `未找到 id=${sourceId} 的历史结果` };
      }
      resolved = { type: found.type, url: found.url, prompt: found.prompt || '', provider: found.provider };
    }

    if (!resolved) {
      return {
        ok: false,
        message: '必须提供 sourceId（来自 get_generation_history）或 sourceUrl',
      };
    }

    // 校验源类型与目标模式匹配（图→图模式，视频→视频模式）
    const isVideoMode = ['video_editing', 'video_retalk'].includes(targetMode);
    if (isVideoMode && resolved.type !== 'video') {
      return { ok: false, message: `${targetMode} 需要视频源，但提供的源是 ${resolved.type}` };
    }
    if (!isVideoMode && resolved.type !== 'image' && targetMode !== 'image_to_video') {
      return { ok: false, message: `${targetMode} 需要图片源，但提供的源是 ${resolved.type}` };
    }

    ctx.broadcast('miniApp.useAsSource', {
      mode: targetMode,
      source: resolved,
    });
    return {
      ok: true,
      mode: targetMode,
      modeLabel: MODE_LIST.find((m) => m.id === targetMode).label,
      source: { type: resolved.type, url: resolved.url },
      message: `已切到「${MODE_LIST.find((m) => m.id === targetMode).label}」并预填输入源，后续可用 set_form 补充 prompt，再 trigger_generate`,
    };
  },

  /**
   * 删除单条历史结果。
   */
  delete_result: (input, ctx) => {
    const id = String(input?.id || '').trim();
    if (!id) return { ok: false, message: 'id 必填' };
    ctx.broadcast('miniApp.deleteResult', { id });
    return { ok: true, id, message: '已请求删除（前端走服务端 services，所有客户端同步）' };
  },

  /**
   * 清空所有历史结果。
   */
  clear_history: (_input, ctx) => {
    ctx.broadcast('miniApp.clearHistory', {});
    return { ok: true, message: '已请求清空历史' };
  },
};
