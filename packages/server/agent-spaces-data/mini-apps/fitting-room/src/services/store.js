const PROFILE_PATH = 'profile.json';          // 我的作品（多张照片 + 体型信息）
const HAIRSTYLE_HISTORY_PATH = 'hairstyle-history.json';
const OUTFIT_HISTORY_PATH = 'outfit-history.json';
const CONFIG_PATH = 'shared-config.json';

function addResultsHelper(historyPath) {
  return ({ items, prompt, model, aspect, size, workflowId, workflowName, sourceImage, references }, ctx) => {
    ctx.updateConfig(historyPath, (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const existing = new Set(list.map((item) => item.url));
      const now = Date.now();
      const fresh = (Array.isArray(items) ? items : [])
        .filter((item) => item?.url && !existing.has(item.url))
        .map((item, index) => ({
          id: `${now}-${index}`,
          type: 'image',
          url: item.url,
          thumbUrl: item.thumbUrl || item.url,
          prompt,
          model,
          aspect,
          size,
          workflowId,
          workflowName,
          sourceImage: sourceImage || null,
          references: Array.isArray(references) ? references : [],
          createdAt: new Date().toLocaleString('zh-CN'),
        }));
      return fresh.length ? [...fresh, ...list].slice(0, 200) : list;
    });
    return { ok: true };
  };
}

export default {
  // 我的作品：保存体型与照片列表
  save_profile: (payload, ctx) => {
    const profile = {
      gender: typeof payload?.gender === 'string' ? payload.gender : '',
      height: typeof payload?.height === 'string' ? payload.height : '',
      weight: typeof payload?.weight === 'string' ? payload.weight : '',
      bust: typeof payload?.bust === 'string' ? payload.bust : '',
      waist: typeof payload?.waist === 'string' ? payload.waist : '',
      hip: typeof payload?.hip === 'string' ? payload.hip : '',
      photos: Array.isArray(payload?.photos) ? payload.photos : [],
      outfits: Array.isArray(payload?.outfits) ? payload.outfits : [],
      updatedAt: new Date().toLocaleString('zh-CN'),
    };
    ctx.writeConfig(PROFILE_PATH, profile);
    return { ok: true };
  },

  add_hairstyle_results: addResultsHelper(HAIRSTYLE_HISTORY_PATH),
  remove_hairstyle_result: ({ id }, ctx) => {
    ctx.updateConfig(HAIRSTYLE_HISTORY_PATH, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((item) => item.id !== id),
    );
    return { ok: true };
  },
  clear_hairstyle_results: (_payload, ctx) => {
    ctx.writeConfig(HAIRSTYLE_HISTORY_PATH, []);
    return { ok: true };
  },

  add_outfit_results: addResultsHelper(OUTFIT_HISTORY_PATH),
  remove_outfit_result: ({ id }, ctx) => {
    ctx.updateConfig(OUTFIT_HISTORY_PATH, (prev) =>
      (Array.isArray(prev) ? prev : []).filter((item) => item.id !== id),
    );
    return { ok: true };
  },
  clear_outfit_results: (_payload, ctx) => {
    ctx.writeConfig(OUTFIT_HISTORY_PATH, []);
    return { ok: true };
  },

  save_shared_config: (payload, ctx) => {
    const config = {
      hairstyleWorkflowId: typeof payload?.hairstyleWorkflowId === 'string' ? payload.hairstyleWorkflowId : '',
      hairstyleWorkflowName: typeof payload?.hairstyleWorkflowName === 'string' ? payload.hairstyleWorkflowName : '',
      outfitWorkflowId: typeof payload?.outfitWorkflowId === 'string' ? payload.outfitWorkflowId : '',
      outfitWorkflowName: typeof payload?.outfitWorkflowName === 'string' ? payload.outfitWorkflowName : '',
    };
    ctx.writeConfig(CONFIG_PATH, config);
    return { ok: true };
  },
};
