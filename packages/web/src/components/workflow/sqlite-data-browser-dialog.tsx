'use client';

import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Table2, Trash2, Plus, GripVertical } from 'lucide-react';
import { ResultTable } from '@/components/table/result-table';
import type { SqliteTableInfo, SqliteQueryResult } from '@agent-spaces/shared';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS = ['TEXT', 'INTEGER', 'REAL', 'NUMERIC', 'BLOB', 'BOOLEAN', 'DATETIME'];
const NEW_TABLE = '__new__';
// 字段描述无法存进 SQLite 列定义（PRAGMA 读不到），单独用元数据表持久化
const META_TABLE = '__sqlite_field_meta__';
const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;

interface FieldDef {
  id: string;
  name: string;
  description: string;
  type: string;
  indexed: boolean;
  required: boolean;
}

let fieldSeq = 0;
const newField = (): FieldDef => ({
  id: `f${++fieldSeq}`,
  name: '',
  description: '',
  type: 'TEXT',
  indexed: false,
  required: false,
});

function SortableRow({ id, children }: {
  id: string;
  children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
}) {
  const sortable = useSortable({ id });
  const { setNodeRef, transform, transition, isDragging } = sortable;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <TableRow ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-70')}>
      {children(sortable)}
    </TableRow>
  );
}

