import { useState } from 'react';
import { Check, Copy, Trash2 } from '@agent-spaces/ui';

export default function TextResult({ text, onClear }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('copy text output failed:', error);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={copy}
          title="复制文本产物"
          className="flex items-center gap-1 rounded p-1 text-[10px] text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            title="清空文本产物"
            className="rounded p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <pre className="nowheel max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">{text}</pre>
    </div>
  );
}
