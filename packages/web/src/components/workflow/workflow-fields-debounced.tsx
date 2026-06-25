'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TEXT_COMMIT_DELAY_MS = 250;

function useDebouncedDraft(
  value: string,
  onCommit: (value: string) => void,
) {
  const [draft, setDraft] = useState(value);
  const onCommitRef = useRef(onCommit);
  const draftRef = useRef(value);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    setDraft(value);
    draftRef.current = value;
    dirtyRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [value]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    onCommitRef.current(draftRef.current);
  }, []);

  const updateDraft = useCallback((nextValue: string) => {
    setDraft(nextValue);
    draftRef.current = nextValue;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, TEXT_COMMIT_DELAY_MS);
  }, [flush]);

  useEffect(() => () => flush(), [flush]);

  return { draft, updateDraft, flush };
}

export function DebouncedTextInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { draft, updateDraft, flush } = useDebouncedDraft(value, onChange);

  return (
    <Input
      value={draft}
      onChange={(e) => updateDraft(e.target.value)}
      onBlur={flush}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

export function DebouncedTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { draft, updateDraft, flush } = useDebouncedDraft(value, onChange);

  return (
    <Textarea
      value={draft}
      onChange={(e) => updateDraft(e.target.value)}
      onBlur={flush}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

export function DebouncedNumberInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { draft, updateDraft, flush } = useDebouncedDraft(value, onChange);

  return (
    <Input
      type="number"
      value={draft}
      onChange={(e) => updateDraft(e.target.value)}
      onBlur={flush}
      disabled={disabled}
      className={className}
    />
  );
}

export function ImeSafeInput({
  value,
  onChange,
  className,
  type,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);
  const committedValueRef = useRef(value);

  useEffect(() => {
    committedValueRef.current = value;
    if (!composingRef.current) setDraft(value);
  }, [value]);

  const commit = useCallback((nextValue: string) => {
    if (nextValue === committedValueRef.current) return;
    committedValueRef.current = nextValue;
    onChange(nextValue);
  }, [onChange]);

  return (
    <input
      {...props}
      type={type}
      value={draft}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const nextValue = event.currentTarget.value;
        setDraft(nextValue);
        commit(nextValue);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        if (!composingRef.current) {
          commit(nextValue);
        }
      }}
      onBlur={(event) => {
        if (!composingRef.current) commit(event.currentTarget.value);
      }}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
    />
  );
}
