"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ colors = [], value, onChange, className }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCustomClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(value === color ? "" : color)}
          className={cn(
            "size-6 rounded-full border-2 transition-all shrink-0",
            value === color
              ? "border-foreground scale-110 ring-2 ring-foreground/20"
              : "border-transparent hover:scale-105",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      {/* Custom color: last dot with + indicator, opens native picker */}
      <button
        type="button"
        onClick={handleCustomClick}
        className={cn(
          "size-6 rounded-full border-2 border-dashed border-muted-foreground/40 shrink-0 relative flex items-center justify-center transition-all hover:scale-105",
          !colors.includes(value) && value && "border-solid border-foreground scale-110 ring-2 ring-foreground/20",
        )}
        style={!colors.includes(value) && value ? { backgroundColor: value } : undefined}
      >
        {!colors.includes(value) && value ? null : (
          <span className="text-[10px] text-muted-foreground leading-none">+</span>
        )}
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={handleCustomChange}
          className="sr-only"
          tabIndex={-1}
        />
      </button>
    </div>
  );
}
