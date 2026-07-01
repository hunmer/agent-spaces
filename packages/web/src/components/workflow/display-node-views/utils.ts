import { createElement, type ReactNode } from 'react';

export type DisplayNodeViewProps = {
  data: Record<string, unknown>;
  isRunning?: boolean;
};

export type GalleryItem = {
  id?: string;
  src: string;
  thumb?: string;
  type?: 'image' | 'video';
  caption?: string;
};

export type TrackItem = {
  id?: string;
  src: string;
  title?: string;
  cover?: string;
  duration?: number;
};

export type TableHeaderItem = {
  id: string;
  title?: string;
  type?: string;
};

export type TableCellItem = {
  id: string;
  data: Record<string, unknown>;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed);
  } catch {
    return {};
  }
}

export function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function galleryItems(data: Record<string, unknown>): GalleryItem[] {
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((item, index): GalleryItem | null => {
      if (typeof item === 'string') {
        const src = readString(item);
        if (!src) return null;
        return {
          id: `items_${index}`,
          src,
          thumb: src,
          type: 'image',
          caption: '',
        };
      }
      const record = asRecord(item);
      const src = readString(record.src);
      if (!src) return null;
      const type = record.type === 'video' ? 'video' : 'image';
      return {
        id: readString(record.id),
        src,
        thumb: readString(record.thumb),
        type,
        caption: readString(record.caption),
      };
    })
    .filter((item): item is GalleryItem => item !== null);
}

export function trackItems(data: Record<string, unknown>): TrackItem[] {
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  return tracks
    .map((track): TrackItem | null => {
      const record = asRecord(track);
      const src = readString(record.src);
      if (!src) return null;
      return {
        id: readString(record.id),
        src,
        title: readString(record.title),
        cover: readString(record.cover),
        duration: readNumber(record.duration),
      };
    })
    .filter((track): track is TrackItem => track !== null);
}

export function tableHeaders(data: Record<string, unknown>): TableHeaderItem[] {
  const headers = Array.isArray(data.headers) ? data.headers : [];
  return headers
    .map((header): TableHeaderItem | null => {
      const record = asRecord(header);
      const id = readString(record.id);
      if (!id) return null;
      return {
        id,
        title: readString(record.title),
        type: readString(record.type),
      };
    })
    .filter((header): header is TableHeaderItem => header !== null);
}

export function tableCells(data: Record<string, unknown>): TableCellItem[] {
  const cells = Array.isArray(data.cells) ? data.cells : [];
  return cells
    .map((cell) => {
      const record = asRecord(cell);
      const id = readString(record.id);
      if (!id) return null;
      return {
        id,
        data: parseJsonRecord(record.data),
      };
    })
    .filter((cell): cell is TableCellItem => cell !== null);
}

export function EmptyDisplay({ icon, text }: { icon: ReactNode; text: string }) {
  return createElement(
    'div',
    {
      className: 'flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-[11px] text-muted-foreground',
    },
    createElement('div', { className: 'text-muted-foreground/70' }, icon),
    createElement('div', null, text),
  );
}
