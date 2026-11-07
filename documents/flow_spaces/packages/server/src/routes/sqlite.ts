import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as store from '../storage/sqlite-store.js';
import { validateIdentifier } from '../storage/sql-safety.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  workflowIds: z.array(z.string()).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  workflowIds: z.array(z.string()).optional(),
});
const sqlSchema = z.object({
  sql: z.string().min(1),
  params: z.union([z.array(z.any()), z.record(z.string(), z.any())]).optional(),
});

// GET /api/sqlite/databases?workflowId=
router.get('/databases', (req: Request, res: Response) => {
  res.json(store.listDatabases(typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined));
});

// POST /api/sqlite/databases
router.post('/databases', (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try { res.json(store.createDatabase(parsed.data)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// PATCH /api/sqlite/databases/:id
router.patch('/databases/:id', (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const meta = store.updateDatabase(req.params.id as string, parsed.data);
  if (!meta) { res.status(404).json({ error: 'Database not found' }); return; }
  res.json(meta);
});

// DELETE /api/sqlite/databases/:id
router.delete('/databases/:id', (req: Request, res: Response) => {
  if (!store.deleteDatabase(req.params.id as string)) { res.status(404).json({ error: 'Database not found' }); return; }
  res.json({ ok: true });
});

// GET /api/sqlite/databases/:id/tables
router.get('/databases/:id/tables', (req: Request, res: Response) => {
  try { res.json(store.listTables(req.params.id as string)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/sqlite/databases/:id/tables/:table/columns
router.get('/databases/:id/tables/:table/columns', (req: Request, res: Response) => {
  try {
    validateIdentifier(req.params.table as string, 'table');
    res.json(store.describeTable(req.params.id as string, req.params.table as string));
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// POST /api/sqlite/databases/:id/query
router.post('/databases/:id/query', (req: Request, res: Response) => {
  const parsed = sqlSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try { res.json(store.query(req.params.id as string, parsed.data.sql, parsed.data.params)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// POST /api/sqlite/databases/:id/exec
router.post('/databases/:id/exec', (req: Request, res: Response) => {
  const parsed = sqlSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try { res.json(store.exec(req.params.id as string, parsed.data.sql, parsed.data.params)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

export default router;
