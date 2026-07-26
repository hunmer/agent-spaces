import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentConfig, Attachment } from '@agent-spaces/shared';
import { createAgentRuntime } from '../../adapters/agent-runtime.js';
import type { AgentRuntimeConfig } from '../../adapters/agent-runtime-types.js';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import { getThinkingRuntimeConfig } from '../llm-model-config.js';
import { getPluginTools, executePluginTool } from '../plugin.js';
import { createBuiltinPluginApi } from '../plugin-runtime-api.js';
import * as kbStore from '../../storage/knowledge-base-store.js';
import * as llmStore from '../../storage/llm-store.js';
import * as miniAppStore from '../../storage/mini-app-store.js';
import * as kbService from '../knowledge-base.js';
import { getWorkflowExecutionManager } from './workflow-exec-tools.js';
import { registerRuntime, unregisterRuntime } from '../mini-app-tasks.js';

type JsonRecord = Record<string, unknown>;
type MiniAppAgentPreset = AgentConfig;

export const MINI_APP_COMPONENT_CATEGORY_DESCRIPTIONS = [
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

const MINI_APP_COMPONENT_CATEGORIES: Array<{
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

const DEFAULT_WORKFLOW_SYNC_TIMEOUT_MS = 120_000;
const MAX_WORKFLOW_SYNC_TIMEOUT_MS = 600_000;
const WORKFLOW_POLL_INTERVAL_MS = 500;

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
  const groups = MINI_APP_COMPONENT_CATEGORIES
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

export interface MiniAppToolContext {
  enabledPlugins: string[];
}

// ---- Built-in virtual plugin ----

export const BUILTIN_PLUGIN_ID = '@agent-spaces/builtin';

interface BuiltinToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  outputs: unknown[];
  execute: (args: Record<string, any>, ctx?: { workspaceId?: string; taskId?: string }) => Promise<any>;
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

function normalizeMiniAppRuntimeKind(value: unknown): AgentConfig['runtimeKind'] {
  return value === 'open-agent-sdk'
    || value === 'claude-code'
    || value === 'codex'
    || value === 'grok'
    || value === 'gemini-cli'
    || value === 'langchain'
    || value === 'hermes'
    || value === 'pi'
    ? value
    : 'langchain';
}

function requireWorkspaceId(ctx: { workspaceId?: string } | undefined, args?: Record<string, any>): string {
  const workspaceId = typeof ctx?.workspaceId === 'string' && ctx.workspaceId.trim()
    ? ctx.workspaceId.trim()
    : typeof args?.workspaceId === 'string'
      ? args.workspaceId.trim()
      : '';
  if (!workspaceId) throw new Error('workspaceId is required');
  return workspaceId;
}

function pickEmbeddingModelId(): string | null {
  const providers = llmStore.listProviders();
  const providerNames = new Set(
    providers
      .filter((provider) => provider.apiBase && provider.apiKey)
      .map((provider) => provider.name),
  );
  const model = llmStore
    .listModels()
    .find((item) => item.embedding && item.modelId && providerNames.has(item.provider));
  return model?.id ?? null;
}

function ensureKnowledgeBase(workspaceId: string, kbId: string): void {
  const existing = kbStore.getKb(workspaceId, kbId);
  if (existing) {
    if (!existing.embeddingModelId) {
      const embeddingModelId = pickEmbeddingModelId();
      if (embeddingModelId) kbStore.updateKb(workspaceId, kbId, { embeddingModelId });
    }
    return;
  }

  const kb = kbStore.createKb(workspaceId, {
    id: kbId,
    name: 'Copywriting Knowledge Base',
    description: 'Auto-created for copywriting mini-app.',
  });
  const embeddingModelId = pickEmbeddingModelId();
  kbStore.updateKb(workspaceId, kb.id, {
    name: 'Copywriting Knowledge Base',
    description: 'Auto-created for copywriting mini-app.',
    embeddingModelId,
  });
}

async function addTextToKnowledgeBase(workspaceId: string, args: Record<string, any>) {
  const kbId = String(args.knowledgeBase || args.kbId || '').trim();
  const title = String(args.title || args.fileName || 'copywriting').trim();
  const text = String(args.text || args.content || '').trim();
  if (!kbId) throw new Error('knowledgeBase is required');
  if (!text) throw new Error('text is required');

  ensureKnowledgeBase(workspaceId, kbId);
  const fileName = `${title || 'copywriting'}.md`;
  const buffer = Buffer.from(`# ${title || 'copywriting'}\n\n${text}\n`, 'utf-8');
  const file = await kbService.addFileToKnowledgeBase(workspaceId, kbId, {
    sourceType: 'upload',
    sourceRef: fileName,
    fileName,
    buffer,
  });
  return {
    fileId: file.id,
    fileName: file.fileName,
    chunkCount: file.chunkCount,
    status: file.indexStatus,
    error: file.indexError,
  };
}

function workflowStringInput(args: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function workflowObjectInput(args: Record<string, any>, key: string): JsonRecord {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function workflowNumberInput(args: Record<string, any>, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatWorkflowSteps(log: any, nodes: Array<{ id: string; type: string }> = [], nodeId?: string) {
  const steps = Array.isArray(log?.steps) ? log.steps : [];
  const nodeTypes = new Map(nodes.map((node) => [node.id, node.type]));
  return steps
    .filter((step: any) => !nodeId || step.nodeId === nodeId)
    .map((step: any) => ({
      nodeId: step.nodeId,
      nodeType: nodeTypes.get(step.nodeId),
      nodeLabel: step.nodeLabel,
      status: step.status,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      duration: step.finishedAt ? step.finishedAt - step.startedAt : undefined,
      input: step.input,
      output: step.output,
      error: step.error,
      logs: step.logs,
    }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWorkflowSyncForMiniApp(args: Record<string, any>) {
  const manager = getWorkflowExecutionManager();
  if (!manager) throw new Error('Workflow execution manager is not initialized');

  const workflowId = workflowStringInput(args, 'workflow_id', 'workflowId');
  if (!workflowId) throw new Error('workflow_id is required');

  const workflowService = await import('../workflow.js');
  const workflow = workflowService.getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

  const result = await manager.execute({
    workflowId,
    input: workflowObjectInput(args, 'input'),
    startNodeId: workflowStringInput(args, 'start_node_id', 'startNodeId') || undefined,
    faultTolerance: workflowStringInput(args, 'fault_tolerance', 'faultTolerance') === 'stop' ? 'stop' : 'ignore',
  }, 'mini-app');

  const timeoutMs = Math.min(
    MAX_WORKFLOW_SYNC_TIMEOUT_MS,
    Math.max(WORKFLOW_POLL_INTERVAL_MS, workflowNumberInput(args, 'max_wait_ms', DEFAULT_WORKFLOW_SYNC_TIMEOUT_MS)),
  );
  const startedAt = Date.now();
  let log: any = null;
  let status = result.status;

  while (Date.now() - startedAt < timeoutMs) {
    const recovery = manager.getExecutionRecovery({ workflowId, executionId: result.executionId }, 'mini-app');
    log = recovery.execution?.log ?? workflowService.getExecutionLog(workflowId, result.executionId);
    status = log?.status ?? recovery.execution?.status ?? status;
    if (status !== 'running') break;
    await sleep(WORKFLOW_POLL_INTERVAL_MS);
  }

  log = log ?? workflowService.getExecutionLog(workflowId, result.executionId);
  status = log?.status ?? status;
  const timedOut = status === 'running';

  return {
    workflow_id: workflowId,
    executionId: result.executionId,
    status,
    timedOut,
    steps: log ? formatWorkflowSteps(log, workflow.nodes, workflowStringInput(args, 'node_id', 'nodeId') || undefined) : [],
  };
}

async function listWorkflowsForMiniApp(args: Record<string, any>) {
  const workflowService = await import('../workflow.js');
  const page = Math.max(1, Math.floor(workflowNumberInput(args, 'page', 1)));
  const pageSize = Math.min(50, Math.max(1, Math.floor(workflowNumberInput(args, 'page_size', 20))));
  const workflows = workflowService.listWorkflows().sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const total = workflows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  return {
    page: currentPage,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    workflows: workflows
      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
      .map((workflow: any) => ({
        workflow_id: workflow.id,
        title: workflow.name,
        description: workflow.description ?? '',
        updatedAt: workflow.updatedAt,
        nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [],
      })),
  };
}

const BUILTIN_TOOLS: BuiltinToolDefinition[] = [
  {
    name: 'execute_miniapp_tool',
    description: 'Execute a tool exposed by a mini-app src/api.js and return its result.',
    input_schema: {
      type: 'object',
      properties: {
        miniapp_id: { type: 'string', description: 'Mini-app id.' },
        toolName: { type: 'string', description: 'Tool name from the mini-app src/tools.js.' },
        params: { type: 'object', description: 'Tool parameters.' },
      },
      required: ['miniapp_id', 'toolName'],
    },
    outputs: [{ key: 'result', type: 'object' }],
    execute: async (args) => {
      const miniappId = String(args.miniapp_id || args.miniAppId || '').trim();
      const toolName = String(args.toolName || args.tool_name || '').trim();
      if (!miniappId || !toolName) throw new Error('miniapp_id and toolName are required');
      const project = miniAppStore.getProject(miniappId);
      if (!project) throw new Error(`Mini-app not found: ${miniappId}`);
      const miniAppAgent = await import('../mini-app-agent.js');
      const specs = miniAppAgent.getRegisteredMiniAppTools(miniappId);
      if (!specs[toolName]) throw new Error(`Tool "${toolName}" not found in mini-app "${miniappId}"`);
      const handler = miniAppAgent.loadApiJs(miniappId)[toolName];
      if (!handler) throw new Error(`API handler "${toolName}" not found in mini-app "${miniappId}"`);
      const params = args.params && typeof args.params === 'object' && !Array.isArray(args.params)
        ? args.params
        : args.pararms && typeof args.pararms === 'object' && !Array.isArray(args.pararms)
          ? args.pararms
          : {};
      return handler(params, miniAppAgent.makeApiCtx(miniappId));
    },
  },
  {
    name: 'list_workflows',
    description: 'List saved workflows for mini-app workflow selection.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number, starting from 1. Defaults to 1.' },
        page_size: { type: 'number', description: 'Page size. Defaults to 20, max 50.' },
      },
    },
    outputs: [
      { key: 'workflows', type: 'array' },
      { key: 'total', type: 'number' },
    ],
    execute: async (args) => listWorkflowsForMiniApp(args),
  },
  {
    name: 'list_agent_presets',
    description: '列出可用的 Agent preset（模型配置），返回 id/name/runtimeKind/modelId 供 agent_run 使用。',
    input_schema: { type: 'object', properties: {} },
    outputs: [{ key: 'presets', type: 'array', description: 'Agent preset 列表' }],
    execute: async (args, ctx) => {
      const agentService = await import('../agent.js');
      const presets = listMiniAppAgentPresets(ctx?.workspaceId ?? '', agentService.listPresets(''));
      return {
        presets: presets.map(p => ({
          id: p.id,
          name: p.name,
          runtimeKind: p.runtimeKind,
          modelProvider: p.modelProvider,
          modelId: p.modelId,
          description: p.description,
          systemPrompt: p.systemPrompt || '',
          outputStyle: p.outputStyle || '',
        })),
      };
    },
  },
  {
    name: 'agent_run',
    description: '运行 AI Agent 执行任务。优先先明确 Agent 名称、注释/描述和任务提示词，再指定 agent preset（通过 list_agent_presets 获取）、工作目录和权限模式。支持 images 参数传入图片 base64 data URL 给视觉模型（需 agent runtime 支持，如 Claude/OpenAI-4o/Gemini）。',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '给 Agent 的任务描述（必填）' },
        agentConfigId: { type: 'string', description: 'Agent preset ID（必填，从 list_agent_presets 获取可选值）' },
        cwd: { type: 'string', description: '工作目录' },
        permissionMode: {
          type: 'string',
          enum: ['default', 'dontAsk', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
          description: '权限模式，默认 dontAsk',
        },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '图片 base64 data URL 数组（格式 data:image/png;base64,...），作为附件传给视觉模型分析。非视觉 runtime 会静默忽略。',
        },
      },
      required: ['prompt', 'agentConfigId'],
    },
    outputs: [
      { key: 'result', type: 'string', description: 'Agent 执行结果' },
    ],
    execute: async (args, ctx) => {
      const agentService = await import('../agent.js');
      const prompt = String(args.prompt || '').trim();
      if (!prompt) throw new Error('prompt is required');

      const agentConfigId = typeof args.agentConfigId === 'string' ? args.agentConfigId.trim() : '';
      if (!agentConfigId) throw new Error('agentConfigId is required');
      const presets = listMiniAppAgentPresets(ctx?.workspaceId ?? '', agentService.listPresets(''));
      const preset = presets.find(p => p.id === agentConfigId);
      if (!preset || preset.enabled === false) throw new Error(`Agent preset not found: ${agentConfigId}`);

      const permissionMode = normalizeAgentPermissionMode(args.permissionMode);

      // Build runtime config from preset or use defaults
      const config: AgentRuntimeConfig = {
        kind: preset.runtimeKind as AgentRuntimeConfig['kind'],
        provider: preset.modelProvider as AgentRuntimeConfig['provider'],
        model: preset.modelId,
        apiKey: preset.apiKey,
        baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
        adapterBaseURL: preset.apiBase,
        maxTokens: preset.maxTokens,
        permissionMode,
        ...getThinkingRuntimeConfig(preset),
      };

      const runtime = createAgentRuntime(config);
      // 把 runtime 句柄注册到全局 registry，外部凭 taskId 可调 stop() 真正中断
      const taskId = typeof ctx?.taskId === 'string' && ctx.taskId ? ctx.taskId : '';
      if (taskId) registerRuntime(taskId, runtime);

      const workingDir = typeof args.cwd === 'string' && args.cwd.trim()
        ? args.cwd.trim()
        : agentService.resolveWorkingDir('', preset);

      // images: base64 data URL 数组 → Attachment[]（视觉模型附件通道）
      // 非视觉 runtime 会静默忽略 userAttachments，不影响纯文本 agent
      const userAttachments: Attachment[] | undefined = Array.isArray(args.images) && args.images.length
        ? args.images
            .filter((url: unknown): url is string => typeof url === 'string' && url.startsWith('data:'))
            .map((url: string, i: number) => {
              const m = url.match(/^data:([\w./+-]+)/i);
              const mime = m?.[1] || 'image/png';
              const ext = mime.split('/')[1]?.split('+')[0] || 'png';
              return { name: `image-${i + 1}.${ext}`, type: mime, url, path: '' } satisfies Attachment;
            })
        : undefined;

      try {
        const result = await runtime.execute(prompt, workingDir, {
          maxTurns: 50,
          systemPrompt: preset?.systemPrompt,
          outputStyle: preset?.outputStyle,
          userPrompt: prompt,
          userAttachments,
        });

        if (!result.success) throw new Error(result.summary || 'Agent execution failed');

        const content = result.output?.join('\n').trim() || result.summary;
        return {
          result: content,
          usage: result.usage,
        };
      } finally {
        // 无论成功/失败/中断，都清理句柄，避免长期持有已结束的 runtime
        if (taskId) unregisterRuntime(taskId);
      }
    },
  },
  {
    name: 'kb_add_text',
    description: 'Add plain text content to a fixed knowledge base for mini-apps.',
    input_schema: {
      type: 'object',
      properties: {
        knowledgeBase: { type: 'string', description: 'Knowledge base ID.' },
        title: { type: 'string', description: 'Document title.' },
        text: { type: 'string', description: 'Document text content.' },
      },
      required: ['knowledgeBase', 'text'],
    },
    outputs: [
      { key: 'fileId', type: 'string' },
      { key: 'fileName', type: 'string' },
      { key: 'chunkCount', type: 'number' },
      { key: 'status', type: 'string' },
    ],
    execute: async (args, ctx) => addTextToKnowledgeBase(requireWorkspaceId(ctx, args), args),
  },
  {
    name: 'kb_query',
    description: 'Query a knowledge base and return high-score semantic matches.',
    input_schema: {
      type: 'object',
      properties: {
        knowledgeBase: { type: 'string', description: 'Knowledge base ID.' },
        query: { type: 'string', description: 'Query text.' },
        topK: { type: 'number', description: 'Maximum matches to return.' },
      },
      required: ['knowledgeBase', 'query'],
    },
    outputs: [
      { key: 'matches', type: 'array' },
      { key: 'count', type: 'number' },
    ],
    execute: async (args, ctx) => {
      const workspaceId = requireWorkspaceId(ctx, args);
      const kbId = String(args.knowledgeBase || args.kbId || '').trim();
      const query = String(args.query || '').trim();
      const topK = Number(args.topK) > 0 ? Number(args.topK) : 5;
      if (!kbId) throw new Error('knowledgeBase is required');
      ensureKnowledgeBase(workspaceId, kbId);
      return kbService.queryKnowledgeBase(workspaceId, kbId, query, topK);
    },
  },
  {
    name: 'kb_delete',
    description: 'Delete one or more files from a knowledge base.',
    input_schema: {
      type: 'object',
      properties: {
        knowledgeBase: { type: 'string', description: 'Knowledge base ID.' },
        fileId: { type: 'string', description: 'File ID or comma-separated file IDs.' },
      },
      required: ['knowledgeBase', 'fileId'],
    },
    outputs: [{ key: 'deletedCount', type: 'number' }],
    execute: async (args, ctx) => {
      const workspaceId = requireWorkspaceId(ctx, args);
      const kbId = String(args.knowledgeBase || args.kbId || '').trim();
      const fileIds = String(args.fileId || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!kbId) throw new Error('knowledgeBase is required');
      let deletedCount = 0;
      for (const fileId of fileIds) {
        try {
          kbService.deleteFileFromKb(workspaceId, kbId, fileId);
          deletedCount++;
        } catch {
          // best-effort
        }
      }
      return { deletedCount };
    },
  },
  {
    name: 'execute_workflow_sync',
    description: 'Execute a saved workflow for a mini-app and wait for completion. Use this instead of plugin tools when a mini-app is workflow-driven.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: 'Workflow ID. workflowId is also accepted.' },
        workflowId: { type: 'string', description: 'Workflow ID alias.' },
        input: { type: 'object', description: 'Workflow input object.' },
        start_node_id: { type: 'string', description: 'Optional start node ID.' },
        startNodeId: { type: 'string', description: 'Start node ID alias.' },
        max_wait_ms: { type: 'number', description: `Sync wait timeout. Defaults to ${DEFAULT_WORKFLOW_SYNC_TIMEOUT_MS}, max ${MAX_WORKFLOW_SYNC_TIMEOUT_MS}.` },
      },
      required: ['workflow_id', 'input'],
    },
    outputs: [
      { key: 'workflow_id', type: 'string' },
      { key: 'executionId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'timedOut', type: 'boolean' },
      { key: 'steps', type: 'array' },
    ],
    execute: async (args) => executeWorkflowSyncForMiniApp(args),
  },
];

export async function executeMiniAppBuiltinTool(
  toolName: string,
  args: Record<string, any> = {},
  workspaceId?: string,
  taskId?: string,
): Promise<any> {
  const tool = BUILTIN_TOOLS.find(t => t.name === toolName);
  if (!tool) throw new Error(`Tool "${toolName}" not found in builtin tools`);
  return tool.execute(args, { workspaceId, taskId });
}

export function createWorkspaceMiniAppFunctionTools(workspaceId: string): AgentFunctionTool[] {
  const tool = BUILTIN_TOOLS.find((item) => item.name === 'execute_miniapp_tool')!;
  return [{
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
    execute: async (input) => executeMiniAppBuiltinTool(
      tool.name,
      input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, any> : {},
      workspaceId,
    ),
  }];
}

function listMiniAppAgentPresets(projectId: string, fallbackPresets: MiniAppAgentPreset[]): MiniAppAgentPreset[] {
  if (!projectId) return fallbackPresets;
  const configs = miniAppStore.readAgentsConfig(projectId);
  if (!configs?.length) return fallbackPresets;
  return configs
    .filter((config): config is JsonRecord => !!config && typeof config === 'object' && !Array.isArray(config))
    .map((config) => miniAppAgentConfigToPreset(config));
}

function miniAppAgentConfigToPreset(config: JsonRecord): MiniAppAgentPreset {
  const providerId = typeof config.providerId === 'string' ? config.providerId : undefined;
  const provider = providerId ? llmStore.getProvider(providerId) : undefined;
  return {
    id: String(config.id),
    name: String(config.name ?? config.id),
    role: 'agent',
    description: typeof config.description === 'string' ? config.description : '',
    runtimeKind: normalizeMiniAppRuntimeKind(config.runtimeKind),
    modelProvider: (typeof config.modelProvider === 'string' ? config.modelProvider : provider?.modelProvider) as AgentConfig['modelProvider'],
    providerId,
    modelId: typeof config.modelId === 'string' ? config.modelId : undefined,
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : provider?.apiKey,
    apiBase: typeof config.apiBase === 'string' ? config.apiBase : provider?.apiBase,
    workingDir: '',
    mcps: {},
    skills: [],
    tools: [],
    systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : '',
    outputStyle: '',
    temperature: typeof config.temperature === 'number' ? config.temperature : 0.3,
    maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : 4096,
    avatarUrl: '',
    icon: typeof config.avatar === 'string' ? config.avatar : '',
    backgroundUrl: '',
    enabled: true,
  };
}

// ---- Workflow UI function tools ----

export function createMiniAppFunctionTools(ctx: MiniAppToolContext): AgentFunctionTool[] {
  return [
    {
      name: 'list_agent_spaces_ui_components',
      description: 'List React UI components exposed on window.AgentSpacesUI for Workflow UI projects by category. Lucide React icons are also exposed on window.AgentSpacesUI by their standard icon names.',
      inputSchema: schema({
        category: {
          type: 'string',
          enum: [...MINI_APP_COMPONENT_CATEGORY_DESCRIPTIONS.map((item) => item.category), 'uncategorized'],
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
          try {
            const result = await executeMiniAppBuiltinTool(toolName, args);
            return { success: true, result };
          } catch (error: any) {
            return { success: false, message: error.message };
          }
        }
        try {
          const result = await executePluginTool(pluginId, toolName, args, createBuiltinPluginApi({ pluginId }));
          return { success: true, result };
        } catch (error: any) {
          return { success: false, message: error.message };
        }
      },
    },
  ];
}
