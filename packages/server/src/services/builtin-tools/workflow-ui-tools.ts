import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAgentRuntime } from '../../adapters/agent-runtime.js';
import type { AgentRuntimeConfig } from '../../adapters/agent-runtime-types.js';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import { getThinkingRuntimeConfig } from '../llm-model-config.js';
import { getPluginTools, executePluginTool } from '../plugin.js';
import { createBuiltinPluginApi } from '../plugin-runtime-api.js';

type JsonRecord = Record<string, unknown>;

export const WORKFLOW_UI_COMPONENT_CATEGORY_DESCRIPTIONS = [
  { category: 'actions', description: 'Buttons, toggles, and direct action controls.' },
  { category: 'forms', description: 'Inputs, selectors, labels, uploaders, and editable fields.' },
  { category: 'layout', description: 'Containers, panels, separators, scroll areas, and structural primitives.' },
  { category: 'navigation', description: 'Tabs, breadcrumbs, menus, pagination, and navigation controls.' },
  { category: 'overlays', description: 'Dialogs, popovers, tooltips, sheets, drawers, and contextual menus.' },
  { category: 'feedback', description: 'Alerts, badges, loading states, progress, empty states, and status indicators.' },
  { category: 'data-display', description: 'Tables, charts, markdown, avatars, and structured display components.' },
  { category: 'media', description: 'Image, gallery, carousel, and media preview components.' },
  { category: 'utilities', description: 'Miscellaneous helpers exposed by the host UI bundle.' },
] as const;

