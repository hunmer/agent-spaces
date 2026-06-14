"use client"

import { FunnelXIcon, ListFilterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Filters,
  type Filter,
  type FilterFieldConfig,
} from "@/components/reui/filters"

// 只保留有实际值的筛选条件
export const getActiveFilters = (filters: Filter[]) =>
  filters.filter((filter) => {
    const { values } = filter
    if (!values || values.length === 0) return false
    if (values.every((v) => typeof v === "string" && v.trim() === "")) return false
    if (values.every((v) => v === null || v === undefined)) return false
    if (values.every((v) => Array.isArray(v) && v.length === 0)) return false
    return true
  })

function asString(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "object") return JSON.stringify(raw)
  return String(raw)
}

// 单元格匹配单个筛选条件（文本运算符，大小写不敏感）
function matchFilter(raw: unknown, filter: Filter): boolean {
  const isEmpty = raw == null || (typeof raw === "string" && raw.trim() === "")
  const cell = asString(raw).toLowerCase()
  const term = asString(filter.values[0]).toLowerCase()
  switch (filter.operator) {
    case "empty":
      return isEmpty
    case "not_empty":
      return !isEmpty
    case "is":
      return cell === term
    case "is_not":
      return cell !== term
    case "contains":
      return !isEmpty && cell.includes(term)
    case "not_contains":
      return isEmpty || !cell.includes(term)
    case "starts_with":
      return !isEmpty && cell.startsWith(term)
    case "ends_with":
      return !isEmpty && cell.endsWith(term)
    default:
      return true
  }
}

// 行匹配全部筛选条件（AND 语义）
export const applyFilters = <T extends Record<string, unknown>>(
  row: T,
  filters: Filter[]
): boolean => filters.every((f) => matchFilter(row[f.field], f))

export interface FilterPanelProps {
  fields: FilterFieldConfig[]
  filters: Filter[]
  onFiltersChange: (filters: Filter[]) => void
  onClear: () => void
  isLoading?: boolean
  clearLabel?: string
}

/**
 * FilterPanel — 筛选器面板。
 *
 * 字段配置由调用方传入（`fields`），自身只负责渲染 `Filters` 与「清除」按钮，
 * 并把当前 `filters` / 变化回调 / 清空回调交给容器。
 * 配合 `getActiveFilters` / `applyFilters` 即可与任意数据源组合。
 */
export function FilterPanel({
  fields,
  filters,
  onFiltersChange,
  onClear,
  isLoading = false,
  clearLabel = "Clear",
}: FilterPanelProps) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-1">
        <Filters
          filters={filters}
          fields={fields}
          onChange={onFiltersChange}
          size="sm"
          trigger={
            <Button variant="outline" size="icon-sm">
              <ListFilterIcon />
            </Button>
          }
        />
      </div>
      {filters.length > 0 && (
        <Button variant="outline" size="sm" onClick={onClear} disabled={isLoading}>
          <FunnelXIcon />
          {clearLabel}
        </Button>
      )}
    </div>
  )
}
