'use client';

import { useState, useEffect, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Table2, Trash2, Plus, GripVertical, Code2, Play, AlertCircle } from 'lucide-react';
import { SortableTable } from '@/components/table/sortable-table';
import { FilterPanel, getActiveFilters, applyFilters } from '@/components/table/filter-panel';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import type { Filter, FilterFieldConfig } from '@/components/reui/filters';
import { Skeleton } from '@/components/ui/skeleton';
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
const DATA_LIMIT = 100;

// 转义 LIKE 通配符，保证「包含」等语义与本地子串匹配一致
const escapeLike = (s: string) => s.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

// 把筛选条件编译成 SELECT ... WHERE ... LIMIT 的参数化 SQL（服务端过滤）
function buildSelect(table: string, filters: Filter[]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];
  for (const f of getActiveFilters(filters)) {
    const ident = quoteIdent(f.field);
    const col = `CAST(${ident} AS TEXT)`;
    const term = typeof f.values[0] === 'string' ? f.values[0] : String(f.values[0] ?? '');
    switch (f.operator) {
      case 'empty':
        clauses.push(`(${ident} IS NULL OR ${col} = '')`);
        break;
      case 'not_empty':
        clauses.push(`(${ident} IS NOT NULL AND ${col} != '')`);
        break;
      case 'is':
        clauses.push(`${col} = ?`); params.push(term); break;
      case 'is_not':
        clauses.push(`${col} != ?`); params.push(term); break;
      case 'contains':
        clauses.push(`${col} LIKE ? ESCAPE '\\'`); params.push(`%${escapeLike(term)}%`); break;
      case 'not_contains':
        clauses.push(`(${ident} IS NULL OR ${col} NOT LIKE ? ESCAPE '\\')`); params.push(`%${escapeLike(term)}%`); break;
      case 'starts_with':
        clauses.push(`${col} LIKE ? ESCAPE '\\'`); params.push(`${escapeLike(term)}%`); break;
      case 'ends_with':
        clauses.push(`${col} LIKE ? ESCAPE '\\'`); params.push(`%${escapeLike(term)}`); break;
    }
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  return { sql: `SELECT rowid AS __rowid__, * FROM ${quoteIdent(table)}${where} LIMIT ?`, params: [...params, DATA_LIMIT] };
}

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

type ResultRow = Record<string, unknown>;

