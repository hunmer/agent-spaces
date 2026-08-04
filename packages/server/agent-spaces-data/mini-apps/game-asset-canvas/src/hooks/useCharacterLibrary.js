import { useCallback, useEffect, useState } from 'react';
import { onAnyConfigChanged } from '../utils/storage';

const filePath = (workspaceId) => `workspaces/${workspaceId || 'default'}/storyboard-characters.json`;

export default function useCharacterLibrary(workspaceId) {
  const [characters, setCharacters] = useState([]);

  useEffect(() => {
    const as = window.AgentSpaces;
    const target = filePath(workspaceId);
    const apply = (value) => setCharacters(Array.isArray(value?.characters) ? value.characters : []);
    apply(as?.getConfig?.(target));
    const unready = as?.onConfigReady?.((configs) => apply(configs?.[target]));
    const unsubscribe = onAnyConfigChanged((path, value) => {
      if (path === target) apply(value);
    });
    return () => {
      try { unready?.(); } catch {}
      try { unsubscribe?.(); } catch {}
    };
  }, [workspaceId]);

  const saveCharacters = useCallback((next) => window.AgentSpaces?.invokeService?.('save_storyboard_characters', {
    workspaceId,
    characters: next,
  }), [workspaceId]);

  const saveCharacter = useCallback((character) => window.AgentSpaces?.invokeService?.('save_storyboard_character', {
    workspaceId,
    character,
  }), [workspaceId]);

  const deleteCharacter = useCallback((id) => window.AgentSpaces?.invokeService?.('delete_storyboard_character', {
    workspaceId,
    id,
  }), [workspaceId]);

  return { characters, saveCharacters, saveCharacter, deleteCharacter };
}

