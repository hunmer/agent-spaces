'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
