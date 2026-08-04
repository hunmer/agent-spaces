export default function AlignmentGuides({ guides, viewport }) {
  const zoom = viewport?.zoom || 1;
  const vertical = guides?.vertical == null ? null : guides.vertical * zoom + (viewport?.x || 0);
  const horizontal = guides?.horizontal == null ? null : guides.horizontal * zoom + (viewport?.y || 0);
  if (vertical == null && horizontal == null) return null;

  const lineStyle = {
    position: 'absolute',
    zIndex: 20,
    pointerEvents: 'none',
    background: 'var(--primary)',
    opacity: 0.8,
  };

  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 20 }}>
      {vertical != null && (
        <div style={{ ...lineStyle, left: vertical, top: 0, bottom: 0, width: 1 }} />
      )}
      {horizontal != null && (
        <div style={{ ...lineStyle, left: 0, right: 0, top: horizontal, height: 1 }} />
      )}
    </div>
  );
}

