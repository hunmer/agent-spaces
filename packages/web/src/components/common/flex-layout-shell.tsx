"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Actions,
  Action,
  IJsonModel,
  ILayoutApi,
  ITabRenderValues,
  Layout,
  Model,
  TabNode,
} from "flexlayout-react";

// combined.css 包含 flexlayout-react 全部样式 + 8 个主题（light/dark/gray/rounded/
// underline/alpha_light/alpha_dark/alpha_rounded）。切换主题 = 给布局根元素加
// `flexlayout__theme_<key>` className，由该前缀作用域对应的样式块接管外观。
// 全局 layout.tsx 已 import light.css（无前缀、作为兜底），此处 combined 的前缀规则
// 特异性更高，加上对应 className 后会覆盖兜底，实现主题切换。
import "flexlayout-react/style/combined.css";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LayoutManagerDialog } from "@/components/sidebar/layout-manager-dialog";
import { loadLayoutTemplates } from "@/lib/layout-templates";
import {
  LayoutTemplateIcon,
  Plus,
  PictureInPicture2,
  RotateCcw,
  Palette,
} from "lucide-react";

export interface FlexLayoutTheme {
  key: string;
  label: string;
}

export interface AddableComponent {
  /** tab 的 component 字段，对应 components 注册表中的 key */
  key: string;
  /** 工具栏下拉显示的名称；同时作为新 tab 的默认 name */
  name: string;
  /** 工具栏下拉与 tab header 显示的图标（可选） */
  icon?: React.ReactNode;
  /** 创建新 tab 时使用的名称，缺省取 name */
  defaultName?: string;
}

export interface FlexLayoutShellProps {
  /** 实例隔离 key，会派生出 layout/templates/theme 三个 localStorage 子 key */
  storageKey: string;
  /**
   * 组件工厂注册表：tab 的 component 字段 -> 渲染函数。
   * 受控模式下若传入 `factory` prop，则以 `factory` 为准，本字段可省略。
   */
  components?: Record<string, (node: TabNode) => React.ReactNode>;
  /** 首次加载（localStorage 无数据时）使用的默认布局。受控模式下可省略 */
  defaultLayout?: IJsonModel;
  /** 可通过工具栏"添加 Tab"打开的页面列表 */
  addableComponents?: AddableComponent[];
  /** 可切换的样式列表，默认提供 8 个内置主题 */
  themes?: FlexLayoutTheme[];
  /** 默认主题 key，默认 "light" */
  defaultTheme?: string;
  /** 是否显示工具栏，默认 true */
  showToolbar?: boolean;
  /** 工具栏标题 */
  title?: string;
  /** 附加到根容器的 className */
  className?: string;
  /** popout 浮动窗口顶层 className，用于让浮窗跟随主题，默认按当前 theme 派生 */
  popoutClassName?: string;
  /**
   * 预设列表存储 key，默认由 storageKey 派生（`:templates`）。
   * 受控场景可显式传入以复用外部既有的预设数据源（如 workspace 侧边栏）。
   */
  templatesStorageKey?: string;

  // ---- 工具栏细粒度开关（默认全开，受控场景可按需关闭避免与外部入口重复）----
  /** 显示「添加 Tab」下拉，默认 true */
  showAddTab?: boolean;
  /** 显示「添加浮窗」按钮，默认 true */
  showAddFloat?: boolean;
  /** 显示「预设管理」按钮，默认 true */
  showPresets?: boolean;
  /** 显示「重置布局」按钮，默认 true */
  showReset?: boolean;
  /** 显示「主题切换」下拉，默认 true */
  showThemeSwitch?: boolean;

  // ---- 受控模式 props（传入 model 即进入受控模式，FlexLayoutShell 不再自管理 model）----
  /** 受控 model；传入后由外部负责创建/更新，预设的 apply/reset 会回调 `onApplyLayout`/`onResetLayout` */
  model?: Model;
  /** 受控模式下的 factory（覆盖 components 注册表逻辑） */
  factory?: (node: TabNode) => React.ReactNode;
  /** 受控模式下的 tab header 渲染钩子 */
  onRenderTab?: (node: TabNode, renderValues: ITabRenderValues) => void;
  /** 受控模式下的 model change 回调（用于持久化等）；非受控时内部默认持久化 */
  onModelChangeExternal?: (model: Model, action: Action) => void;
  /** 受控模式下应用预设时回调（外部 setModel） */
  onApplyLayout?: (json: IJsonModel) => void;
  /** 受控模式下重置布局时回调（外部 setModel(defaultLayout)） */
  onResetLayout?: () => void;
}

const DEFAULT_THEMES: FlexLayoutTheme[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "gray", label: "Gray" },
  { key: "rounded", label: "Rounded" },
  { key: "underline", label: "Underline" },
  { key: "alpha_light", label: "Alpha Light" },
  { key: "alpha_dark", label: "Alpha Dark" },
  { key: "alpha_rounded", label: "Alpha Rounded" },
];

const LAYOUT_SUFFIX = ":layout";
const TEMPLATES_SUFFIX = ":templates";
const THEME_SUFFIX = ":theme";

