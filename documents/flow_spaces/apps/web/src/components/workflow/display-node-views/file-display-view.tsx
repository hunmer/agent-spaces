'use client';

import { Download, FileText } from 'lucide-react';
import { FileCard, type FormatFileProps } from '@/components/file-card-collections';
import { type DisplayNodeViewProps, readString, readNumber, EmptyDisplay } from './utils';

const EXT_TO_FORMAT: Record<string, FormatFileProps> = {
  doc: 'doc', docx: 'doc',
  pdf: 'pdf',
  md: 'md', markdown: 'md',
  mdx: 'mdx',
  txt: 'txt', log: 'txt',
  csv: 'csv', tsv: 'csv',
  xls: 'xls',
  xlsx: 'xlsx',
  ppt: 'ppt',
  pptx: 'pptx',
  zip: 'zip',
  rar: 'rar',
  tar: 'tar',
  gz: 'gz', gzip: 'gz',
  html: 'html', htm: 'html',
  js: 'js', mjs: 'js', cjs: 'js',
  jsx: 'jsx',
  tsx: 'tsx',
  ts: 'code',
  css: 'css', scss: 'css', less: 'css',
  json: 'json',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpeg',
  gif: 'img', webp: 'img', svg: 'img', bmp: 'img', ico: 'img',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video', flv: 'video',
};

function detectFormat(name: string): FormatFileProps {
  const clean = name.toLowerCase().split('?')[0].split('#')[0];
  const ext = clean.split('.').pop() || '';
  return EXT_TO_FORMAT[ext] || 'doc';
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function FileDisplayView({ data }: DisplayNodeViewProps) {
  const src = readString(data.src);
  const rawName = readString(data.fileName);
  const fileName = rawName || (src ? decodeURIComponent(src.split('/').pop()?.split('?')[0] || '') : '');
  const size = readNumber(data.fileSize);

  if (!src) {
    return <EmptyDisplay icon={<FileText className="h-5 w-5" />} text="暂无文件" />;
  }

  const format = detectFormat(fileName || src);

  return (
    <div className="nodrag nopan relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
      <a
        href={src}
        download={fileName || undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="下载"
        className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Download className="h-3.5 w-3.5" />
      </a>

      <div className="flex flex-1 items-center gap-3 p-3">
        <FileCard formatFile={format} />
        <div className="min-w-0 flex-1 pr-6">
          <div className="truncate text-xs font-medium" title={fileName}>
            {fileName || '未命名文件'}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {formatBytes(size) || '—'}
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 px-3 py-1.5">
        <div className="truncate text-[10px] text-muted-foreground" title={src}>
          {src}
        </div>
      </div>
    </div>
  );
}