function renderCell(v: unknown): ReactNode {
  if (v == null) return <span className="text-muted-foreground/50">NULL</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface ResultDataPanelProps {
  result: SqliteQueryResult | null;
  isLoading?: boolean;
  error?: string | null;
  onDelete?: (row: ResultRow) => void;
  className?: string;
  // 受控筛选（服务端过滤）：传入后筛选条件由外部持有，面板不在本地过滤、也不在结果变化时清空
  filters?: Filter[];
  onFiltersChange?: (filters: Filter[]) => void;
}

// 结果数据面板：FilterPanel + SortableTable，列与筛选字段都按查询结果动态生成
function ResultDataPanel({
  result,
  isLoading = false,
  error = null,
  onDelete,
  className,
  filters: controlledFilters,
  onFiltersChange,
}: ResultDataPanelProps) {
  const t = useTranslations();
  const controlled = onFiltersChange !== undefined;
  const [localFilters, setLocalFilters] = useState<Filter[]>([]);
  const filters = controlled ? (controlledFilters ?? []) : localFilters;
  const handleFiltersChange = controlled ? onFiltersChange! : setLocalFilters;

  const rows = useMemo<ResultRow[]>(() => (result?.rows ?? []) as ResultRow[], [result]);

  // 仅本地（非受控）模式：结果集变化时清空筛选；受控模式由父组件决定何时重置
  useEffect(() => { if (!controlled) setLocalFilters([]); }, [result, controlled]);

  const allCols = useMemo(
    () => result?.columns ?? (rows[0] ? Object.keys(rows[0]) : []),
    [result?.columns, rows],
  );
  // 有删除操作时隐藏内部 rowid 列
  const visibleCols = useMemo(
    () => (onDelete ? allCols.filter((k) => k !== '__rowid__') : allCols),
    [allCols, onDelete],
  );

  const columns = useMemo<ColumnDef<ResultRow>[]>(() => {
    const built: ColumnDef<ResultRow>[] = visibleCols.map((key) => ({
      accessorKey: key,
      id: key,
      header: ({ column }) => <DataGridColumnHeader title={key} column={column} />,
      cell: ({ row }) => renderCell(row.original[key]),
      enableSorting: true,
    }));
    if (onDelete) {
      built.push({
        id: '__delete',
        header: '',
        enableSorting: false,
        size: 40,
        cell: ({ row }) => (
          <button
            type="button"
            className="flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
            onClick={() => onDelete(row.original)}
          >
            <Trash2 className="size-3.5" />
          </button>
        ),
      });
    }
    return built;
  }, [visibleCols, onDelete]);

  const filterFields = useMemo<FilterFieldConfig[]>(
    () => visibleCols.map((key) => ({ key, label: key, type: 'text', className: 'w-40', placeholder: t('sqlite.searchColumn') })),
    [visibleCols, t],
  );

  // 受控模式直接渲染服务端已过滤的结果；本地模式才在客户端再过滤
  const activeFilters = getActiveFilters(filters);
  const filteredRows = useMemo(
    () => (controlled || activeFilters.length === 0 ? rows : rows.filter((row) => applyFilters(row, activeFilters))),
    [rows, activeFilters, controlled],
  );

  // 查询完成就展示筛选条；过滤到 0 行时也得保留入口，否则用户改不了/清不了条件
  const showFilter = !!result && !isLoading && !error && (rows.length > 0 || filters.length > 0);

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex items-center gap-2 p-4 text-sm text-destructive">
        <AlertCircle className="size-4" />{error}
      </div>
    );
  } else if (!result || rows.length === 0) {
    // 有筛选条件 = 被过滤光；否则 = 表本身为空
    const empty = result && filters.length > 0 ? t('sqlite.noMatch') : t('sqlite.emptyResult');
    body = <div className="p-6 text-center text-sm text-muted-foreground">{empty}</div>;
  } else {
    body = (
      <>
        {result.truncated && (
          <div className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
            {t('sqlite.truncated', { n: 10000 })}
          </div>
        )}
        <SortableTable
          data={filteredRows}
          columns={columns}
          getRowId={(row, i) => String(row.__rowid__ ?? i)}
          emptyMessage={t('sqlite.noMatch')}
        />
      </>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {showFilter && (
        <FilterPanel
          fields={filterFields}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClear={() => handleFiltersChange([])}
          clearLabel={t('sqlite.clearFilter')}
        />
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">{body}</div>
    </div>
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
  const [result, setResult] = useState<SqliteQueryResult | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [insertError, setInsertError] = useState<string | null>(null);
  const [insertMsg, setInsertMsg] = useState<string | null>(null);
  // 服务端过滤条件 + 写操作后的本地刷新版本号
  const [dataFilters, setDataFilters] = useState<Filter[]>([]);
  const [dataVersion, setDataVersion] = useState(0);

  // 自定义 SQL
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sqlText, setSqlText] = useState('');
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqliteQueryResult | null>(null);
  const [sqlExec, setSqlExec] = useState<{ changes: number; lastInsertRowid: number | null } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const loadTables = useCallback(async (): Promise<SqliteTableInfo[]> => {
    try {
      const all = (await sdk.sqlite.listTables(databaseId)).filter((tb) => tb.name !== META_TABLE);
      setTables(all);
      return all;
    } catch { setTables([]); return []; }
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

  // 数据查询的唯一入口：表 / 筛选条件 / 写操作版本任一变化即重新向服务端查询
  useEffect(() => {
    if (!schemaTable || schemaTable === NEW_TABLE) { setResult(null); return; }
    let cancelled = false;
    (async () => {
      setResult(null);
      setDataError(null);
      setDataLoading(true);
      try {
        const { sql, params } = buildSelect(schemaTable, dataFilters);
        const r = await sdk.sqlite.query(databaseId, sql, params);
        if (!cancelled) setResult(r);
      } catch (e) { if (!cancelled) setDataError((e as Error).message); }
      finally { if (!cancelled) setDataLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [schemaTable, dataFilters, dataVersion, databaseId]);

  // 打开时自动选中第一个表（数据查询交给上面的查询 effect）
  useEffect(() => {
    if (!schemaTable && tables.length > 0) {
      const first = tables[0].name;
      setSchemaTable(first);
      loadSchema(first);
    }
  }, [tables, schemaTable, loadSchema]);

  // 参照字段表新增行：每个字段一个输入，空值绑 NULL，BOOLEAN 转 0/1
  const insertRow = async () => {
    setInsertError(null);
    setInsertMsg(null);
    const cols = fields.filter((f) => f.name.trim());
    if (!schemaTable || schemaTable === NEW_TABLE) { setInsertError(t('sqlite.tableRequired')); return; }
    if (cols.length === 0) { setInsertError(t('sqlite.noColumns')); return; }
    const values = cols.map((f) => {
      const raw = (newRow[f.name] ?? '').trim();
      if (f.type === 'BOOLEAN') return raw === '' ? null : /^(1|true|yes|on)$/i.test(raw) ? 1 : 0;
      return raw === '' ? null : raw;
    });
    try {
      await sdk.sqlite.exec(
        databaseId,
        `INSERT INTO ${quoteIdent(schemaTable)} (${cols.map((f) => quoteIdent(f.name)).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        values,
      );
      setInsertMsg(t('sqlite.rowInserted'));
      setNewRow({});
      setNewRowOpen(false);
      setDataVersion((v) => v + 1);
      await loadTables();
    } catch (e) { setInsertError((e as Error).message); }
  };

  // 自定义 SQL：读语句走 query，写/DDL 走 exec
  const runSql = async () => {
    setSqlError(null);
    setSqlResult(null);
    setSqlExec(null);
    const stmt = sqlText.trim();
    if (!stmt) return;
    setSqlRunning(true);
    try {
      const isQuery = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(stmt);
      if (isQuery) setSqlResult(await sdk.sqlite.query(databaseId, stmt));
      else setSqlExec(await sdk.sqlite.exec(databaseId, stmt));
      await loadTables(); // DDL/DML 后刷新表列表与行数
    } catch (e) { setSqlError((e as Error).message); }
    finally { setSqlRunning(false); }
  };

  // 删除当前表：DROP + 清理字段元数据，切到第一个表或清空
  const dropTable = async (name: string) => {
    if (!window.confirm(t('sqlite.confirmDrop'))) return;
    setInsertError(null);
    try {
      await sdk.sqlite.exec(databaseId, `DROP TABLE IF EXISTS ${quoteIdent(name)}`);
      await sdk.sqlite.exec(databaseId, `DELETE FROM "${META_TABLE}" WHERE "table" = ?`, [name]);
      const all = await loadTables();
      if (all.length > 0) {
        const first = all[0].name;
        setSchemaTable(first);
        setDataFilters([]);
        loadSchema(first);
      } else {
        setSchemaTable('');
        setFields([]);
        setResult(null);
      }
    } catch (e) { setInsertError((e as Error).message); }
  };

  // 删除单行：用查询带回的 __rowid__ 定位
  const deleteRow = useCallback(async (row: Record<string, unknown>) => {
    if (!schemaTable || schemaTable === NEW_TABLE) return;
    const rowid = row.__rowid__;
    if (rowid == null) { setInsertError(t('sqlite.noRowid')); return; }
    if (!window.confirm(t('sqlite.confirmDeleteRow'))) return;
    setInsertError(null);
    try {
      await sdk.sqlite.exec(databaseId, `DELETE FROM ${quoteIdent(schemaTable)} WHERE rowid = ?`, [rowid]);
      setDataVersion((v) => v + 1);
      await loadTables();
    } catch (e) { setInsertError((e as Error).message); }
  }, [schemaTable, databaseId, loadTables, t]);

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
            <Button variant="outline" size="sm" className="ml-auto h-7 me-5 gap-1 text-xs" onClick={() => setSqlOpen(true)}>
              <Code2 className="size-3.5" />{t('sqlite.runSql')}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="schema" className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <TabsList className="w-fit">
              <TabsTrigger value="schema">{t('sqlite.tabSchema')}</TabsTrigger>
              <TabsTrigger value="data">{t('sqlite.tabData')}</TabsTrigger>
            </TabsList>
            <Select
              value={schemaTable || undefined}
              onValueChange={(v) => {
                const val = v ?? '';
                setSchemaTable(val);
                setDataFilters([]);
                setSchemaMsg(null);
                setNewRow({});
                setNewRowOpen(false);
                setInsertError(null);
                setInsertMsg(null);
                if (val === NEW_TABLE) { setFields([newField()]); setResult(null); }
                else { loadSchema(val); }
              }}
            >
              <SelectTrigger size="sm" className="w-60">
                <SelectValue placeholder={t('sqlite.selectTable')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_TABLE}>+ {t('sqlite.newTable')}</SelectItem>
                {tables.map((tb) => (
                  <SelectItem key={tb.name} value={tb.name}>
                    {tb.name} <span className="text-muted-foreground">({tb.rowCount})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 表结构 */}
          <TabsContent value="schema" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setNewRowOpen((o) => !o); setInsertError(null); setInsertMsg(null); }}
                disabled={!schemaTable || schemaTable === NEW_TABLE}
              >
                <Plus className="size-3.5" />{t('sqlite.addRow')}
              </Button>
              {insertError && <span className="text-xs text-destructive">{insertError}</span>}
              {insertMsg && <span className="text-xs text-muted-foreground">{insertMsg}</span>}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 text-xs text-destructive hover:text-destructive"
                onClick={() => schemaTable && dropTable(schemaTable)}
                disabled={!schemaTable || schemaTable === NEW_TABLE}
              >
                <Trash2 className="size-3.5" />{t('sqlite.delete')}
              </Button>
            </div>

            {newRowOpen && schemaTable && schemaTable !== NEW_TABLE && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                {fields.filter((f) => f.name.trim()).map((f) => (
                  <div key={f.id} className="flex w-36 flex-col gap-1">
                    <label className="text-xs text-muted-foreground">{f.name}</label>
                    <Input
                      className="h-7 text-xs"
                      placeholder={f.type}
                      value={newRow[f.name] ?? ''}
                      onChange={(e) => setNewRow((r) => ({ ...r, [f.name]: e.target.value }))}
                    />
                  </div>
                ))}
                <Button size="sm" className="h-7 text-xs" onClick={insertRow}>{t('sqlite.insert')}</Button>
              </div>
            )}

            <ResultDataPanel
              result={result}
              isLoading={dataLoading}
              error={dataError}
              onDelete={deleteRow}
              className="min-h-0 flex-1"
              filters={dataFilters}
              onFiltersChange={setDataFilters}
            />
          </TabsContent>
        </Tabs>

        <Dialog open={sqlOpen} onOpenChange={setSqlOpen}>
          <DialogContent className="!flex !h-[70vh] !w-[60vw] !max-w-[60vw] !flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code2 className="size-4" />{t('sqlite.runSql')}
              </DialogTitle>
            </DialogHeader>
            <Textarea
              className="min-h-[100px] resize-none font-mono text-xs"
              placeholder={t('sqlite.sqlPlaceholder')}
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-7 gap-1 text-xs" onClick={runSql} disabled={sqlRunning || !sqlText.trim()}>
                <Play className="size-3.5" />{t('sqlite.run')}
              </Button>
              {sqlError && <span className="text-xs text-destructive">{sqlError}</span>}
              {sqlExec && (
                <span className="text-xs text-muted-foreground">
                  {t('sqlite.execSummary', { changes: sqlExec.changes, id: sqlExec.lastInsertRowid ?? '-' })}
                </span>
              )}
            </div>
            {sqlResult && (
              <ResultDataPanel result={sqlResult} className="min-h-0 flex-1" />
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
