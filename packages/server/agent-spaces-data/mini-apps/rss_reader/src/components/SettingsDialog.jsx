const { useState, useEffect } = React;
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Label, Slider, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Sun, Moon, Monitor, Settings, Sparkles, Type, LayoutGrid,
} = window.AgentSpacesUI;
import { DENSITY_OPTIONS, DEFAULT_PREFS } from '../utils/constants.js';

const THEME_KEY = 'agent-spaces-theme'; // 与主应用 ThemeProvider 一致
const THEME_OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

// 应用主题到 documentElement（同 document，主应用 next-themes 也是改 class）
function applyTheme(theme) {
  const root = document.documentElement;
  const isDark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}

// 设置对话框：主题切换 + AI 模型配置入口 + 阅读偏好
export function SettingsDialog({ open, onOpenChange, agentMeta, onConfigureAgent, prefs, onUpdatePrefs }) {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    if (open) setTheme(readTheme());
  }, [open]);

  const chooseTheme = (next) => {
    setTheme(next);
    applyTheme(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>主题外观与 AI 模型配置</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          {/* 主题 */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs">主题</Label>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => chooseTheme(opt.value)}
                    className={
                      'flex flex-col items-center gap-1.5 py-3 rounded-md border text-xs transition-colors '
                      + (active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted')
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI 模型 */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs">AI 模型</Label>
            <div className="flex items-center gap-2 rounded-md border border-border p-3">
              <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {agentMeta?.name || '未配置'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  用于文章 AI 总结
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onConfigureAgent()}
              >
                <Settings className="h-3.5 w-3.5" />
                {agentMeta ? '更改' : '配置'}
              </Button>
            </div>
          </div>

          {/* 阅读偏好 */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs">阅读偏好</Label>

            {/* 字体大小 */}
            <div className="rounded-md border border-border p-3 flex items-center gap-3">
              <Type className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">正文字号</div>
                <div className="text-[11px] text-muted-foreground">影响详情页正文与总结</div>
              </div>
              <div className="flex items-center gap-2 w-36">
                <span className="text-[10px] text-muted-foreground">A</span>
                <Slider
                  value={[prefs?.fontSize ?? DEFAULT_PREFS.fontSize]}
                  min={12}
                  max={20}
                  step={1}
                  onValueChange={(v) => {
                    const n = Array.isArray(v) ? v[0] : v;
                    onUpdatePrefs({ fontSize: n });
                  }}
                />
                <span className="text-sm font-medium w-7 text-right">{prefs?.fontSize ?? DEFAULT_PREFS.fontSize}</span>
              </div>
            </div>

            {/* 列表密度 */}
            <div className="rounded-md border border-border p-3 flex items-center gap-3">
              <LayoutGrid className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">列表密度</div>
                <div className="text-[11px] text-muted-foreground">文章卡片间距与预览字数</div>
              </div>
              <Select
                value={prefs?.density ?? DEFAULT_PREFS.density}
                onValueChange={(v) => onUpdatePrefs({ density: v })}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DENSITY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
