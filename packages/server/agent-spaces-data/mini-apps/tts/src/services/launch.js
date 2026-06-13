const PROVIDERS = new Set(['minimax', 'fishaudio', 'qianyin']);
const MODES = new Set(['single', 'signal', 'multi']);

function normalizeLaunchPayload(input) {
  const modeRaw = String(input?.mode || '').trim().toLowerCase();
  const providerRaw = String(input?.provider || '').trim().toLowerCase();
  const text = String(input?.text || '').trim();

  if (!text) return { ok: false, message: 'text 不能为空' };
  if (modeRaw && !MODES.has(modeRaw)) {
    return { ok: false, message: 'mode 仅支持 signal、single 或 multi' };
  }
  if (providerRaw && !PROVIDERS.has(providerRaw)) {
    return { ok: false, message: 'provider 仅支持 minimax、fishaudio 或 qianyin' };
  }

  return {
    ok: true,
    payload: {
      mode: modeRaw === 'signal' ? 'single' : (modeRaw || 'single'),
      provider: providerRaw || 'minimax',
      text,
    },
  };
}

export default {
  launch_tts: (input, ctx) => {
    const normalized = normalizeLaunchPayload(input);
    if (!normalized.ok) return normalized;

    ctx.broadcast('miniApp.ttsLaunch', normalized.payload);
    return {
      ok: true,
      message: '已发送到配音',
      launch: normalized.payload,
    };
  },
};
