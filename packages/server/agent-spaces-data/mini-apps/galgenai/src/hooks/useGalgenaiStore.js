// 中央状态 hook：替代原 zustand store。
// 持久化分两层：
//   - settings.json：用户偏好（人设、模型、TTS、agent preset、背景、用户名、模型库缓存、收藏/最近），
//     一次性读写，UI 端 writeConfigJson（单用户场景足够，不并发）。
//   - state.json：可变的「当前会话 + 历史」消息，通过 services/state.js 服务端单写者更新，
//     UI 用 getConfig + onConfigChanged 监听，保证多预览实例一致。
//
// Live2D 瞬态状态（availableMotions / motionToPlay）只存在内存，不持久化。
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_REPO,
  DEFAULT_TTS_WORKFLOW_ID,
  DEFAULT_TTS_WORKFLOW_NAME,
  TTS_PROVIDERS,
} from '../utils/constants';

const SETTINGS_PATH = 'settings.json';
const STATE_PATH = 'state.json';

const DEFAULT_SETTINGS = {
  userName: 'Master',
  backgroundUrl: DEFAULT_BACKGROUND,
  // 模型
  models: [],
  currentModelId: '',
  // 模型库
  repositories: [DEFAULT_REPO],
  libraryCache: [],
  libraryLastUpdated: 0,
  favoriteModels: [],
  recentModels: [],
  // TTS（简化版：总开关 + provider + voiceId + 工作流）
  ttsEnabled: true,
  ttsProvider: 'minimax',
  ttsVoiceId: '',
  ttsWorkflowId: DEFAULT_TTS_WORKFLOW_ID,
  ttsWorkflowName: DEFAULT_TTS_WORKFLOW_NAME,
  // 多个 agent 配置：[{ id, name, modelProvider }]
  agents: [],
  currentAgentId: '',
};

function shallowMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  return { ...base, ...override };
}

export function useGalgenaiStore() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // state.json（messages + history），由服务端单写者维护，本地仅镜像
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [stateLoaded, setStateLoaded] = useState(false);

  // Live2D 瞬态
  const [availableMotions, setAvailableMotions] = useState([]);
  const [motionToPlay, setMotionToPlay] = useState(null);

  // 视图路由（不持久化，永远从 chat 开始）
  const [currentView, setCurrentView] = useState('chat');

  // ===== 加载 settings.json =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await window.AgentSpacesUI.readConfigJson(SETTINGS_PATH);
        if (!cancelled && cfg && typeof cfg === 'object') {
          setSettings((prev) => shallowMerge(prev, cfg));
        }
      } catch (e) {
        console.warn('[store] 读取 settings.json 失败：', e);
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // settings 变更后写回（首次加载后才开始写）
  useEffect(() => {
    if (!settingsLoaded) return;
    window.AgentSpacesUI.writeConfigJson(SETTINGS_PATH, settings).catch((e) =>
      console.warn('[store] 写 settings.json 失败：', e),
    );
  }, [settings, settingsLoaded]);

  // ===== 加载并监听 state.json =====
  useEffect(() => {
    const AS = window.AgentSpaces;
    // 初始：getConfig 在 configSnapshot 到达后才有值；监听 ready
    const refresh = () => {
      const v = AS.getConfig?.(STATE_PATH);
      if (v && typeof v === 'object') {
        setMessages(Array.isArray(v.messages) ? v.messages : []);
        setHistory(Array.isArray(v.history) ? v.history : []);
        setStateLoaded(true);
      }
    };
    refresh();
    const onReady = AS.onConfigReady?.(() => refresh());
    const unsub = AS.onConfigChanged?.((path, value) => {
      if (path === STATE_PATH) {
        setMessages(Array.isArray(value?.messages) ? value.messages : []);
        setHistory(Array.isArray(value?.history) ? value.history : []);
        setStateLoaded(true);
      }
    });
    return () => {
      try { onReady?.(); } catch { /* noop */ }
      try { unsub?.(); } catch { /* noop */ }
    };
  }, []);

  // ===== settings 局部更新 =====
  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // ===== state.json 经服务端单写者更新 =====
  const addMessage = useCallback(async (message) => {
    await window.AgentSpaces.invokeService('add_message', { message });
  }, []);

  const clearMessages = useCallback(async () => {
    await window.AgentSpaces.invokeService('clear_messages', {});
  }, []);

  const archiveSession = useCallback(async () => {
    await window.AgentSpaces.invokeService('archive_session', {});
  }, []);

  const deleteHistory = useCallback(async (index) => {
    await window.AgentSpaces.invokeService('delete_history', { index });
  }, []);

  // ===== Live2D =====
  const triggerMotion = useCallback((group) => setMotionToPlay(group), []);

  return {
    // settings
    settings,
    settingsLoaded,
    updateSettings,
    // state（服务端权威）
    messages,
    history,
    stateLoaded,
    addMessage,
    clearMessages,
    archiveSession,
    deleteHistory,
    // view
    currentView,
    setView: setCurrentView,
    // live2d 瞬态
    availableMotions,
    setAvailableMotions,
    motionToPlay,
    triggerMotion,
    // 常量便捷透传
    ttsProviders: TTS_PROVIDERS,
  };
}