/**
 * flexlayout-react 通用自由布局模板。
 *
 * - 多布局预设：保存 / 删除 / 应用（复用 LayoutManagerDialog + layout-templates.ts）
 * - 保留 float / maximize / close 图标按钮（flexlayout 默认渲染，root.config.enableFloat=true 启用浮窗）
 * - new tab 注入：通过 `components` + `addableComponents` 注册可打开页面
 * - 多样式切换：内置 5 个主题，容器 className 隔离
 * - 多实例隔离：基于 `storageKey` 派生三个 localStorage 子 key
 */
export function FlexLayoutShell({
  storageKey,
  components,
  defaultLayout,
  addableComponents = [],
  themes = DEFAULT_THEMES,
  defaultTheme = "light",
  showToolbar = true,
  title,
  className,
  popoutClassName,
  templatesStorageKey: templatesStorageKeyProp,
  showAddTab = true,
  showAddFloat = true,
  showPresets = true,
  showReset = true,
  showThemeSwitch = true,
  model: controlledModel,
  factory: controlledFactory,
  onRenderTab: controlledOnRenderTab,
  onModelChangeExternal,
  onApplyLayout,
  onResetLayout,
}: FlexLayoutShellProps) {
  // 是否受控：外部传入 model 即进入受控模式
  const isControlled = controlledModel !== undefined;

  const layoutStorageKey = useMemo(() => storageKey + LAYOUT_SUFFIX, [storageKey]);
  const templatesStorageKey = useMemo(
    () => templatesStorageKeyProp ?? storageKey + TEMPLATES_SUFFIX,
    [templatesStorageKeyProp, storageKey],
  );
  const themeStorageKey = useMemo(() => storageKey + THEME_SUFFIX, [storageKey]);

  // 非受控模式：内部自管理 model（受控模式下不会使用 internalModel，初始化器仅作占位）
  const [internalModel, setInternalModel] = useState<Model>(() => {
    // 受控模式不消费 defaultLayout，返回空 model 占位避免抛错
    if (isControlled || !defaultLayout) {
      return Model.fromJson({ global: {}, layout: { type: "row", children: [] } });
    }
    try {
      const saved = localStorage.getItem(layoutStorageKey);
      if (saved) return Model.fromJson(JSON.parse(saved));
    } catch {
      /* ignore corrupt data */
    }
    return Model.fromJson(defaultLayout);
  });

  const model = isControlled ? controlledModel! : internalModel;

  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem(themeStorageKey);
    return saved && themes.some((t) => t.key === saved) ? saved : defaultTheme;
  });

  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  // 触发 LayoutManagerDialog 内部模板列表刷新
  const [templatesVersion, setTemplatesVersion] = useState(0);

  const layoutRef = useRef<ILayoutApi | null>(null);
  const latestModel = useRef<Model>(model);
  useEffect(() => {
    latestModel.current = model;
  }, [model]);

  // 持久化布局：受控模式委派给外部回调，非受控模式默认持久化到 localStorage
  const onModelChange = useCallback(
    (_model: Model, action: Action) => {
      if (onModelChangeExternal) {
        onModelChangeExternal(_model, action);
        return;
      }
      try {
        localStorage.setItem(layoutStorageKey, JSON.stringify(_model.toJson()));
      } catch {
        /* quota exceeded — ignore */
      }
    },
    [layoutStorageKey, onModelChangeExternal],
  );

  // 浮窗跟随主题：未显式传入时，按当前 theme 派生 className
  const resolvedPopoutClassName = popoutClassName ?? `flexlayout__theme_${theme}`;

  // 切换主题并持久化；新打开的 popout 会通过 popoutClassName 跟随当前主题
  const changeTheme = useCallback(
    (key: string) => {
      setTheme(key);
      try {
        localStorage.setItem(themeStorageKey, key);
      } catch {
        /* ignore */
      }
    },
    [themeStorageKey],
  );

  // 应用预设：受控模式回调外部 setModel，非受控模式更新内部 model
  const handleApplyLayout = useCallback(
    (json: IJsonModel) => {
      if (onApplyLayout) {
        onApplyLayout(json);
      } else {
        setInternalModel(Model.fromJson(json));
      }
    },
    [onApplyLayout],
  );

  // 重置为默认布局
  const handleResetLayout = useCallback(() => {
    if (onResetLayout) {
      onResetLayout();
    } else if (defaultLayout) {
      setInternalModel(Model.fromJson(defaultLayout));
      try {
        localStorage.setItem(layoutStorageKey, JSON.stringify(defaultLayout));
      } catch {
        /* ignore */
      }
    }
  }, [defaultLayout, layoutStorageKey, onResetLayout]);

  const getCurrentLayout = useCallback(
    () => latestModel.current?.toJson() as IJsonModel | null,
    [],
  );

  // 添加 tab 到当前激活的 tabset
  const handleAddTab = useCallback((comp: AddableComponent) => {
    layoutRef.current?.addTabToActiveTabSet({
      component: comp.key,
      name: comp.defaultName ?? comp.name,
    });
  }, []);

  // 添加浮动窗口（参考 flexlayout demo 的 Actions.createPopout）
  const handleAddFloat = useCallback(() => {
    const api = layoutRef.current;
    const rootDiv = api?.getRootDiv();
    const first = addableComponents[0];
    if (!api || !rootDiv || !first) return;
    const rect = rootDiv.getBoundingClientRect();
    const width = Math.round(rect.width / 3);
    const height = Math.round(rect.height / 3);
    const x = Math.round((rect.width - width) / 2);
    const y = Math.round((rect.height - height) / 2);
    latestModel.current.doAction(
      Actions.createPopout(
        {
          type: "row",
          children: [
            {
              type: "tabset",
              children: [{ component: first.key, name: first.name }],
            },
          ],
        },
        { x, y, width, height },
        "float",
      ),
    );
  }, [addableComponents]);

  // factory：受控模式优先用外部传入，否则用 components 注册表
  const factory = useCallback(
    (node: TabNode) => {
      if (controlledFactory) return controlledFactory(node);
      const comp = node.getComponent();
      if (comp && components && Object.prototype.hasOwnProperty.call(components, comp)) {
        return components[comp](node);
      }
      return (
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          未知组件: {comp ?? "(空)"}
        </div>
      );
    },
    [components, controlledFactory],
  );

  const onAction = useCallback((action: Action) => action, []);

  // tab header 渲染：若该 component 注册了图标，则显示在标题前
  const iconByComponent = useMemo(() => {
    const m: Record<string, React.ReactNode> = {};
    addableComponents.forEach((c) => {
      if (c.icon) m[c.key] = c.icon;
    });
    return m;
  }, [addableComponents]);

  const internalOnRenderTab = useCallback(
    (node: TabNode, renderValues: ITabRenderValues) => {
      const comp = node.getComponent();
      const icon = comp ? iconByComponent[comp] : undefined;
      if (icon && renderValues.leading == null) {
        renderValues.leading = <span className="flex items-center">{icon}</span>;
      }
    },
    [iconByComponent],
  );

  // onRenderTab：受控模式优先用外部传入，否则用内部图标渲染
  const onRenderTab = controlledOnRenderTab ?? internalOnRenderTab;

  // 对话框关闭后刷新本地 templatesVersion（删除/重命名后工具栏无需感知，此处仅为将来扩展）
  useEffect(() => {
    if (!layoutDialogOpen) setTemplatesVersion((v) => v + 1);
  }, [layoutDialogOpen]);

  // 预览当前预设数量（工具栏显示用）—— 只读，无副作用
  const templateCount = useMemo(() => {
    void templatesVersion; // 依赖刷新
    return loadLayoutTemplates(templatesStorageKey).length;
  }, [templatesStorageKey, templatesVersion]);

  const themeClass = `flexlayout__theme_${theme}`;

  return (
    <div
      className={`flex h-full w-full flex-col ${themeClass} ${className ?? ""}`}
    >
      {showToolbar && (
        <div className="flex items-center gap-1 border-b bg-background px-2 py-1.5">
          {title && (
            <span className="mr-2 text-sm font-medium">{title}</span>
          )}

          {showAddTab && addableComponents.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" title="添加 Tab">
                    <Plus className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                {addableComponents.map((c) => (
                  <DropdownMenuItem
                    key={c.key}
                    onClick={() => handleAddTab(c)}
                    className="gap-2"
                  >
                    {c.icon}
                    <span>{c.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {showAddFloat && addableComponents.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddFloat}
              title="添加浮动窗口"
            >
              <PictureInPicture2 className="size-4" />
            </Button>
          )}

          {(showPresets || showReset) && (
            <div className="mx-1 h-5 w-px bg-border" />
          )}

          {showPresets && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLayoutDialogOpen(true)}
              title="布局预设管理"
              className="gap-1.5"
            >
              <LayoutTemplateIcon className="size-4" />
              <span className="text-xs">预设{templateCount > 0 ? ` (${templateCount})` : ""}</span>
            </Button>
          )}

          {showReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetLayout}
              title="重置为默认布局"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}

          <div className="flex-1" />

          {showThemeSwitch && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Palette className="size-3.5" />
              <select
                value={theme}
                onChange={(e) => changeTheme(e.target.value)}
                className="h-7 rounded-md border bg-background px-1.5 text-xs outline-none"
                aria-label="切换样式"
              >
                {themes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <Layout
          ref={layoutRef}
          model={model}
          factory={factory}
          onAction={onAction}
          onModelChange={onModelChange}
          onRenderTab={onRenderTab}
          popoutClassName={resolvedPopoutClassName}
        />
      </div>

      <LayoutManagerDialog
        open={layoutDialogOpen}
        onOpenChange={setLayoutDialogOpen}
        templatesStorageKey={templatesStorageKey}
        getCurrentLayout={getCurrentLayout}
        onApply={handleApplyLayout}
        onReset={handleResetLayout}
      />
    </div>
  );
}
