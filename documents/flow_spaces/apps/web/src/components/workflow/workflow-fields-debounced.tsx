'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
} from 'react';
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

export function useDeferredInputDraft(
  value: string,
  onCommit: (value: string) => void,
) {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) {
      setDraft(value);
    }
  }, [value]);

  const commit = useCallback((nextValue: string) => {
    onCommit(nextValue);
  }, [onCommit]);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    const nextValue = event.currentTarget.value;
    setDraft(nextValue);
    commit(nextValue);
  }, [commit]);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.value;
    setDraft(nextValue);
    if (!composingRef.current) {
      commit(nextValue);
    }
  }, [commit]);

  const onBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    commit(event.currentTarget.value);
  }, [commit]);

  return {
    draft,
    inputProps: {
      onCompositionStart,
      onCompositionEnd,
      onChange,
      onBlur,
    },
  };
}
