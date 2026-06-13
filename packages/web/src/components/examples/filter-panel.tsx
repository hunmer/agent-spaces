"use client"

import {
  BuildingIcon,
  FunnelXIcon,
  ListFilterIcon,
  MailIcon,
  MapPinIcon,
  UserIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Filters,
  type Filter,
  type FilterFieldConfig,
} from "@/components/reui/filters"

// Helper to check if a filter has meaningful values
export const getActiveFilters = (filters: Filter[]) => {
  return filters.filter((filter) => {
    const { values } = filter

    // Check if filter has meaningful values
    if (!values || values.length === 0) return false

    // For text/string values, check if they're not empty strings
    if (
      values.every((value) => typeof value === "string" && value.trim() === "")
    )
      return false

    // For number values, check if they're not null/undefined
    if (values.every((value) => value === null || value === undefined))
      return false

    // For arrays, check if they're not empty
    if (values.every((value) => Array.isArray(value) && value.length === 0))
      return false

    return true
  })
}

// Filter field configurations
const fields: FilterFieldConfig[] = [
  {
    key: "name",
    label: "Name",
    icon: <UserIcon className="size-3.5" />,
    type: "text",
    className: "w-40",
    placeholder: "Search names...",
  },
  {
    key: "email",
    label: "Email",
    icon: <MailIcon className="size-3.5" />,
    type: "text",
    className: "w-48",
    placeholder: "user@example.com",
  },
  {
    key: "company",
    label: "Company",
    icon: <BuildingIcon className="size-3.5" />,
    type: "select",
    searchable: true,
    className: "w-[180px]",
    options: [
      { value: "Apple", label: "Apple" },
      { value: "OpenAI", label: "OpenAI" },
      { value: "Meta", label: "Meta" },
      { value: "Tesla", label: "Tesla" },
      { value: "SAP", label: "SAP" },
      { value: "Keenthemes", label: "Keenthemes" },
      { value: "BBVA", label: "BBVA" },
      { value: "Sony", label: "Sony" },
      { value: "LVMH", label: "LVMH" },
      { value: "ENI", label: "ENI" },
      { value: "Vale", label: "Vale" },
      { value: "Tata", label: "Tata" },
    ],
  },
  {
    key: "role",
    label: "Role",
    icon: <UserIcon className="size-3.5" />,
    type: "select",
    searchable: true,
    className: "w-[160px]",
    options: [
      { value: "CEO", label: "CEO" },
      { value: "CTO", label: "CTO" },
      { value: "Designer", label: "Designer" },
      { value: "Developer", label: "Developer" },
      { value: "Lawyer", label: "Lawyer" },
      { value: "Director", label: "Director" },
      { value: "Product Manager", label: "Product Manager" },
      { value: "Marketing Lead", label: "Marketing Lead" },
      { value: "Data Scientist", label: "Data Scientist" },
      { value: "Engineer", label: "Engineer" },
      { value: "Software Engineer", label: "Software Engineer" },
      { value: "Sales Manager", label: "Sales Manager" },
    ],
  },
  {
    key: "status",
    label: "Status",
    icon: <UserIcon className="size-3.5" />,
    type: "select",
    searchable: false,
    className: "w-[140px]",
    options: [
      {
        value: "active",
        label: "Active",
        icon: <div className="size-2 rounded-full bg-green-500"></div>,
      },
      {
        value: "inactive",
        label: "Inactive",
        icon: <div className="bg-destructive size-2 rounded-full"></div>,
      },
      {
        value: "archived",
        label: "Archived",
        icon: <div className="size-2 rounded-full bg-zinc-400"></div>,
      },
    ],
  },
  {
    key: "availability",
    label: "Availability",
    icon: <UserIcon className="size-3.5" />,
    type: "select",
    searchable: false,
    className: "w-[160px]",
    options: [
      {
        value: "online",
        label: "Online",
        icon: (
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-green-500" />
            <span>Online</span>
          </div>
        ),
      },
      {
        value: "away",
        label: "Away",
        icon: (
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-yellow-500" />
            <span>Away</span>
          </div>
        ),
      },
      {
        value: "busy",
        label: "Busy",
        icon: (
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-red-500" />
            <span>Busy</span>
          </div>
        ),
      },
      {
        value: "offline",
        label: "Offline",
        icon: (
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-gray-400" />
            <span>Offline</span>
          </div>
        ),
      },
    ],
  },
  {
    key: "location",
    label: "Location",
    icon: <MapPinIcon className="size-3.5" />,
    type: "text",
    className: "w-40",
    placeholder: "Search locations...",
  },
]

export interface FilterPanelProps {
  filters: Filter[]
  onFiltersChange: (filters: Filter[]) => void
  onClear: () => void
  isLoading?: boolean
}

/**
 * FilterPanel — 筛选器面板。
 *
 * 从 c-filters-7 的 Filters 区抽离而来，自包含筛选字段配置，
 * 仅把当前 `filters`、变化回调与清空回调交给容器，便于和外部数据源组合。
 */
export function FilterPanel({
  filters,
  onFiltersChange,
  onClear,
  isLoading = false,
}: FilterPanelProps) {
  return (
    <div className="mb-3.5 flex items-start gap-2.5">
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
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={isLoading}
        >
          <FunnelXIcon />
          Clear
        </Button>
      )}
    </div>
  )
}
