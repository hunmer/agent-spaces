import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
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

test('buildClaudeUserMessageContent pre-parses docx attachments into document text', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'claude-docx-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const uploadsDir = join(dataDir, 'public', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body>',
      '<w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>',
      '</w:body>',
      '</w:document>',
    ].join(''), 'utf-8'));
    writeFileSync(join(uploadsDir, 'sample.docx'), zip.toBuffer());

    const content = __testables.buildClaudeUserMessageContent('read docx', __testables.buildClaudeAttachmentContext([
      {
        name: 'sample.docx',
        path: '/static/uploads/sample.docx',
        url: '/static/uploads/sample.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ]));

    assert.deepEqual(content, [
      { type: 'text', text: 'read docx' },
      {
        type: 'document',
        title: 'sample.docx',
        source: {
          type: 'text',
          media_type: 'text/plain',
          data: 'First paragraph\n\nSecond paragraph',
        },
      },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('buildClaudeUserMessageContent pre-parses xlsx attachments into document text', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'claude-xlsx-data-'));
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  process.env.AGENT_SPACES_DATA_DIR = dataDir;

  try {
    const uploadsDir = join(dataDir, 'public', 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    const zip = new AdmZip();
    zip.addFile('xl/sharedStrings.xml', Buffer.from([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<si><t>Name</t></si>',
      '<si><t>Alice</t></si>',
      '</sst>',
    ].join(''), 'utf-8'));
    zip.addFile('xl/worksheets/sheet1.xml', Buffer.from([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row>',
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="inlineStr"><is><t>Active</t></is></c></row>',
      '</sheetData></worksheet>',
    ].join(''), 'utf-8'));
    writeFileSync(join(uploadsDir, 'sample.xlsx'), zip.toBuffer());

    const content = __testables.buildClaudeUserMessageContent('read xlsx', __testables.buildClaudeAttachmentContext([
      {
        name: 'sample.xlsx',
        path: '/static/uploads/sample.xlsx',
        url: '/static/uploads/sample.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]));

    assert.deepEqual(content, [
      { type: 'text', text: 'read xlsx' },
      {
        type: 'document',
        title: 'sample.xlsx',
        source: {
          type: 'text',
          media_type: 'text/plain',
          data: 'Sheet 1:\nName | 42\nAlice | Active',
        },
      },
    ]);
  } finally {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
