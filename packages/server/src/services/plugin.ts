import type { NodeTypeDefinition, PluginConfigField, PluginMeta } from '@agent-spaces/shared';
import { ensureDir, getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import AdmZip from 'adm-zip';
import { createBuiltinPluginApi } from './plugin-runtime-api.js';
import { getNpmSettings } from '../storage/npm-settings-store.js';

const require = createRequire(import.meta.url);

type PluginManifest = Partial<Omit<PluginMeta, 'enabled' | 'tags' | 'hasView'>> & {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  tags?: string[];
  name_zh?: string;
  name_en?: string;
  description_zh?: string;
  description_en?: string;
  tags_zh?: string[];
  tags_en?: string[];
  hasView?: boolean;
  hasWorkflow?: boolean;
  enabled?: boolean;
  config?: PluginConfigField[];
  workflowNodes?: NodeTypeDefinition[];
  entries?: { server?: string; workflow?: string; tools?: string | string[] };
};

type WorkflowNodeHandler = (ctx: any, args: Record<string, any>) => Promise<any>;
type StoreFile = { path: string; downloadUrl: string };
type PluginTranslator = (key: string, fallback?: string) => string;

type PluginState = {
  enabled: Record<string, boolean>;
  config: Record<string, Record<string, string>>;
  installedMd5?: Record<string, string>;
  installedAt?: Record<string, number>;
};

type ExecutablePlugin = {
  plugin: PluginMeta;
  handler: WorkflowNodeHandler;
  api: Record<string, any>;
};

type PluginRuntimeState = {
  activated: boolean;
  registeredActions: RegisteredPluginActions | null;
  localizedActions: Map<string, PluginActionDefinition[]>;
  configSnapshot?: string;
};

type RegisteredPluginActions = PluginActionDefinition[] | ((t: PluginTranslator) => PluginActionDefinition[]);

type PluginActionProperty = Record<string, any> & {
  key: string;
  label?: string;
  type?: string;
  dataType?: string;
  required?: boolean;
  toolRequired?: boolean;
  tooltip?: string;
  description?: string;
  schemaType?: string;
  items?: Record<string, unknown>;
  enum?: unknown[];
  options?: unknown[];
  default?: unknown;
};

type PluginActionDefinition = Record<string, any> & {
  name: string;
  label: string;
  category: string;
  icon: string;
  description: string;
  properties?: PluginActionProperty[];
  toolProperties?: PluginActionProperty[];
  configProperties?: PluginActionProperty[];
  outputs?: unknown[];
  tool?: false | { name?: string; description?: string };
  run: WorkflowNodeHandler;
};

export type PluginToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  outputs: unknown[];
};

const STATE_FILE = () => path.join(pluginsDir(), 'state.json');
const pluginRuntimeState = new Map<string, PluginRuntimeState>();

function clearPluginModuleCache(entryPath: string, visited = new Set<string>()): void {
  let resolved: string;
  try {
    resolved = require.resolve(entryPath);
  } catch {
    return;
  }
  if (visited.has(resolved)) return;
  visited.add(resolved);

  const cached = require.cache[resolved];
  if (!cached) return;
  for (const child of cached.children || []) {
    clearPluginModuleCache(child.id, visited);
  }
  delete require.cache[resolved];
}

function resetPluginRuntime(pluginId: string): void {
  pluginRuntimeState.delete(pluginId);

  const manifest = getManifest(pluginId);
  const dir = resolvePluginDir(pluginId);
  if (!manifest || !dir) return;

  const serverEntry = manifest.entries?.server || 'main.js';
  const workflowEntry = manifest.entries?.workflow;
  const toolEntries = manifest.entries?.tools;
  const candidates = [
    serverEntry,
    workflowEntry,
    ...(Array.isArray(toolEntries) ? toolEntries : toolEntries ? [toolEntries] : []),
    'actions.js',
    'shared.js',
    'workflow.js',
    'tools.js',
    'main.js',
  ];

  for (const entry of candidates) {
    if (!entry || typeof entry !== 'string') continue;
    clearPluginModuleCache(path.join(dir, entry));
  }
}

function templatesPluginsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'packages/templates/plugins'),
    path.resolve(process.cwd(), '../templates/plugins'),
    path.resolve(process.cwd(), 'templates/plugins'),
  ];
  return candidates.find(candidate => existsSync(candidate)) || candidates[0];
}

function pluginsDir(): string {
  return path.join(getDataDir(), 'plugins');
}

function pluginDir(pluginId: string): string {
  return path.join(pluginsDir(), pluginId);
}

function resolvePluginDir(pluginId: string): string | null {
  const direct = pluginDir(pluginId);
  if (existsSync(direct)) return direct;

  const root = pluginsDir();
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const manifest = readManifestFromDir(dir);
    if ((manifest?.id || entry.name) === pluginId) return dir;
  }
  return null;
}

function readState(): PluginState {
  return readJsonFile<PluginState>(STATE_FILE()) ?? { enabled: {}, config: {} };
}

function writeState(state: PluginState): void {
  writeJsonFile(STATE_FILE(), state);
}

