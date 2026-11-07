import type { CSSProperties } from 'react';
import type { ColorMode } from '@xyflow/react';

export const CUSTOM_WORKFLOW_CANVAS_THEME = 'custom';

export type WorkflowCanvasThemeKey = 'default' | 'graphite' | 'mint' | 'sunset' | typeof CUSTOM_WORKFLOW_CANVAS_THEME;

type CssVariableStyle = CSSProperties & Partial<Record<`--${string}`, string>>;

export interface WorkflowCanvasThemePreset {
  value: WorkflowCanvasThemeKey;
  label: string;
  description: string;
  colorMode: ColorMode;
  style: CssVariableStyle;
}

export const WORKFLOW_CANVAS_THEME_PRESETS: readonly WorkflowCanvasThemePreset[] = [
  {
    value: 'default',
    label: '默认',
    description: '跟随当前界面风格',
    colorMode: 'system',
    style: {},
  },
  {
    value: 'graphite',
    label: '石墨',
    description: '低对比深色画布',
    colorMode: 'dark',
    style: {
      background: '#111827',
      '--xy-edge-stroke-default': '#64748b',
      '--xy-edge-stroke-selected-default': '#e5e7eb',
      '--xy-connectionline-stroke-default': '#93c5fd',
      '--xy-background-pattern-dots-color-default': '#334155',
      '--xy-background-pattern-line-color-default': '#1f2937',
      '--xy-background-pattern-cross-color-default': '#374151',
      '--xy-minimap-background-color-default': '#111827',
      '--xy-controls-button-background-color-default': '#1f2937',
      '--xy-controls-button-background-color-hover-default': '#374151',
      '--xy-controls-button-color-default': '#e5e7eb',
      '--xy-controls-button-border-color-default': '#334155',
      '--xy-selection-background-color-default': 'rgba(147, 197, 253, 0.12)',
      '--xy-selection-border-default': '1px dotted rgba(147, 197, 253, 0.8)',
    },
  },
  {
    value: 'mint',
    label: '薄荷',
    description: '清爽浅色画布',
    colorMode: 'light',
    style: {
      background: '#f0fdfa',
      '--xy-edge-stroke-default': '#5eead4',
      '--xy-edge-stroke-selected-default': '#0f766e',
      '--xy-connectionline-stroke-default': '#14b8a6',
      '--xy-background-pattern-dots-color-default': '#99f6e4',
      '--xy-background-pattern-line-color-default': '#ccfbf1',
      '--xy-background-pattern-cross-color-default': '#99f6e4',
      '--xy-minimap-background-color-default': '#ecfeff',
      '--xy-controls-button-background-color-default': '#ffffff',
      '--xy-controls-button-background-color-hover-default': '#ccfbf1',
      '--xy-controls-button-border-color-default': '#99f6e4',
      '--xy-selection-background-color-default': 'rgba(20, 184, 166, 0.12)',
      '--xy-selection-border-default': '1px dotted rgba(15, 118, 110, 0.8)',
    },
  },
  {
    value: 'sunset',
    label: '日落',
    description: '暖色重点连线',
    colorMode: 'light',
    style: {
      background: '#fff7ed',
      '--xy-edge-stroke-default': '#fb923c',
      '--xy-edge-stroke-selected-default': '#c2410c',
      '--xy-connectionline-stroke-default': '#f97316',
      '--xy-background-pattern-dots-color-default': '#fed7aa',
      '--xy-background-pattern-line-color-default': '#ffedd5',
      '--xy-background-pattern-cross-color-default': '#fdba74',
      '--xy-minimap-background-color-default': '#fff7ed',
      '--xy-controls-button-background-color-default': '#ffffff',
      '--xy-controls-button-background-color-hover-default': '#ffedd5',
      '--xy-controls-button-border-color-default': '#fed7aa',
      '--xy-selection-background-color-default': 'rgba(249, 115, 22, 0.12)',
      '--xy-selection-border-default': '1px dotted rgba(194, 65, 12, 0.8)',
    },
  },
];

export const WORKFLOW_CANVAS_CUSTOM_THEME_PLACEHOLDER = `.react-flow {
  --xy-background-pattern-dots-color-default: #64748b;
  --xy-edge-stroke-default: #2563eb;
  --xy-edge-stroke-selected-default: #f97316;
  --xy-connectionline-stroke-default: #14b8a6;
  --xy-controls-button-background-color-default: #ffffff;
}`;

export function getWorkflowCanvasThemePreset(value: unknown) {
  return WORKFLOW_CANVAS_THEME_PRESETS.find(item => item.value === value) ?? WORKFLOW_CANVAS_THEME_PRESETS[0];
}

export function parseWorkflowCanvasCustomTheme(css: unknown): CssVariableStyle {
  if (typeof css !== 'string') return {};

  const style: CssVariableStyle = {};
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const variablePattern = /(--xy-[\w-]+)\s*:\s*([^;}\n]+)/g;
  let match: RegExpExecArray | null;

  while ((match = variablePattern.exec(source)) !== null) {
    const [, name, value] = match;
    const nextValue = value.trim();
    if (nextValue) style[name as `--${string}`] = nextValue;
  }

  return style;
}
