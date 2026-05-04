declare module 'react-virtualized' {
  import type { ComponentType, CSSProperties, ReactNode } from 'react';

  export interface AutoSizerProps {
    children: (size: { height: number; width: number }) => ReactNode;
  }

  export const AutoSizer: ComponentType<AutoSizerProps>;

  export interface ListRowProps {
    index: number;
    key: string;
    parent: unknown;
    style: CSSProperties;
  }

  export interface ListProps {
    ref?: unknown;
    height: number;
    width: number;
    rowCount: number;
    rowHeight: number | ((params: { index: number }) => number);
    deferredMeasurementCache?: unknown;
    rowRenderer: (props: ListRowProps) => ReactNode;
    overscanRowCount?: number;
  }

  export const List: ComponentType<ListProps>;

  export interface CellMeasurerProps {
    cache: CellMeasurerCache;
    columnIndex: number;
    parent: unknown;
    rowIndex: number;
    children: ReactNode;
  }

  export const CellMeasurer: ComponentType<CellMeasurerProps>;

  export class CellMeasurerCache {
    constructor(options?: {
      fixedWidth?: boolean;
      defaultHeight?: number;
      minHeight?: number;
    });
    clearAll(): void;
    rowHeight(params: { index: number }): number;
  }
}
