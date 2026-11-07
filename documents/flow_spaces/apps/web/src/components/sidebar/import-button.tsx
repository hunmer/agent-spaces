'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ImportButtonProps {
  /** Trigger button label (from caller's i18n namespace). */
  label: string;
  /** Dropdown menu body (DropdownMenuItem list). */
  children: React.ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Called when open state should change. */
  onOpenChange?: (open: boolean) => void;
  /** Dropdown alignment. */
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * Unified import trigger: an Upload-icon button that always opens a
 * dropdown menu. Callers pass the menu items as `children` and
 * (optionally) controlled `open` / `onOpenChange`.
 *
 * Trigger button is rendered internally so ref/event forwarding is
 * handled correctly. For "import from file" entries, use the
 * `useFileImportPicker` hook to wire a hidden <input type="file">.
 */
export function ImportButton({
  label,
  children,
  open,
  onOpenChange,
  align = 'start',
  className,
}: ImportButtonProps) {
  const triggerEl = (
    <Button variant="outline" size="sm" className={className}>
      <Upload className="size-3.5 mr-1" />
      {label}
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={triggerEl} />
      <DropdownMenuContent align={align}>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Wires a hidden <input type="file"> for "import from file" menu entries.
 *
 * Returns `{ openFileDialog, fileInput }`:
 * - `fileInput`: a <input> element to render hidden inside your component.
 * - `openFileDialog`: call from a DropdownMenuItem onClick to open the picker.
 *
 * `onFiles` receives the selected File[]; `accept` and `multiple` are
 * forwarded to the input.
 */
export function useFileImportPicker(options: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const { accept = '', multiple = false, onFiles } = options;
  const inputRef = React.useRef<HTMLInputElement>(null);

  const openFileDialog = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) onFiles(files);
        // reset so selecting the same file again still fires onchange
        e.target.value = '';
      }}
    />
  );

  return { openFileDialog, fileInput };
}