function readManifestFromDir(dir: string): PluginManifest | null {
  const candidates = ['plugin.json', 'manifest.json', 'info.json', 'web-plugin.json', 'package.json'];
  for (const filename of candidates) {
    const manifest = readJsonFile<PluginManifest>(path.join(dir, filename));
    if (manifest?.id || manifest?.name) return manifest;
  }
  return null;
}

function normalizeLocale(locale?: string): string {
  const value = String(locale || '').toLowerCase();
  if (value.startsWith('en')) return 'en';
  return 'zh';
}

function readPluginLang(dir: string): Record<string, Record<string, string>> {
  const lang = readJsonFile<Record<string, Record<string, string>>>(path.join(dir, 'lang.json'));
  return lang && typeof lang === 'object' ? lang : {};
}

function createPluginTranslator(dir: string, locale?: string): PluginTranslator {
  const lang = readPluginLang(dir);
  const currentLocale = normalizeLocale(locale);
  const current = lang[currentLocale] || {};
  const fallbackLocale = currentLocale === 'en' ? 'zh' : 'en';
  const fallbackLang = lang[fallbackLocale] || {};

  return (key: string, fallback?: string) => {
    if (typeof key !== 'string' || !key) return fallback ?? '';
    return current[key] || fallbackLang[key] || fallback || key;
  };
}

function hasPackageDependencies(dir: string): boolean {
  const pkg = readJsonFile<{ dependencies?: Record<string, string> }>(path.join(dir, 'package.json'));
  return Boolean(pkg?.dependencies && Object.keys(pkg.dependencies).length > 0);
}

function installPluginDependencies(dir: string): void {
  if (!hasPackageDependencies(dir)) return;
  if (existsSync(path.join(dir, 'node_modules'))) return;

  const npmSettings = getNpmSettings();
  const npmCommand = 'npm';
  const npmArgs = ['install', '--omit=dev', `--registry=${npmSettings.registry}`];
  if (npmSettings.proxy) {
    npmArgs.push(`--proxy=${npmSettings.proxy}`, `--https-proxy=${npmSettings.proxy}`);
  }
  const result = spawnSync(npmCommand, npmArgs, {
    cwd: dir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NPM_CONFIG_REGISTRY: npmSettings.registry,
      ...(npmSettings.proxy ? {
        NPM_CONFIG_PROXY: npmSettings.proxy,
        NPM_CONFIG_HTTPS_PROXY: npmSettings.proxy,
      } : {}),
    },
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });

  if (result.error || result.status !== 0) {
    const detail = (result.error?.message || result.stderr || result.stdout || '').trim();
    console.error('[plugin] failed to install dependencies', {
      dir,
      command: `${npmCommand} ${npmArgs.join(' ')}`,
      registry: npmSettings.registry,
      proxy: npmSettings.proxy ? 'configured' : 'none',
      status: result.status,
      signal: result.signal,
      error: result.error?.message,
      stderr: result.stderr?.trim(),
      stdout: result.stdout?.trim(),
    });
    throw new Error(`Failed to install plugin dependencies in ${dir}${detail ? `: ${detail}` : ''}`);
  }
}

const ICON_FILENAMES = ['icon.svg', 'icon.png', 'icon.jpg', 'icon.jpeg', 'icon.webp'];

function detectIconFile(dirName: string): string | null {
  const dir = resolvePluginDir(dirName);
  if (!dir) return null;
  for (const name of ICON_FILENAMES) {
    if (existsSync(path.join(dir, name))) return name;
  }
  return null;
}

function localizedManifestString(manifest: PluginManifest, field: 'name' | 'description', locale?: string): string | undefined {
  const normalizedLocale = normalizeLocale(locale);
  const localized = (manifest as Record<string, unknown>)[`${field}_${normalizedLocale}`];
  if (typeof localized === 'string' && localized.trim()) return localized;
  const fallback = manifest[field];
  return typeof fallback === 'string' ? fallback : undefined;
}

function localizedManifestTags(manifest: PluginManifest, locale?: string): string[] {
  const normalizedLocale = normalizeLocale(locale);
  const localized = (manifest as Record<string, unknown>)[`tags_${normalizedLocale}`];
  if (Array.isArray(localized)) return localized.map(String);
  return Array.isArray(manifest.tags) ? manifest.tags : [];
}

function normalizePlugin(dirName: string, manifest: PluginManifest, state: PluginState, locale?: string): PluginMeta {
  const id = String(manifest.id || dirName);
  return {
    id,
    name: String(localizedManifestString(manifest, 'name', locale) || id),
    version: String(manifest.version || '0.0.0'),
    description: String(localizedManifestString(manifest, 'description', locale) || ''),
    author: manifest.author || { name: 'Unknown' },
    tags: localizedManifestTags(manifest, locale),
    hasView: Boolean(manifest.hasView),
    hasWorkflow: Boolean(manifest.hasWorkflow || manifest.workflowNodes?.length || manifest.entries?.workflow),
    type: manifest.type,
    enabled: state.enabled[id] ?? Boolean(manifest.enabled),
    config: Array.isArray(manifest.config) ? manifest.config : [],
    iconPath: manifest.iconPath || (manifest as any).icon || detectIconFile(dirName) || '',
    md5: state.installedMd5?.[id],
    installedAt: state.installedAt?.[id],
  };
}

