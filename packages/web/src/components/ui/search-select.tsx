"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, Plus } from "lucide-react";

export interface SearchSelectOption {
  value: string;
  label?: string;
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
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = options.filter((o) =>
    (o.label ?? o.value).toLowerCase().includes(query.toLowerCase()),
  );
  const exactMatch = options.some(
    (o) => o.value.toLowerCase() === query.toLowerCase(),
  );
  const selected = options.find((o) => o.value === value);
  const isCustom = value && !options.some((o) => o.value === value);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

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
              <span className={cn("truncate", !value && "text-muted-foreground")}>
                {selected ? (selected.label ?? selected.value) : isCustom ? value : placeholder}
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
                select(query.trim());
              }
            }}
            autoFocus
          />
          <div className="mt-1 max-h-48 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50",
                  value === o.value && "bg-muted",
                )}
                onClick={() => select(o.value)}
              >
                <Check
                  className={cn(
                    "size-3 shrink-0",
                    value === o.value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{o.label ?? o.value}</span>
              </button>
            ))}
            {allowCustom && query.trim() && !exactMatch && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-primary hover:bg-muted/50 cursor-pointer"
                onClick={() => select(query.trim())}
              >
                <Plus className="size-3 shrink-0" />
                <span className="truncate">Use &quot;{query.trim()}&quot;</span>
              </button>
            )}
            {!filtered.length && !query.trim() && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No results</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