const WORKFLOW_UI_COMPONENT_CATEGORIES: Array<{
  category: string;
  description: string;
  components: string[];
}> = [
  {
    category: 'actions',
    description: 'Buttons, toggles, and direct action controls.',
    components: [
      'Button', 'CopyButton', 'HoldToConfirm', 'Toggle', 'ToggleGroup', 'ToggleGroupItem',
    ],
  },
  {
    category: 'forms',
    description: 'Inputs, selectors, labels, uploaders, and editable fields.',
    components: [
      'Calendar', 'CalendarDayButton', 'Checkbox', 'ColorPicker', 'Field', 'FieldDescription',
      'FieldGroup', 'FieldLabel', 'FieldSeparator', 'FileUpload', 'FolderPicker', 'ImageCropper',
      'Input', 'InputGroup', 'InputGroupAddon', 'InputGroupButton', 'InputGroupInput',
      'InputGroupText', 'InputGroupTextarea', 'Label', 'SearchSelect', 'Select', 'SelectContent',
      'SelectGroup', 'SelectItem', 'SelectLabel', 'SelectTrigger', 'SelectValue', 'Slider',
      'Switch', 'Textarea', 'VoiceInput',
    ],
  },
  {
    category: 'layout',
    description: 'Containers, panels, separators, scroll areas, and structural primitives.',
    components: [
      'Accordion', 'AccordionContent', 'AccordionItem', 'AccordionTrigger', 'Card', 'CardContent',
      'CardDescription', 'CardFooter', 'CardHeader', 'CardTitle', 'Collapsible',
      'CollapsibleContent', 'CollapsibleTrigger', 'ResizableHandle', 'ResizablePanel',
      'ResizablePanelGroup', 'ScrollArea', 'ScrollBar', 'Separator', 'Sidebar', 'SidebarContent',
      'SidebarFooter', 'SidebarGroup', 'SidebarGroupAction', 'SidebarGroupContent',
      'SidebarGroupLabel', 'SidebarHeader', 'SidebarInset', 'SidebarInput', 'SidebarMenu',
      'SidebarMenuAction', 'SidebarMenuBadge', 'SidebarMenuButton', 'SidebarMenuItem',
      'SidebarMenuSkeleton', 'SidebarMenuSub', 'SidebarMenuSubButton', 'SidebarMenuSubItem',
      'SidebarProvider', 'SidebarRail', 'SidebarSeparator', 'SidebarTrigger',
      'SidebarContextProvider',
    ],
  },
  {
    category: 'navigation',
    description: 'Tabs, breadcrumbs, menus, pagination, and navigation controls.',
    components: [
      'Breadcrumb', 'BreadcrumbEllipsis', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbList',
      'BreadcrumbPage', 'BreadcrumbSeparator', 'ExpandableTabs', 'NavigationMenu',
      'NavigationMenuContent', 'NavigationMenuIndicator', 'NavigationMenuItem',
      'NavigationMenuLink', 'NavigationMenuList', 'NavigationMenuPositioner',
      'NavigationMenuTrigger', 'Pagination', 'PaginationContent', 'PaginationEllipsis',
      'PaginationItem', 'PaginationLink', 'PaginationNext', 'PaginationPrevious', 'Tabs',
      'TabsContent', 'TabsList', 'TabsTrigger',
    ],
  },
  {
    category: 'overlays',
    description: 'Dialogs, popovers, tooltips, sheets, drawers, and contextual menus.',
    components: [
      'AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent',
      'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogMedia',
      'AlertDialogOverlay', 'AlertDialogPortal', 'AlertDialogTitle', 'AlertDialogTrigger',
      'Command', 'CommandDialog', 'CommandEmpty', 'CommandGroup', 'CommandInput',
      'CommandItem', 'CommandList', 'CommandSeparator', 'CommandShortcut', 'ContextMenu',
      'ContextMenuCheckboxItem', 'ContextMenuContent', 'ContextMenuGroup', 'ContextMenuItem',
      'ContextMenuLabel', 'ContextMenuPortal', 'ContextMenuRadioGroup', 'ContextMenuRadioItem',
      'ContextMenuSeparator', 'ContextMenuShortcut', 'ContextMenuSub', 'ContextMenuSubContent',
      'ContextMenuSubTrigger', 'ContextMenuTrigger', 'Dialog', 'DialogContent',
      'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle', 'DialogTrigger',
      'Drawer', 'DrawerClose', 'DrawerContent', 'DrawerDescription', 'DrawerFooter',
      'DrawerHeader', 'DrawerOverlay', 'DrawerPortal', 'DrawerTitle', 'DrawerTrigger',
      'DropdownMenu', 'DropdownMenuCheckboxItem', 'DropdownMenuContent', 'DropdownMenuGroup',
      'DropdownMenuItem', 'DropdownMenuLabel', 'DropdownMenuPortal', 'DropdownMenuRadioGroup',
      'DropdownMenuRadioItem', 'DropdownMenuSeparator', 'DropdownMenuShortcut', 'DropdownMenuSub',
      'DropdownMenuSubContent', 'DropdownMenuSubTrigger', 'DropdownMenuTrigger', 'HoverCard',
      'HoverCardContent', 'HoverCardTrigger', 'Popover', 'PopoverContent', 'PopoverTrigger',
      'Sheet', 'SheetClose', 'SheetContent', 'SheetDescription', 'SheetFooter', 'SheetHeader',
      'SheetTitle', 'SheetTrigger', 'Tooltip', 'TooltipContent', 'TooltipProvider',
      'TooltipTrigger',
    ],
  },
  {
    category: 'feedback',
    description: 'Alerts, badges, loading states, progress, empty states, and status indicators.',
    components: [
      'Alert', 'AlertDescription', 'AlertTitle', 'Badge', 'BorderGlide', 'Empty', 'EmptyContent',
      'EmptyDescription', 'EmptyHeader', 'EmptyMedia', 'EmptyTitle', 'Loader', 'MorphingSpinner',
      'MovingBorder', 'Progress', 'Shimmer', 'ShinyBadge', 'Skeleton', 'Status',
      'StatusIndicator', 'StatusLabel',
    ],
  },
  {
    category: 'data-display',
    description: 'Tables, charts, markdown, avatars, and structured display components.',
    components: [
      'Avatar', 'AvatarFallback', 'AvatarGroup', 'AvatarImage', 'ChartContainer', 'ChartLegend',
      'ChartLegendContent', 'ChartStyle', 'ChartTooltip', 'ChartTooltipContent', 'Markdown',
      'MermaidPreview', 'Table', 'TableBody', 'TableCaption', 'TableCell', 'TableFooter',
      'TableHead', 'TableHeader', 'TableRow',
    ],
  },
  {
    category: 'media',
    description: 'Image, gallery, carousel, and media preview components.',
    components: [
      'Carousel', 'CarouselContent', 'CarouselItem', 'CarouselNext', 'CarouselPrevious',
      'ImagePickerDialog', 'ImagesBadge', 'MediaGallery', 'NodeMediaPreview',
    ],
  },
  {
    category: 'utilities',
    description: 'Miscellaneous helpers exposed by the host UI bundle.',
    components: [
      'CopyCode',
    ],
  },
];

function schema(properties: Record<string, unknown>, required?: string[]): Record<string, unknown> {
  return { type: 'object', properties, ...(required?.length ? { required } : {}) };
}

function asRecord(input: unknown): JsonRecord {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as JsonRecord : {};
}