function getManifest(pluginId: string): PluginManifest | null {
  const dir = resolvePluginDir(pluginId);
  return dir ? readManifestFromDir(dir) : null;
}

export function getPluginIconPath(pluginId: string): string | null {
  const dir = resolvePluginDir(pluginId);
  if (!dir) return null;
  const manifest = readManifestFromDir(dir);
  const iconRel = manifest?.iconPath || (manifest as any)?.icon || detectIconFile(pluginId);
  if (!iconRel || typeof iconRel !== 'string') return null;
  const iconAbs = path.resolve(dir, iconRel);
  if (!existsSync(iconAbs)) return null;
  return iconAbs;
}

const README_FILENAMES = ['README.md', 'readme.md', 'README.zh.md', 'README.cn.md', 'README.en.md', 'README.MD'];

/** 读取插件目录下的 README.md（本地插件）。未找到返回 null。 */
export function getPluginReadme(pluginId: string): string | null {
  const dir = resolvePluginDir(pluginId);
  if (!dir) return null;
  for (const filename of README_FILENAMES) {
    const file = path.join(dir, filename);
    if (existsSync(file)) {
      try {
        return readFileSync(file, 'utf-8');
      } catch {
        /* 尝试下一个候选文件名 */
      }
    }
  }
  return null;
}

function createRequireStub(): object {
  const target = () => createRequireStub();
  return new Proxy(target, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined;
      if (prop === Symbol.toPrimitive) return () => '';
      return createRequireStub();
    },
    apply: () => createRequireStub(),
    construct: () => createRequireStub(),
  });
}

export function coerceByDataType(value: unknown, dataType: string | undefined): unknown {
  if (!dataType) return value;
  if (value === undefined || value === null || value === '') return value;
  switch (dataType) {
    case 'number': {
      if (typeof value === 'number') return value;
      const num = Number(value);
      return Number.isFinite(num) ? num : value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === '1') return true;
      if (value === 'false' || value === '0') return false;
      return value;
    }
    case 'string[]': {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [value]; }
        catch { return [value]; }
      }
      return value;
    }
    case 'number[]': {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : value; }
        catch { return value; }
      }
      return value;
    }
    case 'object[]': {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : value; }
        catch { return value; }
      }
      return value;
    }
    case 'object': {
      if (typeof value === 'object' && value !== null) return value;
      if (typeof value === 'string') {
        try { return JSON.parse(value); }
        catch { return value; }
      }
      return value;
    }
    default:
      return value;
  }
}

function toJsonSchemaType(type: unknown, dataType?: string): string {
  if (dataType) {
    switch (dataType) {
      case 'string': return 'string';
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      case 'string[]':
      case 'number[]':
      case 'object[]': return 'array';
      case 'object': return 'object';
      case 'any': return 'string';
      default: break;
    }
  }
  switch (type) {
    case 'textarea':
    case 'select':
    case 'text':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
    case 'checkbox':
      return 'boolean';
    case 'array':
    case 'output_fields':
    case 'conditions':
      return 'array';
    default:
      return 'string';
  }
}

function propertyToSchema(property: PluginActionProperty): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: property.schemaType || toJsonSchemaType(property.type, property.dataType),
  };

  const description = property.description || property.tooltip || property.label;
  if (property.label) schema.title = property.label;
  if (description) schema.description = description;
  if (property.items) schema.items = property.items;
  if (property.enum) schema.enum = property.enum;
  if (property.options) {
    schema.options = property.options;
    if (!schema.enum) {
      schema.enum = property.options.map(option => {
        if (option && typeof option === 'object' && 'value' in option) {
          return (option as { value: unknown }).value;
        }
        return option;
      });
    }
  }
  if (property.default !== undefined) {
    schema.default = property.default;
  }

  // Auto-derive items for known array dataTypes
  if (!property.items && property.dataType) {
    if (property.dataType === 'string[]') {
      schema.items = { type: 'string' };
    } else if (property.dataType === 'number[]') {
      schema.items = { type: 'number' };
    }
  }

  return schema;
}

function applyUiPropertyDefaults(
  toolProperties: PluginActionProperty[],
  uiProperties?: PluginActionProperty[],
): PluginActionProperty[] {
  if (!uiProperties?.length) return [...toolProperties];

  const defaultByKey = new Map(
    uiProperties
      .filter(property => property.default !== undefined)
      .map(property => [property.key, property.default]),
  );

  return toolProperties.map((property) => {
    if (property.default !== undefined || !defaultByKey.has(property.key)) return property;
    return { ...property, default: defaultByKey.get(property.key) };
  });
}

function actionPropertiesToToolInputSchema(
  action: PluginActionDefinition,
): { properties: PluginActionProperty[]; inputSchema?: Record<string, unknown> } {
  const baseProperties = action.toolProperties || action.properties || [];
  if (Array.isArray(baseProperties)) {
    const toolProperties = action.toolProperties
      ? applyUiPropertyDefaults(baseProperties, action.properties)
      : [...baseProperties];
    return { properties: [...toolProperties, ...(action.configProperties || [])] };
  }

  if (typeof baseProperties === 'object') {
    const schema = baseProperties as Record<string, unknown>;
    const configProperties = action.configProperties || [];
    if (configProperties.length === 0) return { properties: [], inputSchema: schema };

    return {
      properties: [],
      inputSchema: {
        ...schema,
        type: schema.type || 'object',
        properties: {
          ...((schema.properties && typeof schema.properties === 'object') ? schema.properties : {}),
          ...Object.fromEntries(configProperties.map(property => [property.key, propertyToSchema(property)])),
        },
        required: [
          ...((Array.isArray(schema.required) ? schema.required : []) as string[]),
          ...configProperties
            .filter(property => property.required && property.toolRequired !== false)
            .map(property => property.key),
        ],
      },
    };
  }

  return { properties: [] };
}

