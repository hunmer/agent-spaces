import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __testables } from '../src/adapters/claude-code-runtime/index.js';

const SERVER_PUBLIC_UPLOADS_DIR = join(fileURLToPath(new URL('../public/uploads/', import.meta.url)));

test('buildClaudePrompt converts image attachments into SDK user messages', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'claude-image-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const uploadsDir = join(dataDir, 'public', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'sample.png'), Buffer.from('png-binary'));

    const prompt = __testables.buildClaudePrompt('describe image', __testables.buildClaudeAttachmentContext([
      {
        name: 'sample.png',
        path: '/static/uploads/sample.png',
        url: '/static/uploads/sample.png',
        type: 'image/png',
      },
    ]));

    assert.equal(typeof prompt, 'object');
    const messages = [];
    for await (const message of prompt as AsyncIterable<unknown>) messages.push(message);

    assert.deepEqual(messages, [{
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'describe image' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: Buffer.from('png-binary').toString('base64'),
            },
          },
        ],
      },
      parent_tool_use_id: null,
    }]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('buildClaudeUserMessageContent resolves images from server public uploads directory', () => {
  const uploadPath = join(SERVER_PUBLIC_UPLOADS_DIR, 'claude-runtime-test.png');
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = join(tmpdir(), 'claude-unused-data-dir');

  try {
    mkdirSync(SERVER_PUBLIC_UPLOADS_DIR, { recursive: true });
    writeFileSync(uploadPath, Buffer.from('server-public-image'));

    const content = __testables.buildClaudeUserMessageContent('detect image', __testables.buildClaudeAttachmentContext([
      {
        name: 'claude-runtime-test.png',
        path: '/static/uploads/claude-runtime-test.png',
        url: '/static/uploads/claude-runtime-test.png',
        type: 'image/png',
      },
    ]));

    assert.deepEqual(content, [
      { type: 'text', text: 'detect image' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: Buffer.from('server-public-image').toString('base64'),
        },
      },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(uploadPath, { force: true });
  }
});

test('buildClaudeUserMessageContent converts pdf attachments into document blocks', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'claude-pdf-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const uploadsDir = join(dataDir, 'public', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'sample.pdf'), Buffer.from('%PDF-demo'));

    const content = __testables.buildClaudeUserMessageContent('summary pdf', __testables.buildClaudeAttachmentContext([
      {
        name: 'sample.pdf',
        path: '/static/uploads/sample.pdf',
        url: '/static/uploads/sample.pdf',
        type: 'application/pdf',
      },
    ]));

    assert.deepEqual(content, [
      { type: 'text', text: 'summary pdf' },
      {
        type: 'document',
        title: 'sample.pdf',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: Buffer.from('%PDF-demo').toString('base64'),
        },
      },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('buildClaudeUserMessageContent converts plain text attachments into document blocks', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'claude-text-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const uploadsDir = join(dataDir, 'public', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'notes.txt'), 'line1\nline2', 'utf-8');

    const content = __testables.buildClaudeUserMessageContent('read text file', __testables.buildClaudeAttachmentContext([
      {
        name: 'notes.txt',
        path: '/static/uploads/notes.txt',
        url: '/static/uploads/notes.txt',
        type: 'text/plain',
      },
    ]));

    assert.deepEqual(content, [
      { type: 'text', text: 'read text file' },
      {
        type: 'document',
        title: 'notes.txt',
        source: {
          type: 'text',
          media_type: 'text/plain',
          data: 'line1\nline2',
        },
      },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('buildClaudeAttachmentContext reports ignored unsupported attachments', () => {
  const context = __testables.buildClaudeAttachmentContext([
    {
      name: 'archive.zip',
      path: '/static/uploads/archive.zip',
      url: '/static/uploads/archive.zip',
      type: 'application/zip',
    },
  ]);

  assert.equal(context.supportedCount, 0);
  assert.equal(context.ignoredCount, 1);
  assert.match(context.debugLines[0] ?? '', /ignored/);
});

test('buildClaudeUserMessageContent converts json attachments into document blocks', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'claude-json-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const uploadsDir = join(dataDir, 'public', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'data.json'), '{"ok":true}', 'utf-8');

    const content = __testables.buildClaudeUserMessageContent('read json file', __testables.buildClaudeAttachmentContext([
      {
        name: 'data.json',
        path: '/static/uploads/data.json',
        url: '/static/uploads/data.json',
        type: 'application/json',
      },
    ]));

    assert.deepEqual(content, [
      { type: 'text', text: 'read json file' },
      {
        type: 'document',
        title: 'data.json',
        source: {
          type: 'text',
          media_type: 'text/plain',
          data: '{"ok":true}',
        },
      },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('buildAttachmentDebugReasoning exposes ignored attachment diagnostics', () => {
  const previousDebug = process.env.AGENT_SPACES_DEBUG_ATTACHMENTS;
  delete process.env.AGENT_SPACES_DEBUG_ATTACHMENTS;

  try {
    const text = __testables.buildAttachmentDebugReasoning({
      parts: [],
      supportedCount: 0,
      ignoredCount: 1,
      summary: '',
      debugLines: ['ignored name=archive.zip type=application/zip reason=unsupported-mime'],
    }, 1);

    assert.match(text ?? '', /\[AttachmentContext\] total=1 supported=0 ignored=1/);
    assert.match(text ?? '', /archive\.zip/);
  } finally {
    if (previousDebug === undefined) delete process.env.AGENT_SPACES_DEBUG_ATTACHMENTS;
    else process.env.AGENT_SPACES_DEBUG_ATTACHMENTS = previousDebug;
  }
});