export function SqliteDataBrowserDialog({ databaseId, onClose }: {
  databaseId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [tables, setTables] = useState<SqliteTableInfo[]>([]);

  // 表结构 tab
  const [schemaTable, setSchemaTable] = useState<string>('');
  const [tableName, setTableName] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaMsg, setSchemaMsg] = useState<string | null>(null);

  // 数据列表 tab
  const [dataTable, setDataTable] = useState<string>('');
  const [result, setResult] = useState<SqliteQueryResult | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    try {
      const all = await sdk.sqlite.listTables(databaseId);
      setTables(all.filter((tb) => tb.name !== META_TABLE));
    } catch { setTables([]); }
  }, [databaseId]);

  useEffect(() => { loadTables(); }, [loadTables]);

  const loadDescriptions = useCallback(async (table: string): Promise<Record<string, string>> => {
    try {
      const r = await sdk.sqlite.query(
        databaseId,
        `SELECT "column", "description" FROM "${META_TABLE}" WHERE "table" = ?`,
        [table],
      );
      const m: Record<string, string> = {};
      for (const row of r.rows) m[String(row.column)] = String(row.description ?? '');
      return m;
    } catch { return {}; }
  }, [databaseId]);

  const loadIndexedColumns = useCallback(async (table: string): Promise<Set<string>> => {
    try {
      const indexes = await sdk.sqlite.query(databaseId, `PRAGMA index_list(${quoteIdent(table)})`);
      const columns = new Set<string>();
      for (const index of indexes.rows) {
        const indexName = String(index.name ?? '');
        if (!indexName) continue;
        const info = await sdk.sqlite.query(databaseId, `PRAGMA index_info(${quoteIdent(indexName)})`);
        for (const row of info.rows) {
          const columnName = String(row.name ?? '');
          if (columnName) columns.add(columnName);
        }
      }
      return columns;
    } catch { return new Set(); }
  }, [databaseId]);

  const loadSchema = useCallback(async (name: string) => {
    setSchemaError(null);
    setSchemaMsg(null);
    if (!name) { setFields([]); return; }
    setSchemaLoading(true);
    try {
      const [cols, descMap, indexedColumns] = await Promise.all([
        sdk.sqlite.describeTable(databaseId, name),
        loadDescriptions(name),
        loadIndexedColumns(name),
      ]);
      setFields(cols.map((c) => ({
        id: `f${++fieldSeq}`,
        name: c.name,
        description: c.description || descMap[c.name] || '',
        type: (c.type || 'TEXT').toUpperCase(),
        indexed: c.indexed ?? indexedColumns.has(c.name),
        required: c.notNull,
      })));
    } catch (e) { setSchemaError((e as Error).message); setFields([]); }
    finally { setSchemaLoading(false); }
  }, [databaseId, loadDescriptions, loadIndexedColumns]);

  const browseData = useCallback(async (name: string) => {
    setResult(null);
    setDataError(null);
    if (!name) return;
    setDataLoading(true);
    try { setResult(await sdk.sqlite.query(databaseId, `SELECT * FROM "${name}" LIMIT ?`, [100])); }
    catch (e) { setDataError((e as Error).message); }
    finally { setDataLoading(false); }
  }, [databaseId]);

  const updateField = (id: string, patch: Partial<FieldDef>) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const removeField = (id: string) => setFields((fs) => fs.filter((f) => f.id !== id));
  const addField = () => setFields((fs) => [...fs, newField()]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setFields(arrayMove(fields, oldIndex, newIndex));
  };

  const targetTable = schemaTable === NEW_TABLE ? tableName.trim() : schemaTable;

  const applySchema = async () => {
    setSchemaError(null);
    setSchemaMsg(null);
    const valid = fields.filter((f) => f.name.trim());
    if (!targetTable) { setSchemaError(t('sqlite.tableRequired')); return; }
    if (valid.length === 0) { setSchemaError(t('sqlite.noFields')); return; }

    const exists = tables.some((tb) => tb.name === targetTable);
    if (exists && !window.confirm(t('sqlite.confirmRebuild'))) return;

    setSchemaLoading(true);
    try {
      if (exists) await sdk.sqlite.exec(databaseId, `DROP TABLE IF EXISTS "${targetTable}"`);
      const blocks = valid.map((f) => {
        let def = `"${f.name}" ${f.type || 'TEXT'}`;
        if (f.required) def += ' NOT NULL';
        return def;
      });
      await sdk.sqlite.exec(databaseId, `CREATE TABLE "${targetTable}" (\n  ${blocks.join(',\n  ')}\n)`);
      // 字段描述写入元数据表（参数化绑定，避免注入）
      await sdk.sqlite.exec(
        databaseId,
        `CREATE TABLE IF NOT EXISTS "${META_TABLE}" ("table" TEXT NOT NULL, "column" TEXT NOT NULL, "description" TEXT, PRIMARY KEY ("table","column"))`,
      );
      await sdk.sqlite.exec(databaseId, `DELETE FROM "${META_TABLE}" WHERE "table" = ?`, [targetTable]);
      for (const f of valid) {
        await sdk.sqlite.exec(
          databaseId,
          `INSERT OR REPLACE INTO "${META_TABLE}" ("table","column","description") VALUES (?,?,?)`,
          [targetTable, f.name, f.description],
        );
      }
      for (const f of valid) {
        if (f.indexed) {
          await sdk.sqlite.exec(
            databaseId,
            `CREATE INDEX IF NOT EXISTS ${quoteIdent(`idx_${targetTable}_${f.name}`)} ON ${quoteIdent(targetTable)}(${quoteIdent(f.name)})`,
          );
        }
      }
      setSchemaMsg(t('sqlite.schemaApplied'));
      await loadTables();
      if (schemaTable === NEW_TABLE) { setSchemaTable(targetTable); setTableName(''); }
    } catch (e) { setSchemaError((e as Error).message); }
    finally { setSchemaLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!flex !h-[80vh] !w-[80vw] !max-w-[80vw] !flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="size-4" />{t('sqlite.browserTitle')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="schema" className="flex min-h-0 flex-1 flex-col gap-2">
          <TabsList className="w-fit">
            <TabsTrigger value="schema">{t('sqlite.tabSchema')}</TabsTrigger>
            <TabsTrigger value="data">{t('sqlite.tabData')}</TabsTrigger>
          </TabsList>

          {/* 表结构 */}
          <TabsContent value="schema" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={schemaTable || undefined}
                onValueChange={(v) => {
                  const val = v ?? '';
                  setSchemaTable(val);
                  setSchemaMsg(null);
                  if (val === NEW_TABLE) setFields([newField()]);
                  else loadSchema(val);
                }}
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue placeholder={t('sqlite.selectTable')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_TABLE}>+ {t('sqlite.newTable')}</SelectItem>
                  {tables.map((tb) => (
                    <SelectItem key={tb.name} value={tb.name}>{tb.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {schemaTable === NEW_TABLE && (
                <Input
                  className="h-7 w-40 text-xs"
                  placeholder={t('sqlite.tableName')}
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                />
              )}

              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={applySchema}
                disabled={schemaLoading || !targetTable}
              >
                {t('sqlite.applySchema')}
              </Button>

              {schemaError && <span className="text-xs text-destructive">{schemaError}</span>}
              {schemaMsg && <span className="text-xs text-muted-foreground">{schemaMsg}</span>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="w-44">{t('sqlite.fieldName')}</TableHead>
                    <TableHead>{t('sqlite.description')}</TableHead>
                    <TableHead className="w-36">{t('sqlite.dataType')}</TableHead>
                    <TableHead className="w-20 text-center">{t('sqlite.indexed')}</TableHead>
                    <TableHead className="w-20 text-center">{t('sqlite.required')}</TableHead>
                    <TableHead className="w-12 text-center">{t('sqlite.action')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                      {fields.map((f) => {
                        const opts = TYPE_OPTIONS.includes(f.type) ? TYPE_OPTIONS : [f.type, ...TYPE_OPTIONS];
                        return (
                          <SortableRow key={f.id} id={f.id}>
                            {({ attributes, listeners }) => (
                              <>
                                <TableCell className="w-8">
                                  <button
                                    type="button"
                                    {...attributes}
                                    {...listeners}
                                    className="flex size-5 cursor-grab touch-none items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
                                  >
                                    <GripVertical className="size-3.5" />
                                  </button>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-7 text-xs"
                                    value={f.name}
                                    onChange={(e) => updateField(f.id, { name: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-7 text-xs"
                                    value={f.description}
                                    onChange={(e) => updateField(f.id, { description: e.target.value })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select value={f.type} onValueChange={(v) => updateField(f.id, { type: v ?? 'TEXT' })}>
                                    <SelectTrigger size="sm" className="h-7 w-full text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {opts.map((tp) => (
                                        <SelectItem key={tp} value={tp}>{tp}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-center">
                                    <Checkbox
                                      checked={f.indexed}
                                      onCheckedChange={(v) => updateField(f.id, { indexed: !!v })}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-center">
                                    <Switch
                                      size="sm"
                                      checked={f.required}
                                      onCheckedChange={(v) => updateField(f.id, { required: !!v })}
                                    />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-center">
                                    <button
                                      className="text-muted-foreground transition-colors hover:text-destructive"
                                      onClick={() => removeField(f.id)}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                </TableCell>
                              </>
                            )}
                          </SortableRow>
                        );
                      })}
                    </SortableContext>
                  </DndContext>

                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <button
                        className="flex w-full items-center justify-center gap-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        onClick={addField}
                      >
                        <Plus className="size-3.5" />{t('sqlite.addField')}
                      </button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* 数据列表 */}
          <TabsContent value="data" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Select
                value={dataTable || undefined}
                onValueChange={(v) => { const val = v ?? ''; setDataTable(val); browseData(val); }}
              >
                <SelectTrigger size="sm" className="w-60">
                  <SelectValue placeholder={t('sqlite.selectTable')} />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((tb) => (
                    <SelectItem key={tb.name} value={tb.name}>
                      {tb.name} <span className="text-muted-foreground">({tb.rowCount})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <ResultTable result={result} isLoading={dataLoading} error={dataError} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