function createPluginActions(actions: PluginActionDefinition[]) {
  const workflowNodes = actions.map(({ run, tool: _tool, ...action }) => {
    const properties = [...(action.properties || []), ...(action.configProperties || [])];
    return {
      type: action.name,
      label: action.label,
      category: action.category,
      icon: action.icon,
      description: action.description,
      properties,
      outputs: action.outputs || [],
      customView: action.customView,
      customViewMinSize: action.customViewMinSize,
      handler: run,
    };
  });

  const tools = actions
    .filter(action => action.tool !== false)
    .map((action) => {
      const tool = action.tool || {};
      const { properties, inputSchema } = actionPropertiesToToolInputSchema(action);
      const outputs = action.outputs || [];
      const required = properties
        .filter(property => property.required && property.toolRequired !== false)
        .map(property => property.key);

      return {
        name: tool.name || action.name,
        description: tool.description || action.description,
        input_schema: inputSchema || {
          type: 'object',
          properties: Object.fromEntries(properties.map(property => [property.key, propertyToSchema(property)])),
          required,
        },
        outputs,
      };
    });

  const handlers = new Map<string, WorkflowNodeHandler>();
  for (const action of actions) {
    handlers.set(action.name, action.run);
    if (action.tool && action.tool.name) handlers.set(action.tool.name, action.run);
  }

  return {
    workflow: () => ({ nodes: workflowNodes }),
    tools: () => ({
      tools,
      handler: async (name: string, args: Record<string, any>, api: Record<string, any>) => {
        const run = handlers.get(name);
        if (!run) return { success: false, message: `Unknown tool: ${name}` };
        return run({ api, config: api?.config || {}, logger: api?.logger || console }, args);
      },
    }),
  };
}

function createPluginRequire(entryPath: string) {
  const relativeRequire = createRequire(entryPath);
  return (request: string) => {
    const normalized = request.replace(/^node:/, '');
    if (builtinModules.includes(normalized)) return require(request);
    if (request.startsWith('./') || request.startsWith('../') || path.isAbsolute(request)) {
      return relativeRequire(request);
    }
    return createRequireStub();
  };
}

function createPluginContext(plugin: PluginMeta, dir: string, config?: Record<string, string>) {
  const t = createPluginTranslator(dir);
  return {
    plugin,
    config: config ?? getPluginConfig(plugin.id),
    t,
    logger: {
      info: (message: string) => console.info(`[plugin:${plugin.id}] ${message}`),
      warning: (message: string) => console.warn(`[plugin:${plugin.id}] ${message}`),
      error: (message: string) => console.error(`[plugin:${plugin.id}] ${message}`),
    },
    registerActions: (actions: RegisteredPluginActions) => {
      const state = pluginRuntimeState.get(plugin.id) ?? {
        activated: false,
        registeredActions: null,
        localizedActions: new Map<string, PluginActionDefinition[]>(),
      };
      state.registeredActions = Array.isArray(actions) || typeof actions === 'function' ? actions : [];
      state.localizedActions.clear();
      pluginRuntimeState.set(plugin.id, state);
    },
  };
}

function runPluginServerEntry(
  plugin: PluginMeta,
  dir: string,
  serverPath: string,
  config?: Record<string, string>,
): void {
  const source = readFileSync(serverPath, 'utf-8');
  const module = { exports: {} as { activate?: (context: ReturnType<typeof createPluginContext>) => unknown } };
  const script = new vm.Script(`(function(require, module, exports, __filename, __dirname) {\n${source}\n})`, { filename: serverPath });
  const runner = script.runInNewContext({ console, Buffer, URL, URLSearchParams, fetch, setTimeout, clearTimeout });
  runner(createPluginRequire(serverPath), module, module.exports, serverPath, path.dirname(serverPath));

  if (typeof module.exports.activate === 'function') {
    module.exports.activate(createPluginContext(plugin, dir, config));
  }
}

function activatePlugin(plugin: PluginMeta): void {
  const current = pluginRuntimeState.get(plugin.id);
  if (current?.activated) return;

  const nextState = current ?? {
    activated: false,
    registeredActions: null,
    localizedActions: new Map<string, PluginActionDefinition[]>(),
  };
  pluginRuntimeState.set(plugin.id, nextState);

  const manifest = getManifest(plugin.id);
  const dir = resolvePluginDir(plugin.id);
  if (!manifest || !dir) {
    nextState.activated = true;
    return;
  }

  const serverEntry = manifest.entries?.server || 'main.js';
  const serverPath = path.join(dir, serverEntry);
  if (!existsSync(serverPath) || (!serverPath.endsWith('.js') && !serverPath.endsWith('.cjs'))) {
    nextState.activated = true;
    return;
  }

  runPluginServerEntry(plugin, dir, serverPath);
  nextState.configSnapshot = JSON.stringify(getPluginConfig(plugin.id));
  nextState.activated = true;
}