function stringInput(input: JsonRecord, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const FALLBACK_AGENT_SPACES_UI_COMPONENTS = [
  'Accordion',
  'AccordionContent',
  'AccordionItem',
  'AccordionTrigger',
  'Alert',
  'AlertDescription',
  'AlertTitle',
  'Avatar',
  'AvatarFallback',
  'AvatarImage',
  'Badge',
  'Button',
  'Card',
  'CardContent',
  'CardDescription',
  'CardFooter',
  'CardHeader',
  'CardTitle',
  'Checkbox',
  'Collapsible',
  'CollapsibleContent',
  'CollapsibleTrigger',
  'Dialog',
  'DialogContent',
  'DialogDescription',
  'DialogFooter',
  'DialogHeader',
  'DialogTitle',
  'DialogTrigger',
  'Input',
  'Label',
  'Popover',
  'PopoverContent',
  'PopoverTrigger',
  'Progress',
  'ScrollArea',
  'ScrollBar',
  'Select',
  'SelectContent',
  'SelectGroup',
  'SelectItem',
  'SelectLabel',
  'SelectTrigger',
  'SelectValue',
  'Separator',
  'Skeleton',
  'Slider',
  'Switch',
  'Tabs',
  'TabsContent',
  'TabsList',
  'TabsTrigger',
  'Textarea',
  'Toggle',
  'ToggleGroup',
  'ToggleGroupItem',
  'Tooltip',
  'TooltipContent',
  'TooltipProvider',
  'TooltipTrigger',
];

function listAgentSpacesUiComponents(): string[] {
  const exportsPath = [
    resolve(process.cwd(), 'packages/web/src/lib/ui-exports.ts'),
    resolve(process.cwd(), '../web/src/lib/ui-exports.ts'),
  ].find((candidate) => existsSync(candidate));
  if (!exportsPath) return FALLBACK_AGENT_SPACES_UI_COMPONENTS;

  const source = readFileSync(exportsPath, 'utf-8');
  const names = new Set<string>();
  const exportPattern = /export\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g;
  for (const match of source.matchAll(exportPattern)) {
    const exports = match[1] ?? '';
    for (const item of exports.split(',')) {
      const name = item.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name && /^[A-Z][A-Za-z0-9]*$/.test(name)) names.add(name);
    }
  }

  return names.size ? [...names].sort((a, b) => a.localeCompare(b)) : FALLBACK_AGENT_SPACES_UI_COMPONENTS;
}

function listAgentSpacesUiComponentsByCategory(): Array<{ category: string; description: string; components: string[] }> {
  const components = listAgentSpacesUiComponents();
  const available = new Set(components);
  const categorized = new Set<string>();
  const groups = WORKFLOW_UI_COMPONENT_CATEGORIES
    .map((group) => {
      const groupComponents = group.components.filter((name) => available.has(name));
      groupComponents.forEach((name) => categorized.add(name));
      return { category: group.category, description: group.description, components: groupComponents };
    })
    .filter((group) => group.components.length > 0);

  const uncategorized = components.filter((name) => !categorized.has(name));
  if (uncategorized.length) {
    groups.push({
      category: 'uncategorized',
      description: 'Newly exported host UI components that have not been assigned to a category yet.',
      components: uncategorized,
    });
  }

  return groups;
}

export interface WorkflowUiToolContext {
  enabledPlugins: string[];
}

// ---- Built-in virtual plugin ----

const BUILTIN_PLUGIN_ID = '@agent-spaces/builtin';

interface BuiltinToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  outputs: unknown[];
  execute: (args: Record<string, any>) => Promise<any>;
}

function normalizeAgentPermissionMode(value: unknown): AgentRuntimeConfig['permissionMode'] {
  switch (value) {
    case 'default':
    case 'acceptEdits':
    case 'bypassPermissions':
    case 'plan':
    case 'dontAsk':
    case 'auto':
      return value;
    default:
      return 'dontAsk';
  }
}

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
}

