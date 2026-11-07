'use client';

interface HelperLinesProps {
  horizontal?: number;
  vertical?: number;
}

export function WorkflowHelperLines({ horizontal, vertical }: HelperLinesProps) {
  return (
    <>
      {horizontal !== undefined && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10"
          style={{ top: horizontal, height: 1, backgroundColor: '#3b82f6' }}
        />
      )}
      {vertical !== undefined && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-10"
          style={{ left: vertical, width: 1, backgroundColor: '#3b82f6' }}
        />
      )}
    </>
  );
}