function refreshPluginRuntimeConfig(plugin: PluginMeta, config: Record<string, string>): void {
  const configSnapshot = JSON.stringify(config);
  const state = pluginRuntimeState.get(plugin.id);
  if (state?.configSnapshot === configSnapshot) return;

  const manifest = getManifest(plugin.id);
  const dir = resolvePluginDir(plugin.id);
  if (!manifest || !dir) {
    if (state) state.configSnapshot = configSnapshot;
    return;
  }

  const serverEntry = manifest.entries?.server || 'main.js';
  const serverPath = path.join(dir, serverEntry);
  if (!existsSync(serverPath) || (!serverPath.endsWith('.js') && !serverPath.endsWith('.cjs'))) {
    if (state) state.configSnapshot = configSnapshot;
    return;
  }

  runPluginServerEntry(plugin, dir, serverPath, config);
  const nextState = pluginRuntimeState.get(plugin.id);
  if (nextState) {
    nextState.activated = true;
    nextState.configSnapshot = configSnapshot;
  }
}

function getRegisteredPluginActions(plugin: PluginMeta, locale?: string): PluginActionDefinition[] {
  activatePlugin(plugin);
  const state = pluginRuntimeState.get(plugin.id);
  if (!state?.registeredActions) return [];

  const normalizedLocale = normalizeLocale(locale);
  const cached = state.localizedActions.get(normalizedLocale);
  if (cached) return cached;

  const dir = resolvePluginDir(plugin.id);
  const t = dir ? createPluginTranslator(dir, normalizedLocale) : ((key: string, fallback?: string) => fallback || key);
  const actions = typeof state.registeredActions === 'function'
    ? state.registeredActions(t)
    : state.registeredActions;
  const normalizedActions = Array.isArray(actions) ? actions : [];
  state.localizedActions.set(normalizedLocale, normalizedActions);
  return normalizedActions;
}

function loadCommonJsWorkflowNodes(workflowPath: string): NodeTypeDefinition[] {
  const source = readFileSync(workflowPath, 'utf-8');
  const module = { exports: {} as { nodes?: NodeTypeDefinition[] } | NodeTypeDefinition[] };
  const localRequire = createPluginRequire(workflowPath);
  const script = new vm.Script(`(function(require, module, exports, __filename, __dirname) {\n${source}\n})`, { filename: workflowPath });
  const runner = script.runInNewContext({ console, Buffer, URL, URLSearchParams, fetch, setTimeout, clearTimeout });
  runner(localRequire, module, module.exports, workflowPath, path.dirname(workflowPath));
  const payload = module.exports;
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.nodes) ? payload.nodes : [];
}

function loadCommonJsWorkflowModule(workflowPath: string): { nodes: NodeTypeDefinition[]; handlers: Map<string, WorkflowNodeHandler> } {
  const source = readFileSync(workflowPath, 'utf-8');
  const module = { exports: {} as { nodes?: Array<NodeTypeDefinition & { handler?: WorkflowNodeHandler }> } };
  const localRequire = createPluginRequire(workflowPath);
  const script = new vm.Script(`(function(require, module, exports, __filename, __dirname) {\n${source}\n})`, { filename: workflowPath });
  const runner = script.runInNewContext({ console, Buffer, URL, URLSearchParams, fetch, setTimeout, clearTimeout });
  runner(localRequire, module, module.exports, workflowPath, path.dirname(workflowPath));

  const payload = module.exports;
  const rawNodes = Array.isArray(payload) ? payload : Array.isArray(payload?.nodes) ? payload.nodes : [];
  const handlers = new Map<string, WorkflowNodeHandler>();
  const nodes = rawNodes.map((node) => {
    const { handler, ...serializable } = node;
    if (typeof handler === 'function' && typeof serializable.type === 'string') {
      handlers.set(serializable.type, handler);
    }
    return serializable as NodeTypeDefinition;
  });
  return { nodes, handlers };
}

export function listPlugins(locale?: string): PluginMeta[] {
  const root = pluginsDir();
  ensureDir(root);
  const state = readState();
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      const manifest = readManifestFromDir(path.join(root, entry.name));
      return manifest ? normalizePlugin(entry.name, manifest, state, locale) : null;
    })
    .filter((plugin): plugin is PluginMeta => Boolean(plugin));
}

export function listWorkflowPlugins(locale?: string): PluginMeta[] {
  return listPlugins(locale).filter(plugin => plugin.hasWorkflow);
}

export function uninstallPlugin(pluginId: string): void {
  const dir = resolvePluginDir(pluginId);
  if (!dir) throw new Error('Plugin not found');

  resetPluginRuntime(pluginId);

  // remove plugin directory from disk
  rmSync(dir, { recursive: true, force: true });

  // clean state.json
  const state = readState();
  delete state.enabled[pluginId];
  // delete state.config[pluginId];
  if (state.installedMd5) delete state.installedMd5[pluginId];
  if (state.installedAt) delete state.installedAt[pluginId];
  writeState(state);
}

