function defaultAttachments(spineJson) {
  const skins = spineJson?.skins;
  if (Array.isArray(skins)) {
    return skins.find((skin) => skin?.name === 'default')?.attachments || {};
  }
  return skins?.default || {};
}

/** Resolve one current/default attachment image for every Spine slot. */
export function collectSlotReferenceParts(spineJson, regions) {
  const regionMap = new Map((regions || []).map((region) => [region.name, region]));
  const setupAttachments = new Map(
    (spineJson?.slots || []).map((slot) => [slot.name, slot.attachment]).filter(([, value]) => value),
  );
  const parts = [];
  for (const [slot, attachments] of Object.entries(defaultAttachments(spineJson))) {
    const entries = Object.entries(attachments || {});
    if (!entries.length) continue;
    const setupName = setupAttachments.get(slot);
    const [attachment, meta = {}] = entries.find(([name]) => name === setupName) || entries[0];
    const candidates = [meta.path, meta.name, attachment].filter(Boolean);
    const regionName = candidates.find((name) => regionMap.has(name));
    if (!regionName) continue;
    const region = regionMap.get(regionName);
    parts.push({
      id: slot,
      slot,
      attachment,
      regionName,
      region,
      width: region.origW || region.w,
      height: region.origH || region.h,
    });
  }
  return parts;
}

/** Preserve each source size while placing selected parts in one horizontal reference image. */
export function buildHorizontalPartLayout(parts) {
  let x = 0;
  let height = 1;
  const items = (parts || []).map((part) => {
    const width = Math.max(1, Math.round(part.width));
    const itemHeight = Math.max(1, Math.round(part.height));
    const item = { ...part, x, y: 0, width, height: itemHeight };
    x += width;
    height = Math.max(height, itemHeight);
    return item;
  });
  return { width: Math.max(1, x), height, items };
}

/** Add transparent padding so the submitted reference exactly matches a supported workflow aspect. */
export function padPartLayoutToAspect(layout, aspectRatio) {
  const currentRatio = layout.width / Math.max(1, layout.height);
  let width = layout.width;
  let height = layout.height;
  if (currentRatio < aspectRatio) width = Math.ceil(height * aspectRatio);
  else if (currentRatio > aspectRatio) height = Math.ceil(width / aspectRatio);
  const offsetX = (width - layout.width) / 2;
  const offsetY = (height - layout.height) / 2;
  return {
    width,
    height,
    items: layout.items.map((item) => ({
      ...item,
      x: item.x + offsetX,
      y: item.y + offsetY,
    })),
  };
}

export function scalePartLayout(layout, outputWidth, outputHeight) {
  const scale = Math.min(
    outputWidth / Math.max(1, layout.width),
    outputHeight / Math.max(1, layout.height),
  );
  const offsetX = (outputWidth - layout.width * scale) / 2;
  const offsetY = (outputHeight - layout.height * scale) / 2;
  return layout.items.map((item) => ({
    ...item,
    sourceX: offsetX + item.x * scale,
    sourceY: offsetY + item.y * scale,
    sourceWidth: item.width * scale,
    sourceHeight: item.height * scale,
  }));
}

export function fitInside(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(
    targetWidth / Math.max(1, sourceWidth),
    targetHeight / Math.max(1, sourceHeight),
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

/** Pick the effective result for each region: preview > current animation > all animations. */
export function selectApplicablePartResults(results, animation) {
  const selected = new Map();
  const rank = { all: 1, animation: 2, preview: 3 };
  for (const result of results || []) {
    const scope = result.scope;
    if (!rank[scope]) continue;
    if ((scope === 'animation' || scope === 'preview') && result.animation !== animation) continue;
    const current = selected.get(result.regionName);
    if (!current || rank[scope] >= rank[current.scope]) selected.set(result.regionName, result);
  }
  return [...selected.values()];
}
