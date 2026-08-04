import { useCallback } from 'react';
import { generateAudio, generateImages, generateVideo } from '../utils/workflow';
import { normalizeImportedStoryboard, runStoryboardAgent } from '../utils/storyboard';
import { genId } from '../utils/canvas-id';
import { resolveStoryboardGenerationParams } from '../utils/storyboard-generation';

export default function useStoryboardOperations({
  updateNodeData, characters, saveCharacters, settings, directory,
}) {
  const importStoryboard = useCallback(async (nodeId, text, agentConfigId) => {
    const parsed = await runStoryboardAgent(text, agentConfigId);
    const normalized = normalizeImportedStoryboard(parsed, characters);
    await saveCharacters(normalized.characters);
    updateNodeData(nodeId, { scenes: normalized.scenes, status: 'done', error: undefined });
    return normalized;
  }, [characters, saveCharacters, updateNodeData]);

  const generateSceneMedia = useCallback(async (nodeId, scene, kind, params) => {
    const selectedCharacters = (scene.characterIds || []).map((id) => characters.find((item) => item.id === id)).filter(Boolean);
    const referenceImages = selectedCharacters.flatMap((character) => (character.images || []).filter((item) => item.selected && item.url).map((item) => item.url));
    const presets = resolveStoryboardGenerationParams(params, settings);
    let urls = [];
    if (kind === 'image') {
      const characterPrompt = selectedCharacters.map((item) => item.prompt).filter(Boolean).join('; ');
      const prompt = [characterPrompt, scene.visualPrompt].filter(Boolean).join('\n');
      const workflowId = referenceImages.length ? settings.editImageWorkflowId : settings.textToImageWorkflowId;
      const preset = referenceImages.length ? presets.editImage : presets.textToImage;
      const result = await generateImages(workflowId, {
        ...(referenceImages.length ? { images: referenceImages } : {}),
        prompt,
        model: preset.model,
        aspect: preset.aspect,
        size: preset.size,
        count: Math.max(1, Number(preset.count) || 1),
        concurrency: Math.max(1, Number(preset.concurrency) || 1),
      }, { directory, historyId: genId('story-hist') });
      urls = result.urls;
    } else if (kind === 'video') {
      const sourceImages = scene.images?.length ? scene.images.slice(-1) : referenceImages.slice(0, 1);
      const preset = presets.video;
      const result = await generateVideo(settings.videoGeneratorWorkflowId, {
        images: sourceImages,
        prompt: scene.animationPrompt,
        model: preset.model,
        aspect: preset.aspect,
        quality: preset.quality,
        duration: preset.duration,
        count: Math.max(1, Number(preset.count) || 1),
        concurrency: Math.max(1, Number(preset.concurrency) || 1),
      });
      urls = [result.url];
    } else {
      const preset = presets.voice;
      const result = await generateAudio(settings.textToVoiceWorkflowId, {
        prompt: scene.narration,
        model: preset.model,
        ...(preset.voiceId ? { voiceId: preset.voiceId } : {}),
        count: Math.max(1, Number(preset.count) || 1),
        concurrency: Math.max(1, Number(preset.concurrency) || 1),
      });
      urls = [result.url];
    }

    const field = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'audios';
    updateNodeData(nodeId, (data) => ({
      scenes: (data.scenes || []).map((item) => (item.id === scene.id ? { ...item, [field]: [...(item[field] || []), ...urls] } : item)),
      status: 'done',
      error: undefined,
    }));
    return urls;
  }, [
    characters, settings, directory, updateNodeData,
  ]);

  return { importStoryboard, generateSceneMedia };
}
