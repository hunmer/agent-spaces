"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DialogSetterMap = Record<string, React.Dispatch<React.SetStateAction<boolean>>>;

// 桌面端：每个 dialog 对应的 URL hash 路径（与移动端 pathname 对齐，如 #/settings/agents）
// 仅列出需要参与 hash 同步的 dialog；layout 不需要，故不在此表中。
const DIALOG_HASH_PATHS: Record<string, string> = {
  agents: "/settings/agents",
  skills: "/settings/skills",
  skillsPackages: "/settings/skills-packages",
  prompts: "/settings/prompts",
  "output-styles": "/settings/output-styles",
  mcps: "/settings/mcps",
  models: "/settings/models",
  providers: "/settings/providers",
  hooks: "/settings/hooks",
  commands: "/settings/commands",
  tools: "/settings/tools",
  settings: "/settings",
};

const HASH_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(DIALOG_HASH_PATHS).map(([k, v]) => [v, k])
);
const DIALOG_KEYS = Object.keys(DIALOG_HASH_PATHS);

function readHashPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}

export function useSidebarDialogs(isMobile = false) {
  const [agentDialogOpen, setAgentDialogOpenRaw] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpenRaw] = useState(false);
  const [modelsDialogOpen, setModelsDialogOpenRaw] = useState(false);
  const [providersDialogOpen, setProvidersDialogOpenRaw] = useState(false);
  const [skillsDialogOpen, setSkillsDialogOpenRaw] = useState(false);
  const [skillsPackageDialogOpen, setSkillsPackageDialogOpenRaw] = useState(false);
  const [promptsDialogOpen, setPromptsDialogOpenRaw] = useState(false);
  const [outputStylesDialogOpen, setOutputStylesDialogOpenRaw] = useState(false);
  const [mcpsDialogOpen, setMcpsDialogOpenRaw] = useState(false);
  const [hooksDialogOpen, setHooksDialogOpenRaw] = useState(false);
  const [agentCommandsDialogOpen, setAgentCommandsDialogOpenRaw] = useState(false);
  const [toolsDialogOpen, setToolsDialogOpenRaw] = useState(false);
  const [layoutDialogOpen, setLayoutDialogOpenRaw] = useState(false);
  const [modelsDialogProvider, setModelsDialogProvider] = useState<string | undefined>(undefined);
  // 仅用于"定位到服务商分组"（不进入新增表单），与 initialProvider 区分
  const [modelsDialogFocusProvider, setModelsDialogFocusProvider] = useState<string | undefined>(undefined);

  // 当前 open 状态的 ref 镜像，供 hashchange 同步时判断是否需要更新，避免冗余渲染
  const openStateRef = useRef<Record<string, boolean>>({});
  openStateRef.current = {
    agents: agentDialogOpen,
    skills: skillsDialogOpen,
    skillsPackages: skillsPackageDialogOpen,
    prompts: promptsDialogOpen,
    "output-styles": outputStylesDialogOpen,
    mcps: mcpsDialogOpen,
    models: modelsDialogOpen,
    providers: providersDialogOpen,
    hooks: hooksDialogOpen,
    commands: agentCommandsDialogOpen,
    tools: toolsDialogOpen,
    settings: settingsDialogOpen,
  };

  // setter 引用镜像，供 hashchange 回调调用最新的包装 setter
  const setterMapRef = useRef<DialogSetterMap>({});

  // 仅桌面端：把指定 key 的 dialog 开关同步到 URL hash
  const syncHash = useCallback(
    (key: string, open: boolean) => {
      if (isMobile) return;
      const path = DIALOG_HASH_PATHS[key];
      if (!path || typeof window === "undefined") return;
      if (open) {
        if (readHashPath() !== path) {
          window.location.hash = path;
        }
      } else if (readHashPath() === path) {
        // 关闭对应 dialog 时清掉 hash，避免地址栏残留与历史污染
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    },
    [isMobile]
  );

  // 包装原始 setter：设状态的同时同步 hash（保留函数式更新用法）
  const wrap = useCallback(
    (raw: React.Dispatch<React.SetStateAction<boolean>>, key: string) =>
      (value: boolean | ((prev: boolean) => boolean)) => {
        raw((prev) => {
          const next = typeof value === "function" ? (value as (p: boolean) => boolean)(prev) : value;
          syncHash(key, next);
          return next;
        });
      },
    [syncHash]
  );

  const setAgentDialogOpen = useMemo(() => wrap(setAgentDialogOpenRaw, "agents"), [wrap, setAgentDialogOpenRaw]);
  const setSettingsDialogOpen = useMemo(() => wrap(setSettingsDialogOpenRaw, "settings"), [wrap, setSettingsDialogOpenRaw]);
  const setModelsDialogOpen = useMemo(() => wrap(setModelsDialogOpenRaw, "models"), [wrap, setModelsDialogOpenRaw]);
  const setProvidersDialogOpen = useMemo(() => wrap(setProvidersDialogOpenRaw, "providers"), [wrap, setProvidersDialogOpenRaw]);
  const setSkillsDialogOpen = useMemo(() => wrap(setSkillsDialogOpenRaw, "skills"), [wrap, setSkillsDialogOpenRaw]);
  const setSkillsPackageDialogOpen = useMemo(() => wrap(setSkillsPackageDialogOpenRaw, "skillsPackages"), [wrap, setSkillsPackageDialogOpenRaw]);
  const setPromptsDialogOpen = useMemo(() => wrap(setPromptsDialogOpenRaw, "prompts"), [wrap, setPromptsDialogOpenRaw]);
  const setOutputStylesDialogOpen = useMemo(() => wrap(setOutputStylesDialogOpenRaw, "output-styles"), [wrap, setOutputStylesDialogOpenRaw]);
  const setMcpsDialogOpen = useMemo(() => wrap(setMcpsDialogOpenRaw, "mcps"), [wrap, setMcpsDialogOpenRaw]);
  const setHooksDialogOpen = useMemo(() => wrap(setHooksDialogOpenRaw, "hooks"), [wrap, setHooksDialogOpenRaw]);
  const setAgentCommandsDialogOpen = useMemo(() => wrap(setAgentCommandsDialogOpenRaw, "commands"), [wrap, setAgentCommandsDialogOpenRaw]);
  const setToolsDialogOpen = useMemo(() => wrap(setToolsDialogOpenRaw, "tools"), [wrap, setToolsDialogOpenRaw]);
  // layout 不参与 hash 同步，保持原始 setter
  const setLayoutDialogOpen = setLayoutDialogOpenRaw;

  const setterMap = useMemo<DialogSetterMap>(
    () => ({
      agents: setAgentDialogOpen,
      skills: setSkillsDialogOpen,
      skillsPackages: setSkillsPackageDialogOpen,
      prompts: setPromptsDialogOpen,
      "output-styles": setOutputStylesDialogOpen,
      mcps: setMcpsDialogOpen,
      models: setModelsDialogOpen,
      providers: setProvidersDialogOpen,
      hooks: setHooksDialogOpen,
      commands: setAgentCommandsDialogOpen,
      tools: setToolsDialogOpen,
      layout: setLayoutDialogOpen,
      settings: setSettingsDialogOpen,
    }),
    [
      setAgentDialogOpen,
      setSkillsDialogOpen,
      setSkillsPackageDialogOpen,
      setPromptsDialogOpen,
      setOutputStylesDialogOpen,
      setMcpsDialogOpen,
      setModelsDialogOpen,
      setProvidersDialogOpen,
      setHooksDialogOpen,
      setAgentCommandsDialogOpen,
      setToolsDialogOpen,
      setLayoutDialogOpen,
      setSettingsDialogOpen,
    ]
  );
  setterMapRef.current = setterMap;

  // 桌面端：监听 hashchange（前进/后退/刷新/外部跳转），按当前 hash 同步 dialog 状态
  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;
    const apply = () => {
      const key = HASH_TO_KEY[readHashPath()];
      DIALOG_KEYS.forEach((k) => {
        const shouldOpen = k === key;
        if (openStateRef.current[k] !== shouldOpen) {
          setterMapRef.current[k]?.(shouldOpen);
        }
      });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [isMobile]);

  return {
    agentDialogOpen,
    setAgentDialogOpen,
    settingsDialogOpen,
    setSettingsDialogOpen,
    modelsDialogOpen,
    setModelsDialogOpen,
    providersDialogOpen,
    setProvidersDialogOpen,
    skillsDialogOpen,
    setSkillsDialogOpen,
    skillsPackageDialogOpen,
    setSkillsPackageDialogOpen,
    promptsDialogOpen,
    setPromptsDialogOpen,
    outputStylesDialogOpen,
    setOutputStylesDialogOpen,
    mcpsDialogOpen,
    setMcpsDialogOpen,
    hooksDialogOpen,
    setHooksDialogOpen,
    agentCommandsDialogOpen,
    setAgentCommandsDialogOpen,
    toolsDialogOpen,
    setToolsDialogOpen,
    layoutDialogOpen,
    setLayoutDialogOpen,
    modelsDialogProvider,
    setModelsDialogProvider,
    modelsDialogFocusProvider,
    setModelsDialogFocusProvider,
    setterMap,
  };
}
