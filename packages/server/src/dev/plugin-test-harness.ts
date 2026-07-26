import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuiltinPluginApi } from '../services/plugin-runtime-api.js';

type PluginTranslator = (key: string, fallback?: string) => string;
export type PluginAction = {
  name: string;
  run?: (ctx: Record<string, unknown>, args: Record<string, unknown>) => Promise<unknown> | unknown;
};

export type PluginTestHarnessOptions = {
  pluginDir: string;
  locale?: string;
  config?: Record<string, unknown>;
  api?: Record<string, unknown>;
};

export type LoadedPlugin = {
  pluginDir: string;
  actions: PluginAction[];
  api: Record<string, unknown>;
  config: Record<string, unknown>;
  runAction(name: string, args?: Record<string, unknown>): Promise<unknown>;
  listActions(): string[];
};

function fallbackTranslator(key: string, fallback?: string): string {
  return fallback || key;
}

function createLogger(pluginDir: string) {
  const name = path.basename(pluginDir);
  return {
    info: (message: string) => console.info(`[plugin-test:${name}] ${message}`),
    warning: (message: string) => console.warn(`[plugin-test:${name}] ${message}`),
    error: (message: string) => console.error(`[plugin-test:${name}] ${message}`),
  };
}

function loadCommonJsModule<T>(filePath: string): T {
  const require = createRequire(pathToFileURL(filePath).href);
  delete require.cache[require.resolve(filePath)];
  return require(filePath) as T;
}

function loadActions(pluginDir: string, t: PluginTranslator): PluginAction[] {
  const actionsPath = path.join(pluginDir, 'actions.js');
  const exported = loadCommonJsModule<PluginAction[] | ((t: PluginTranslator) => PluginAction[])>(actionsPath);
  const actions = typeof exported === 'function' ? exported(t) : exported;
  return Array.isArray(actions) ? actions : [];
}

export function createPluginTestHarness(options: PluginTestHarnessOptions): LoadedPlugin {
  const pluginDir = path.resolve(options.pluginDir);
  const config = options.config || {};
  const api = {
    ...createBuiltinPluginApi({ pluginId: path.basename(pluginDir), pluginName: path.basename(pluginDir) }),
    ...options.api,
    config,
    logger: createLogger(pluginDir),
  };
  const actions = loadActions(pluginDir, fallbackTranslator);
  const logger = createLogger(pluginDir);

  return {
    pluginDir,
    actions,
    api,
    config,
    listActions: () => actions.map(action => action.name),
    async runAction(name: string, args: Record<string, unknown> = {}) {
      const action = actions.find(item => item.name === name);
      if (!action || typeof action.run !== 'function') {
        throw new Error(`Plugin action not found: ${name}`);
      }

      return action.run(
        {
          api,
          config,
          logger,
          plugin: { id: path.basename(pluginDir), dir: pluginDir },
        },
        { ...config, ...args },
      );
    },
  };
}
