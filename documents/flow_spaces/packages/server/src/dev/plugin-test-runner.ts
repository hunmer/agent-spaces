import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPluginTestHarness, type LoadedPlugin } from './plugin-test-harness.js';

type TestModule = {
  default?: (plugin: LoadedPlugin) => Promise<unknown> | unknown;
  run?: (plugin: LoadedPlugin) => Promise<unknown> | unknown;
};

type MockApiModule = {
  default?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>);
  api?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>);
};

type RunnerArgs = {
  pluginDir?: string;
  testFile?: string;
  code?: string;
  configJson?: string;
  mockApiFile?: string;
};

function parseArgs(argv: string[]): RunnerArgs {
  const args: RunnerArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--plugin' || item === '-p') {
      args.pluginDir = argv[i + 1];
      i += 1;
    } else if (item === '--test' || item === '-t') {
      args.testFile = argv[i + 1];
      i += 1;
    } else if (item === '--code' || item === '-c') {
      args.code = argv[i + 1];
      i += 1;
    } else if (item === '--config') {
      args.configJson = argv[i + 1];
      i += 1;
    } else if (item === '--mock-api') {
      args.mockApiFile = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function printUsage(): void {
  console.error([
    'Usage:',
    '  tsx src/dev/plugin-test-runner.ts --plugin <plugin-dir> --test <test-file> [--config <json>] [--mock-api <file>]',
    '  tsx src/dev/plugin-test-runner.ts --plugin <plugin-dir> --code "<async code>" [--config <json>] [--mock-api <file>]',
    '',
    'Test file must export default or run(plugin).',
    'Inline code receives a plugin variable.',
  ].join('\n'));
}

async function runTestFile(testFile: string, plugin: LoadedPlugin): Promise<unknown> {
  const fullPath = path.resolve(testFile);
  if (!existsSync(fullPath)) throw new Error(`Test file not found: ${fullPath}`);

  const mod = await import(pathToFileURL(fullPath).href) as TestModule;
  const run = mod.default || mod.run;
  if (typeof run !== 'function') {
    throw new Error('Test file must export default or run(plugin)');
  }
  return run(plugin);
}

async function runInlineCode(code: string, plugin: LoadedPlugin): Promise<unknown> {
  const fn = new Function('plugin', `return (async () => {\n${code}\n})()`);
  return fn(plugin);
}

function parseConfig(configInput?: string): Record<string, unknown> {
  if (!configInput) return {};
  const source = configInput.startsWith('@')
    ? readFileSync(path.resolve(configInput.slice(1)), 'utf-8')
    : configInput;
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--config must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

async function loadMockApi(mockApiFile?: string): Promise<Record<string, unknown>> {
  if (!mockApiFile) return {};

  const fullPath = path.resolve(mockApiFile);
  if (!existsSync(fullPath)) throw new Error(`Mock API file not found: ${fullPath}`);

  const mod = await import(pathToFileURL(fullPath).href) as MockApiModule;
  const exported = mod.default ?? mod.api;
  const api = typeof exported === 'function' ? await exported() : exported;
  if (!api || typeof api !== 'object' || Array.isArray(api)) {
    throw new Error('Mock API file must export an object, or a function that returns an object');
  }
  return api as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pluginDir || (!args.testFile && !args.code)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const pluginDir = path.resolve(args.pluginDir);
  if (!existsSync(pluginDir)) throw new Error(`Plugin dir not found: ${pluginDir}`);

  const config = parseConfig(args.configJson);
  const api = await loadMockApi(args.mockApiFile);
  const plugin = createPluginTestHarness({ pluginDir, config, api });
  console.log(`loaded plugin: ${pluginDir}`);
  console.log(`actions: ${plugin.listActions().join(', ')}`);

  const result = args.testFile
    ? await runTestFile(args.testFile, plugin)
    : await runInlineCode(args.code || '', plugin);

  if (result !== undefined) {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
