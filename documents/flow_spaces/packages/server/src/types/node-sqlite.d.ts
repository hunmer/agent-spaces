declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export class StatementSync {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
    // StatementSync.columns() 在 Node 22.5+ 运行时可用，@types/node@20 缺失，此处补类型声明
    columns(): Array<{ name: string; column: string | null; database: string | null; table: string | null }>;
  }
}