export function setPluginEnabled(pluginId: string, enabled: boolean): PluginMeta {
  const state = readState();
  state.enabled[pluginId] = enabled;
  writeState(state);
  const plugin = listPlugins().find(item => item.id === pluginId);
  if (!plugin) throw new Error('Plugin not found');
  return plugin;
}

function findTemplatePluginDir(pluginId: string): string | null {
  const root = templatesPluginsDir();
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const manifest = readManifestFromDir(dir);
    if ((manifest?.id || entry.name) === pluginId) return dir;
  }
  return null;
}

function sanitizeStorePluginPath(sourceUrl: string): string {
  const pathname = new URL(sourceUrl).pathname.replace(/\/+$/, '');
  return path.basename(decodeURIComponent(pathname)).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'plugin';
}

function inferStoreZipUrl(sourceUrl: string): string {
  return sourceUrl.endsWith('.zip') ? sourceUrl : `${sourceUrl.replace(/\/+$/, '')}.zip`;
}

function unwrapGithubProxyUrl(sourceUrl: string): string {
  const match = sourceUrl.match(/https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/.+/i);
  return match?.[0] || sourceUrl;
}

function getGithubStoreParts(sourceUrl: string): { owner: string; repo: string; ref: string; dirPath: string } | null {
  const unwrapped = unwrapGithubProxyUrl(sourceUrl);
  const rawMatch = unwrapped.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (rawMatch) {
    return {
      owner: rawMatch[1],
      repo: rawMatch[2],
      ref: rawMatch[3],
      dirPath: rawMatch[4].replace(/\/+$/, ''),
    };
  }

  const githubMatch = unwrapped.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/refs\/heads\/([^/]+)\/(.+)$/i);
  if (githubMatch) {
    return {
      owner: githubMatch[1],
      repo: githubMatch[2],
      ref: githubMatch[3],
      dirPath: githubMatch[4].replace(/\/+$/, ''),
    };
  }

  return null;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function tryInstallStoreZip(pluginId: string, sourceUrl: string): Promise<PluginMeta | null> {
  try {
    const zip = new AdmZip(await fetchBuffer(inferStoreZipUrl(sourceUrl)));
    const targetDir = path.join(pluginsDir(), sanitizeStorePluginPath(sourceUrl));
    ensureDir(pluginsDir());
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
    ensureDir(targetDir);
    zip.extractAllTo(targetDir, true);

    const entries = readdirSync(targetDir, { withFileTypes: true });
    if (!readManifestFromDir(targetDir) && entries.length === 1 && entries[0].isDirectory()) {
      const nestedDir = path.join(targetDir, entries[0].name);
      const manifest = readManifestFromDir(nestedDir);
      if (manifest) {
        rmSync(targetDir, { recursive: true, force: true });
        cpSync(nestedDir, targetDir, { recursive: true });
      }
    }

    const manifest = readManifestFromDir(targetDir);
    if (!manifest) throw new Error('Store plugin manifest not found');
    if ((manifest.id || pluginId) !== pluginId) throw new Error(`Store plugin id mismatch: ${manifest.id || ''}`);
    installPluginDependencies(targetDir);
    return setPluginEnabled(pluginId, true);
  } catch (error) {
    console.warn('[plugin] store zip install skipped', {
      pluginId,
      sourceUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function githubRawUrl(file: StoreFile): string {
  return file.downloadUrl;
}

async function listGithubStoreFiles(sourceUrl: string): Promise<StoreFile[] | null> {
  const parts = getGithubStoreParts(sourceUrl);
  if (!parts) return null;
  const githubParts = parts;

  const apiUrl = `https://api.github.com/repos/${githubParts.owner}/${githubParts.repo}/contents/${encodeURIComponent(githubParts.dirPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(githubParts.ref)}`;
  const items = await fetchJson<Array<{ type: string; path: string; download_url?: string; url?: string }>>(apiUrl);
  const files: StoreFile[] = [];

  async function visit(entries: typeof items): Promise<void> {
    for (const item of entries) {
      if (item.type === 'file' && item.download_url) {
        files.push({ path: item.path.slice(githubParts.dirPath.length).replace(/^\/+/, ''), downloadUrl: item.download_url });
      } else if (item.type === 'dir' && item.url) {
        await visit(await fetchJson<typeof items>(`${item.url}&ref=${encodeURIComponent(githubParts.ref)}`));
      }
    }
  }

  await visit(items);
  return files;
}

async function tryInstallGithubStoreDir(pluginId: string, sourceUrl: string): Promise<PluginMeta | null> {
  const files = await listGithubStoreFiles(sourceUrl);
  if (!files?.length) return null;

  const targetDir = path.join(pluginsDir(), sanitizeStorePluginPath(sourceUrl));
  ensureDir(pluginsDir());
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });

  for (const file of files) {
    if (file.path.split('/').includes('node_modules')) continue;
    const targetPath = path.join(targetDir, file.path);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, await fetchBuffer(githubRawUrl(file)));
  }

  const manifest = readManifestFromDir(targetDir);
  if (!manifest) throw new Error('Store plugin manifest not found');
  if ((manifest.id || pluginId) !== pluginId) throw new Error(`Store plugin id mismatch: ${manifest.id || ''}`);
  installPluginDependencies(targetDir);
  return setPluginEnabled(pluginId, true);
}

async function tryInstallStoreCommonFiles(pluginId: string, sourceUrl: string, fileList?: string[]): Promise<PluginMeta | null> {
  const base = sourceUrl.replace(/\/+$/, '');
  const targetDir = path.join(pluginsDir(), sanitizeStorePluginPath(sourceUrl));
  const manifestNames = ['plugin.json', 'manifest.json', 'info.json', 'web-plugin.json', 'package.json'];
  let manifestName = '';
  let manifest: PluginManifest | null = null;

  for (const name of manifestNames) {
    try {
      manifest = await fetchJson<PluginManifest>(`${base}/${name}`);
      if (manifest?.id || manifest?.name) {
        manifestName = name;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!manifest || !manifestName) return null;

  if ((manifest.id || pluginId) !== pluginId) throw new Error(`Store plugin id mismatch: ${manifest.id || ''}`);

  // 优先使用 index.json 提供的实际文件清单；回退到硬编码白名单（兼容旧索引/未带 files 的安装请求）
  let files: Set<string>;
  if (Array.isArray(fileList) && fileList.length) {
    files = new Set(fileList);
    if (manifestName) files.add(manifestName);
  } else {
    files = new Set([
      manifestName,
      'package.json',
      'package-lock.json',
      'main.js',
      'workflow.js',
      'tools.js',
      'actions.js',
      'lang.json',
      'shared.js',
    ]);

    const iconRel = manifest.iconPath || (manifest as any)?.icon;
    if (typeof iconRel === 'string' && iconRel) files.add(iconRel);

    const entries = manifest.entries || {};
    for (const entry of [entries.server, entries.workflow, entries.tools]) {
      for (const file of Array.isArray(entry) ? entry : [entry]) {
        if (file) files.add(file);
      }
    }

    // README 文档（插件详情对话框展示用）—— 不存在的候选项在下载时会被自动跳过
    for (const readme of README_FILENAMES) files.add(readme);
  }

  ensureDir(pluginsDir());
  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
  ensureDir(targetDir);

  for (const file of files) {
    try {
      const buffer = await fetchBuffer(`${base}/${file}`);
      const targetPath = path.join(targetDir, file);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, buffer);
    } catch {
      continue;
    }
  }

  installPluginDependencies(targetDir);
  return setPluginEnabled(pluginId, true);
}

async function installStorePlugin(pluginId: string, sourceUrl: string, files?: string[]): Promise<PluginMeta | null> {
  resetPluginRuntime(pluginId);
  const fromGithub = await tryInstallGithubStoreDir(pluginId, sourceUrl).catch((error) => {
    console.warn('[plugin] github store install skipped', {
      pluginId,
      sourceUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  if (fromGithub) return fromGithub;
  const fromZip = await tryInstallStoreZip(pluginId, sourceUrl);
  if (fromZip) return fromZip;
  return tryInstallStoreCommonFiles(pluginId, sourceUrl, files);
}

export async function installTemplatePlugin(pluginId: string, sourceUrl?: string, md5?: string, files?: string[]): Promise<PluginMeta> {
  resetPluginRuntime(pluginId);
  // Save md5 + installedAt before install so normalizePlugin picks it up
  {
    const state = readState();
    if (md5) {
      if (!state.installedMd5) state.installedMd5 = {};
      state.installedMd5[pluginId] = md5;
    }
    if (!state.installedAt) state.installedAt = {};
    state.installedAt[pluginId] = Date.now();
    writeState(state);
  }

  if (sourceUrl) {
    const plugin = await installStorePlugin(pluginId, sourceUrl, files);
    if (plugin) return plugin;
  }

  const sourceDir = findTemplatePluginDir(pluginId);
  if (!sourceDir) throw new Error('Template plugin not found');

  const manifest = readManifestFromDir(sourceDir);
  const id = String(manifest?.id || path.basename(sourceDir));
  const targetDir = path.join(pluginsDir(), path.basename(sourceDir));
  ensureDir(pluginsDir());
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, {
      recursive: true,
      filter: (src) => !src.split(path.sep).includes('node_modules'),
    });
  }
  installPluginDependencies(targetDir);
  if (id !== pluginId) {
    const state = readState();
    if (md5) {
      if (!state.installedMd5) state.installedMd5 = {};
      state.installedMd5[id] = md5;
    }
    if (!state.installedAt) state.installedAt = {};
    state.installedAt[id] = state.installedAt?.[pluginId] ?? Date.now();
    delete state.installedAt?.[pluginId];
    writeState(state);
  }
  return setPluginEnabled(id, true);
}

export function getPluginConfig(pluginId: string): Record<string, string> {
  const state = readState();
  const manifest = getManifest(pluginId);
  const defaults: Record<string, string> = {};
  for (const field of manifest?.config || []) {
    defaults[field.key] = field.value ?? '';
  }
  return { ...defaults, ...(state.config[pluginId] || {}) };
}

export function savePluginConfig(pluginId: string, data: Record<string, string>) {
  const state = readState();
  state.config[pluginId] = data;
  writeState(state);
  return { success: true };
}

function getWorkflowEntryPath(pluginId: string): string | null {
  const manifest = getManifest(pluginId);
  if (!manifest) return null;
  const dir = resolvePluginDir(pluginId);
  if (!dir) return null;
  const workflowEntry = manifest.entries?.workflow || 'workflow.json';
  const workflowPath = path.join(dir, workflowEntry);
  return existsSync(workflowPath) ? workflowPath : null;
}

export function getWorkflowNodes(pluginId: string, locale?: string): NodeTypeDefinition[] {
  const manifest = getManifest(pluginId);
  if (!manifest) throw new Error('Plugin not found');
  if (Array.isArray(manifest.workflowNodes)) return manifest.workflowNodes;

  const plugin = listPlugins().find(item => item.id === pluginId);
  if (plugin) {
    const actions = getRegisteredPluginActions(plugin, locale);
    if (actions.length) return createPluginActions(actions).workflow().nodes as NodeTypeDefinition[];
  }

  const workflowPath = getWorkflowEntryPath(pluginId);
  if (!workflowPath) return [];
  if (workflowPath.endsWith('.js') || workflowPath.endsWith('.cjs')) {
    return loadCommonJsWorkflowNodes(workflowPath);
  }
  const payload = readJsonFile<{ nodes?: NodeTypeDefinition[] } | NodeTypeDefinition[]>(workflowPath);
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.nodes) ? payload.nodes : [];
}

export function getPluginTools(pluginId: string, locale?: string): PluginToolDefinition[] {
  const plugin = listPlugins().find(item => item.id === pluginId);
  if (!plugin) throw new Error('Plugin not found');

  const actions = getRegisteredPluginActions(plugin, locale);
  if (!actions.length) return [];
  return createPluginActions(actions).tools().tools;
}

export async function executePluginTool(
  pluginId: string,
  name: string,
  args: Record<string, any>,
  api: Record<string, any> = {},
  locale?: string,
): Promise<any> {
  const plugin = listPlugins().find(item => item.id === pluginId);
  if (!plugin) throw new Error('Plugin not found');

  const pluginConfig = getPluginConfig(pluginId);
  refreshPluginRuntimeConfig(plugin, pluginConfig);

  const actions = getRegisteredPluginActions(plugin, locale);
  if (!actions.length) throw new Error(`Plugin has no registered tools: ${pluginId}`);

  const mergedArgs = Object.assign({}, pluginConfig, args);
  return createPluginActions(actions).tools().handler(name, mergedArgs, { ...api, config: pluginConfig });
}

function getExecutablePluginByNodeType(nodeType: string): ExecutablePlugin | null {
  for (const plugin of listWorkflowPlugins()) {
    if (!plugin.enabled) continue;

    const actions = getRegisteredPluginActions(plugin);
    if (actions.length) {
      const { nodes } = createPluginActions(actions).workflow();
      const rawNode = (nodes as Array<NodeTypeDefinition & { handler?: WorkflowNodeHandler }>).find(node => node.type === nodeType);
      const handler = rawNode?.handler;
      if (handler) return { plugin, handler, api: createBuiltinPluginApi() };
    }

    const workflowPath = getWorkflowEntryPath(plugin.id);
    if (!workflowPath || (!workflowPath.endsWith('.js') && !workflowPath.endsWith('.cjs'))) continue;

    try {
      const { handlers } = loadCommonJsWorkflowModule(workflowPath);
      const handler = handlers.get(nodeType);
      if (handler) return { plugin, handler, api: createBuiltinPluginApi() };
    } catch (error) {
      const nodes = loadCommonJsWorkflowNodes(workflowPath);
      if (nodes.some(node => node.type === nodeType)) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Plugin node "${nodeType}" from "${plugin.id}" failed to load: ${message}`);
      }
      continue;
    }
  }
  return null;
}

export function canExecuteWorkflowNode(nodeType: string): boolean {
  return Boolean(getExecutablePluginByNodeType(nodeType));
}

export function requiresClientExecution(nodeType: string): boolean {
  const executable = getExecutablePluginByNodeType(nodeType);
  return executable?.plugin.type === 'client' || executable?.plugin.type === 'both';
}

export function getPluginIdByNodeType(nodeType: string): string | null {
  return getExecutablePluginByNodeType(nodeType)?.plugin.id ?? null;
}

export function getWorkflowNodeDefinitionByType(nodeType: string): NodeTypeDefinition | null {
  for (const plugin of listWorkflowPlugins()) {
    if (!plugin.enabled) continue;
    const definition = getWorkflowNodes(plugin.id).find(node => node.type === nodeType);
    if (definition) return definition;
  }
  return null;
}

export async function executeWorkflowNode(
  nodeType: string,
  args: Record<string, any>,
  hooks: {
    logger: {
      info(message: string): void;
      warning(message: string): void;
      error(message: string): void;
    };
  },
): Promise<any> {
  const executable = getExecutablePluginByNodeType(nodeType);
  if (!executable) throw new Error(`Plugin node is not enabled or has no executable handler: ${nodeType}`);

  return executable.handler(
    {
      api: executable.api,
      nodeId: '',
      nodeLabel: nodeType,
      upstream: {},
      logger: hooks.logger,
    },
    args,
  );
}