const BUILTIN_TOOLS: BuiltinToolDefinition[] = [
  {
    name: 'list_agent_presets',
    description: '列出可用的 Agent preset（模型配置），返回 id/name/runtimeKind/modelId 供 agent_run 使用。',
    input_schema: { type: 'object', properties: {} },
    outputs: [{ key: 'presets', type: 'array', description: 'Agent preset 列表' }],
    execute: async () => {
      const agentService = await import('../agent.js');
      const presets = agentService.listPresets('');
      return {
        presets: presets.map(p => ({
          id: p.id,
          name: p.name,
          runtimeKind: p.runtimeKind,
          modelProvider: p.modelProvider,
          modelId: p.modelId,
          description: p.description,
        })),
      };
    },
  },
  {
    name: 'agent_run',
    description: '运行 AI Agent 执行任务。支持指定 agent preset（通过 list_agent_presets 获取）、prompt、systemPrompt、工作目录和权限模式。',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '给 Agent 的任务描述（必填）' },
        agentConfigId: { type: 'string', description: 'Agent preset ID（从 list_agent_presets 获取可选值）' },
        systemPrompt: { type: 'string', description: '系统提示词' },
        cwd: { type: 'string', description: '工作目录' },
        permissionMode: {
          type: 'string',
          enum: ['default', 'dontAsk', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
          description: '权限模式，默认 dontAsk',
        },
        extraInstructions: { type: 'string', description: '额外指令' },
      },
      required: ['prompt'],
    },
    outputs: [
      { key: 'result', type: 'string', description: 'Agent 执行结果' },
    ],
    execute: async (args) => {
      const agentService = await import('../agent.js');
      const prompt = String(args.prompt || '').trim();
      if (!prompt) throw new Error('prompt is required');

      const agentConfigId = args.agentConfigId as string | undefined;
      const presets = agentService.listPresets('');
      const preset = agentConfigId
        ? presets.find(p => p.id === agentConfigId)
        : undefined;

      if (agentConfigId && !preset) throw new Error(`Agent preset not found: ${agentConfigId}`);

      const permissionMode = normalizeAgentPermissionMode(args.permissionMode);

      // Build runtime config from preset or use defaults
      const config: AgentRuntimeConfig = preset
        ? {
            kind: preset.runtimeKind as AgentRuntimeConfig['kind'],
            provider: preset.modelProvider as AgentRuntimeConfig['provider'],
            model: preset.modelId,
            apiKey: preset.apiKey,
            baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
            adapterBaseURL: preset.apiBase,
            permissionMode,
            ...getThinkingRuntimeConfig(preset),
          }
        : { permissionMode };

      const runtime = createAgentRuntime(config);

      const systemPrompt = typeof args.systemPrompt === 'string' ? args.systemPrompt.trim() : undefined;
      const extraInstructions = typeof args.extraInstructions === 'string' ? args.extraInstructions.trim() : '';
      const fullPrompt = [systemPrompt, extraInstructions, prompt].filter(Boolean).join('\n\n');

      const workingDir = typeof args.cwd === 'string' && args.cwd.trim()
        ? args.cwd.trim()
        : preset
          ? agentService.resolveWorkingDir('', preset)
          : process.cwd();

      const result = await runtime.execute(fullPrompt, workingDir, {
        maxTurns: 50,
        systemPrompt: preset?.systemPrompt,
        outputStyle: preset?.outputStyle,
        userPrompt: prompt,
      });

      if (!result.success) throw new Error(result.summary || 'Agent execution failed');

      return {
        content: result.output?.join('\n').trim() || result.summary,
        summary: result.summary,
        usage: result.usage,
      };
    },
  },
];

// ---- Workflow UI function tools ----

