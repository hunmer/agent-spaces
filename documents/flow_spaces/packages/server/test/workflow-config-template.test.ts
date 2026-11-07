import test from 'node:test';
import assert from 'node:assert/strict';
import { __resolveWorkflowConfigValueForTest } from '../src/services/execution-manager.js';

test('workflow config template uses fallback for missing or empty values', () => {
  const template = '{{ __config__["workflow.aliyun-ai"]["baseUrl"] || "https://dashscope.aliyuncs.com" }}';

  assert.equal(__resolveWorkflowConfigValueForTest({}, template), 'https://dashscope.aliyuncs.com');
  assert.equal(
    __resolveWorkflowConfigValueForTest({ 'workflow.aliyun-ai': { baseUrl: '' } }, template),
    'https://dashscope.aliyuncs.com',
  );
});

test('workflow config template prefers configured values over fallback', () => {
  const template = '{{ __config__["workflow.aliyun-ai"]["baseUrl"] || "https://dashscope.aliyuncs.com" }}';

  assert.equal(
    __resolveWorkflowConfigValueForTest({ 'workflow.aliyun-ai': { baseUrl: 'https://example.test' } }, template),
    'https://example.test',
  );
});

test('workflow config template without fallback keeps existing missing-value behavior', () => {
  assert.equal(
    __resolveWorkflowConfigValueForTest({}, '{{ __config__["workflow.aliyun-ai"]["apiKey"] }}'),
    '',
  );
});

test('workflow config template reads a named plugin config without changing the default path', () => {
  const config = {
    'workflow.ai-image': {
      apiKey: 'default-key',
      '自定义配置文件名字': { apiKey: 'named-key' },
    },
  };

  assert.equal(
    __resolveWorkflowConfigValueForTest(config, '{{ __config__["workflow.ai-image"]["apiKey"] }}'),
    'default-key',
  );
  assert.equal(
    __resolveWorkflowConfigValueForTest(config, '{{ __config__["workflow.ai-image"]["自定义配置文件名字"]["apiKey"] }}'),
    'named-key',
  );
});
