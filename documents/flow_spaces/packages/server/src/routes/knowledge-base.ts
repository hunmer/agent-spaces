import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as store from '../storage/knowledge-base-store.js';
import * as kbService from '../services/knowledge-base.js';
import { getDataDir } from '../storage/json-store.js';
import { resolve } from 'node:path';

const router = Router({ mergeParams: true });
// memoryStorage:文件内容留在内存 buffer,交给 service 写入 kb 存储目录(与 app.ts/data.ts 一致)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const wid = (req: Request): string => req.params.id as string;

// 把 path 来源解析为绝对路径并校验落在 dataDir 之下，防越界
function safePath(sourceRef: string): string {
  const root = getDataDir();
  const abs = resolve(root, sourceRef);
  if (!abs.startsWith(root)) throw new Error('文件路径越界');
  return abs;
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  chunkSize: z.number().int().min(100).optional(),
  chunkOverlap: z.number().int().min(0).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  embeddingModelId: z.string().nullable().optional(),
  chunkSize: z.number().int().min(100).optional(),
  chunkOverlap: z.number().int().min(0).optional(),
});
const addFileSchema = z.object({
  sourceType: z.enum(['path', 'url']),
  sourceRef: z.string().min(1),
  fileName: z.string().min(1),
});
const querySchema = z.object({ query: z.string().min(1), topK: z.number().int().min(1).max(20).optional() });
const bindModelSchema = z.object({ embeddingModelId: z.string().nullable() });

// KB CRUD（挂载在 /api/workspaces/:id/knowledge-bases）
router.get('/', (req, res) => res.json(store.listKbs(wid(req))));

router.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  res.status(201).json(store.createKb(wid(req), parsed.data));
});

router.put('/:kbId', (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (!store.getKb(wid(req), req.params.kbId)) return res.status(404).json({ error: 'Not found' });
  store.updateKb(wid(req), req.params.kbId, parsed.data);
  res.json(store.getKb(wid(req), req.params.kbId));
});

router.delete('/:kbId', (req, res) => {
  if (!store.getKb(wid(req), req.params.kbId)) return res.status(404).json({ error: 'Not found' });
  store.deleteKb(wid(req), req.params.kbId);
  res.json({ ok: true });
});

router.get('/:kbId/stats', (req, res) => {
  try { res.json(kbService.getStats(wid(req), req.params.kbId)); }
  catch (e) { res.status(404).json({ error: (e as Error).message }); }
});

router.put('/:kbId/embedding-model', (req, res) => {
  const parsed = bindModelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  if (!store.getKb(wid(req), req.params.kbId)) return res.status(404).json({ error: 'Not found' });
  store.updateKb(wid(req), req.params.kbId, { embeddingModelId: parsed.data.embeddingModelId });
  res.json(store.getKb(wid(req), req.params.kbId));
});

// Files
router.get('/:kbId/files', (req, res) => res.json(store.listFiles(wid(req), req.params.kbId)));

router.post('/:kbId/files', upload.single('file'), async (req: Request<{ id: string; kbId: string }>, res: Response) => {
  const kbId = req.params.kbId;
  if (!store.getKb(wid(req), kbId)) return res.status(404).json({ error: 'Not found' });

  // multipart 上传分支:详情对话框 FileUpload 拖拽上传(buffer 来自 memoryStorage)
  if (req.file) {
    try {
      const file = await kbService.addFileToKnowledgeBase(wid(req), kbId, {
        sourceType: 'upload', sourceRef: req.file.originalname,
        fileName: req.file.originalname, buffer: req.file.buffer,
      }, { background: true });
      return res.status(201).json(file);
    } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
  }

  // JSON path/url 分支
  const parsed = addFileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const sourceRef = parsed.data.sourceType === 'path' ? safePath(parsed.data.sourceRef) : parsed.data.sourceRef;
    // 详情对话框 fire-and-forget:立即返回 pending,后台索引,前端 2s 轮询状态流转
    const file = await kbService.addFileToKnowledgeBase(wid(req), kbId, {
      sourceType: parsed.data.sourceType, sourceRef, fileName: parsed.data.fileName,
    }, { background: true });
    res.status(201).json(file);
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

router.get('/:kbId/files/:fileId', (req, res) => {
  const f = store.getFile(wid(req), req.params.kbId, req.params.fileId);
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json(f);
});

router.delete('/:kbId/files/:fileId', (req, res) => {
  try { kbService.deleteFileFromKb(wid(req), req.params.kbId, req.params.fileId); res.json({ ok: true }); }
  catch (e) { res.status(404).json({ error: (e as Error).message }); }
});

router.post('/:kbId/files/:fileId/reindex', async (req, res) => {
  // 详情对话框重试:后台 reindex,立即返回,前端轮询 indexing->indexed/failed
  try { res.json(await kbService.reindexFile(wid(req), req.params.kbId, req.params.fileId, { background: true })); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

router.post('/:kbId/query', async (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try { res.json(await kbService.queryKnowledgeBase(wid(req), req.params.kbId, parsed.data.query, parsed.data.topK)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

export default router;