export function createWorkflowUiFunctionTools(ctx: WorkflowUiToolContext): AgentFunctionTool[] {
  return [
    {
      name: 'list_agent_spaces_ui_components',
      description: 'List React UI components exposed on window.AgentSpacesUI for Workflow UI projects by category. Lucide React icons are also exposed on window.AgentSpacesUI by their standard icon names.',
      inputSchema: schema({
        category: {
          type: 'string',
          enum: [...WORKFLOW_UI_COMPONENT_CATEGORY_DESCRIPTIONS.map((item) => item.category), 'uncategorized'],
          description: 'Optional component category to list. Omit to return all categories.',
        },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const category = stringInput(record, 'category')?.toLowerCase();
        const groups = listAgentSpacesUiComponentsByCategory();
        const selectedGroups = category
          ? groups.filter((group) => group.category.toLowerCase() === category)
          : groups;
        if (category && selectedGroups.length === 0) {
          return {
            success: false,
            message: `Unknown component category "${category}".`,
            categories: groups.map((group) => group.category),
          };
        }
        const components = selectedGroups.flatMap((group) => group.components);

        return {
          success: true,
          total: components.length,
          selectedCategory: category ?? 'all',
          categories: groups.map((group) => ({
            category: group.category,
            description: group.description,
            count: group.components.length,
          })),
          groups: selectedGroups,
          usage: {
            react: 'const { Button, Card, CardContent, Search, Loader2 } = window.AgentSpacesUI;',
            html: 'window.AgentSpacesUI is available, but React components are primarily intended for React mode.',
          },
          components,
        };
      },
    },
    {
      name: 'list_plugin_tools',
      description: '列出当前 UI 项目已启用插件注册的所有 tools，返回轻量摘要（name/description）。需要执行某个 tool 时，先调用 get_plugin_tool_detail 查看参数 schema。',
      inputSchema: schema({
        pluginId: { type: 'string', description: '可选，按插件 ID 筛选' },
        keyword: { type: 'string', description: '可选，模糊搜索 tool 名称或描述' },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const filterPluginId = stringInput(record, 'pluginId');
        const keyword = stringInput(record, 'keyword')?.toLowerCase();
        const pluginIds = filterPluginId ? [filterPluginId] : ctx.enabledPlugins;
        const results: Array<{ pluginId: string; toolName: string; description: string }> = [];

        const shouldIncludeBuiltin = !filterPluginId || filterPluginId === BUILTIN_PLUGIN_ID;

        for (const pluginId of pluginIds) {
          try {
            const pluginTools = getPluginTools(pluginId);
            for (const tool of pluginTools) {
              if (keyword) {
                const text = `${tool.name} ${tool.description}`.toLowerCase();
                if (!text.includes(keyword)) continue;
              }
              results.push({ pluginId, toolName: tool.name, description: tool.description });
            }
          } catch { /* plugin not found, skip */ }
        }

        if (shouldIncludeBuiltin) {
          for (const tool of BUILTIN_TOOLS) {
            if (keyword) {
              const text = `${tool.name} ${tool.description}`.toLowerCase();
              if (!text.includes(keyword)) continue;
            }
            results.push({ pluginId: BUILTIN_PLUGIN_ID, toolName: tool.name, description: tool.description });
          }
        }

        return { success: true, total: results.length, tools: results };
      },
    },
    {
      name: 'get_plugin_tool_detail',
      description: '查看指定插件 tool 的完整 input_schema 和描述。执行 tool 前建议先调用此工具查看参数要求。',
      inputSchema: schema({
        pluginId: { type: 'string', description: '插件 ID' },
        toolName: { type: 'string', description: 'Tool 名称' },
      }, ['pluginId', 'toolName']),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const pluginId = stringInput(record, 'pluginId');
        const toolName = stringInput(record, 'toolName');
        if (!pluginId || !toolName) {
          return { success: false, message: 'pluginId and toolName are required' };
        }
        if (pluginId === BUILTIN_PLUGIN_ID) {
          const tool = BUILTIN_TOOLS.find(t => t.name === toolName);
          if (!tool) return { success: false, message: `Tool "${toolName}" not found in builtin tools` };
          return { success: true, name: tool.name, description: tool.description, input_schema: tool.input_schema, outputs: tool.outputs };
        }
        try {
          const pluginTools = getPluginTools(pluginId);
          const tool = pluginTools.find(t => t.name === toolName);
          if (!tool) {
            return { success: false, message: `Tool "${toolName}" not found in plugin "${pluginId}"` };
          }
          return {
            success: true,
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema,
            outputs: tool.outputs,
          };
        } catch (error: any) {
          return { success: false, message: error.message };
        }
      },
    },
    {
      name: 'execute_plugin_tool',
      description: '执行指定插件的 tool 并返回结果。执行前必须先调用 get_plugin_tool_detail 确认参数格式和返回结构。',
      inputSchema: schema({
        pluginId: { type: 'string', description: '插件 ID' },
        toolName: { type: 'string', description: 'Tool 名称' },
        args: { type: 'object', description: 'Tool 参数' },
      }, ['pluginId', 'toolName']),
      execute: async (input) => {
        const record = asRecord(input);
        const pluginId = stringInput(record, 'pluginId');
        const toolName = stringInput(record, 'toolName');
        if (!pluginId || !toolName) {
          return { success: false, message: 'pluginId and toolName are required' };
        }
        const args = (record.args && typeof record.args === 'object' && !Array.isArray(record.args))
          ? record.args as Record<string, any>
          : {};
        if (pluginId === BUILTIN_PLUGIN_ID) {
          const tool = BUILTIN_TOOLS.find(t => t.name === toolName);
          if (!tool) return { success: false, message: `Tool "${toolName}" not found in builtin tools` };
          try {
            const result = await tool.execute(args);
            return { success: true, result };
          } catch (error: any) {
            return { success: false, message: error.message };
          }
        }
        try {
          const result = await executePluginTool(pluginId, toolName, args, createBuiltinPluginApi());
          return { success: true, result };
        } catch (error: any) {
          return { success: false, message: error.message };
        }
      },
    },
  ];
}
