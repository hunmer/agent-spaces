"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, Plus } from "lucide-react";

export interface SearchSelectOption {
  value: string;
  label?: string;
  description?: string;
  keywords?: string[];
  group?: string;
}

export interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;
  className?: string;
  disabled?: boolean;
  /** 多选模式：value 为逗号拼接的已选值，单击已选项可取消选中 */
  multiple?: boolean;
  /** 显示在触发器 label 前的节点（如图标） */
  triggerPrefix?: ReactNode;
}

interface GroupedOptions {
  ungrouped: SearchSelectOption[];
  groups: { name: string; items: SearchSelectOption[] }[];
}

function groupOptions(options: SearchSelectOption[]): GroupedOptions {
  const ungrouped: SearchSelectOption[] = [];
  const groups: { name: string; items: SearchSelectOption[] }[] = [];
  const index = new Map<string, number>();
  for (const option of options) {
    if (!option.group) {
      ungrouped.push(option);
      continue;
    }
    let groupIndex = index.get(option.group);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      index.set(option.group, groupIndex);
      groups.push({ name: option.group, items: [] });
    }
    groups[groupIndex].items.push(option);
  }
  return { ungrouped, groups };
}

function matchesQuery(option: SearchSelectOption, query: string): boolean {
  return [option.value, option.label ?? "", option.description ?? "", ...(option.keywords ?? [])]
    .join("\n")
    .toLowerCase()
    .includes(query);
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  allowCustom = true,
  className,
  disabled = false,
  multiple = false,
  triggerPrefix,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { ungrouped, groups } = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return groupOptions(options);
    return groupOptions(options.filter((option) => matchesQuery(option, normalizedQuery)));
  }, [options, query]);

  const exactMatch = options.some((option) => option.value.toLowerCase() === query.toLowerCase());
  const selectedValues = useMemo(
    () => (multiple ? value.split(",").map((s) => s.trim()).filter(Boolean) : []),
    [multiple, value],
  );
  const isSelected = (val: string) => (multiple ? selectedValues.includes(val) : value === val);
  const selected = multiple ? undefined : options.find((option) => option.value === value);
  const isCustom = !multiple && value && !options.some((option) => option.value === value);

  const select = (nextValue: string) => {
    onChange(nextValue);
    if (!multiple) {
      setOpen(false);
    }
    setQuery("");
  };

  const toggle = (val: string) => {
    if (!multiple) {
      select(val);
      return;
    }
    const set = new Set(selectedValues);
    if (set.has(val)) {
      set.delete(val);
    } else {
      set.add(val);
    }
    onChange(Array.from(set).join(","));
  };

  const triggerLabel = (() => {
    if (!multiple) {
      return selected ? (selected.label ?? selected.value) : isCustom ? value : placeholder;
    }
    if (selectedValues.length === 0) return placeholder;
    const labels = selectedValues.map(
      (v) => options.find((o) => o.value === v)?.label ?? v,
    );
    return labels.join(", ");
  })();

  const hasGrouped = groups.length > 0;
  const hasUngrouped = ungrouped.length > 0;
  const noResults = !hasUngrouped && !hasGrouped && !(allowCustom && query.trim() && !exactMatch);

  const renderItem = (option: SearchSelectOption) => (
    <button
      key={option.value}
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/50",
        isSelected(option.value) && "bg-muted",
      )}
      onClick={() => (multiple ? toggle(option.value) : select(option.value))}
    >
      <Check
        className={cn(
          "mt-0.5 size-3 shrink-0",
          isSelected(option.value) ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label ?? option.value}</span>
        {option.description ? (
          <span className="block truncate text-[10px] text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
    </button>
  );

  return (
    <div className={className}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none hover:bg-muted/50 focus-visible:border-ring dark:bg-input/30",
                disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {triggerPrefix}
                <span className={cn("truncate", !value && "text-muted-foreground")}>
                  {triggerLabel}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 opacity-50" />
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--anchor-width) min-w-48 gap-0 p-1"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && allowCustom && query.trim()) {
                e.preventDefault();
                if (multiple) {
                  toggle(query.trim());
                  setQuery("");
                } else {
                  select(query.trim());
                }
              }
            }}
            autoFocus
          />
          <div className="mt-1 max-h-64 overflow-y-auto">
            {hasUngrouped && ungrouped.map(renderItem)}

            {hasGrouped && hasUngrouped && <div className="my-1 h-px bg-border" />}

            {hasGrouped && groups.map((group) => (
              <div key={group.name} className="mb-0.5">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.name}
                </div>
                {group.items.map(renderItem)}
              </div>
            ))}

            {allowCustom && query.trim() && !exactMatch && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-primary hover:bg-muted/50"
                onClick={() => (multiple ? toggle(query.trim()) : select(query.trim()))}
              >
                <Plus className="size-3 shrink-0" />
                <span className="truncate">Use &quot;{query.trim()}&quot;</span>
              </button>
            )}
            {noResults && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No results</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
