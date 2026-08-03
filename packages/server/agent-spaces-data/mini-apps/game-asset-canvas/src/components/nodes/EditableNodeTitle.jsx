import { useEffect, useState } from 'react';

export default function EditableNodeTitle({ value, fallback, onChange, className = '', inputClassName = '' }) {
  const title = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [editing, title]);

  const beginEditing = (event) => {
    event.stopPropagation();
    if (!onChange) return;
    setDraft(title);
    setEditing(true);
  };

  const commit = () => {
    const nextTitle = draft.trim();
    setEditing(false);
    if (nextTitle !== (typeof value === 'string' ? value.trim() : '')) onChange?.(nextTitle);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(title);
            setEditing(false);
          }
        }}
        className={`nodrag nopan nowheel min-w-0 bg-background text-foreground outline-none ring-1 ring-primary ${inputClassName}`}
        aria-label="节点标题"
      />
    );
  }

  return (
    <span
      role={onChange ? 'button' : undefined}
      tabIndex={onChange ? 0 : undefined}
      title={onChange ? '双击编辑标题' : title}
      onDoubleClick={beginEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') beginEditing(event);
      }}
      className={`${onChange ? 'cursor-text' : ''} ${className}`}
    >
      {title}
    </span>
  );
}
