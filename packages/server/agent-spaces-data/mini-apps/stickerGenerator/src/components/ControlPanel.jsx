// 左侧控制面板：提示词 / 风格 / 参考图 / 输出设置 / 高级选项 / 生成按钮
// 所有可选项最终都拼进 prompt 提交给工作流（见 styles.js#buildPrompt）
import StylePicker from './StylePicker';
import {
  ASPECT_RATIOS, SIZES, BACKGROUND_COLORS, FONTS, PRESET_PROMPTS,
  LAYOUT_MODES, COLLECTION_COUNT_PRESETS, getStyle,
} from '../utils/styles';

const {
  Button, Textarea, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Input, FileUpload, Switch, Badge, Loader2, Wand2, WandSparkles, ChevronDown, ChevronUp,
  Sparkles, Type, Palette, Sticker, Smile, ImagePlus, X, Layers, LayoutPanelLeft,
} = window.AgentSpacesUI;

function Section({ title, icon, defaultOpen = true, children, right }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const Icon = icon;
  return (
    <div className="sg-section">
      <button type="button" className="sg-section-head" onClick={() => setOpen((v) => !v)}>
        <span className="sg-section-title">
          {Icon && <Icon className="sg-icon-sm" />}
          {title}
        </span>
        <span className="sg-section-right">
          {right}
          {open ? <ChevronUp className="sg-icon-sm" /> : <ChevronDown className="sg-icon-sm" />}
        </span>
      </button>
      {open && <div className="sg-section-body">{children}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="sg-field">
      <Label className="sg-field-label">{label}</Label>
      {children}
    </div>
  );
}

export default function ControlPanel({
  form, onChange, customStyles, running, onGenerate, onUploadRefs,
}) {
  const update = (patch) => onChange({ ...form, ...patch });
  const style = getStyle(form.styleId, customStyles);

  const addPreset = (preset) => {
    update({ prompt: form.prompt.trim() ? `${form.prompt.trim()}\n${preset}` : preset });
  };

  return (
    <div className="sg-panel">
      <Section title="生成类型" icon={Layers}>
        <div className="sg-layout-grid">
          {LAYOUT_MODES.map((m) => {
            const Icon = m.value === 'single' ? Sticker : m.value === 'threeViews' ? LayoutPanelLeft : Layers;
            const sel = form.layoutMode === m.value;
            return (
              <button
                type="button"
                key={m.value}
                className={`sg-layout-btn${sel ? ' is-selected' : ''}`}
                disabled={running}
                onClick={() => update({ layoutMode: m.value })}
              >
                <Icon className="sg-icon-sm" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        {form.layoutMode === 'collection' && (
          <div className="sg-collection-count">
            <span className="sg-mini-label">子贴纸数量</span>
            <div className="sg-collection-presets">
              {COLLECTION_COUNT_PRESETS.map((n) => (
                <button
                  type="button"
                  key={n}
                  className={`sg-count-btn${form.collectionCount === n ? ' is-selected' : ''}`}
                  disabled={running}
                  onClick={() => update({ collectionCount: n })}
                >{n}</button>
              ))}
              <Input
                type="number"
                min={2}
                max={12}
                value={form.collectionCount}
                disabled={running}
                onChange={(e) => update({ collectionCount: Math.max(2, Math.min(12, Number(e.target.value) || 2)) })}
                className="sg-count-input"
              />
            </div>
          </div>
        )}
      </Section>

      <Section title="提示词" icon={Sparkles}>
        <Field label="贴图描述">
          <Textarea
            value={form.prompt}
            onChange={(e) => update({ prompt: e.target.value })}
            placeholder={'每行一个提示词可批量生成...\n例如：\n一只快乐的小狐狸\n一支潜艇舰队'}
            className="sg-textarea"
            disabled={running}
          />
        </Field>
        <div className="sg-presets">
          <span className="sg-mini-label"><Sparkles className="sg-icon-xs" /> 试试这些</span>
          <div className="sg-preset-list">
            {PRESET_PROMPTS.slice(0, 4).map((p) => (
              <button type="button" key={p} className="sg-preset-chip" disabled={running} onClick={() => addPreset(p)}>{p}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="风格" icon={Sticker}>
        <StylePicker
          value={form.styleId}
          customStyles={customStyles}
          onChange={(id) => update({ styleId: id })}
          disabled={running}
        />
        <div className="sg-style-hint">{style?.promptModifier}</div>
      </Section>

      <Section title="参考图（图生图）" icon={ImagePlus} defaultOpen={form.references?.length > 0}>
        <FileUpload
          value={form.references}
          onChange={(files) => { update({ references: files }); onUploadRefs?.(files); }}
          accept="image/*"
          multiple
          autoUpload
        />
        <div className="sg-style-hint">上传参考图后自动切换到图生图工作流；不上传则走文生图。</div>
      </Section>

      <Section title="输出设置" icon={Sparkles} defaultOpen={false}>
        <div className="sg-row-2">
          <Field label="比例">
            <Select value={form.aspect} onValueChange={(v) => update({ aspect: v })} disabled={running}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="分辨率">
            <Select value={form.size} onValueChange={(v) => update({ size: v })} disabled={running}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="模型">
          <Input
            value={form.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder="例如：gpt-image-1 / seedream-4.0 / nano-banana-2"
            disabled={running}
          />
        </Field>
      </Section>

      <Section title="高级选项" icon={Smile} defaultOpen={false}>
        <div className="sg-toggle-row">
          <div className="sg-toggle-label">
            <Smile className="sg-icon-sm" />
            <span>生成面部/表情</span>
          </div>
          <Switch checked={form.useFacialFeatures} onCheckedChange={(v) => update({ useFacialFeatures: v })} disabled={running} />
        </div>
        <div className="sg-toggle-row">
          <div className="sg-toggle-label">
            <Sticker className="sg-icon-sm" />
            <span>贴纸白边（描边）</span>
          </div>
          <Switch checked={form.useStickerBorder} onCheckedChange={(v) => update({ useStickerBorder: v })} disabled={running} />
        </div>

        <div className="sg-divider" />
        <div className="sg-toggle-row">
          <div className="sg-toggle-label">
            <Type className="sg-icon-sm" />
            <span>添加文字</span>
          </div>
          <Switch checked={form.textEnabled} onCheckedChange={(v) => update({ textEnabled: v })} disabled={running} />
        </div>
        {form.textEnabled && (
          <div className="sg-sub-block">
            <Input
              value={form.textContent}
              onChange={(e) => update({ textContent: e.target.value })}
              placeholder="文字内容（留空由 AI 决定）"
              disabled={running}
            />
            <div className="sg-font-row">
              {FONTS.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={`sg-font-btn${form.textFont === f.value ? ' is-selected' : ''}`}
                  disabled={running}
                  onClick={() => update({ textFont: f.value })}
                >{f.name}</button>
              ))}
            </div>
          </div>
        )}

        <div className="sg-divider" />
        <div className="sg-toggle-row">
          <div className="sg-toggle-label">
            <Palette className="sg-icon-sm" />
            <span>保留背景</span>
          </div>
          <Switch checked={form.backgroundEnabled} onCheckedChange={(v) => update({ backgroundEnabled: v })} disabled={running} />
        </div>
        {form.backgroundEnabled ? (
          <div className="sg-color-row">
            {BACKGROUND_COLORS.map((c) => (
              <button
                type="button"
                key={c.value}
                className={`sg-color-btn${form.backgroundColor === c.value ? ' is-selected' : ''}`}
                style={{ background: c.hex }}
                title={c.name}
                disabled={running}
                onClick={() => update({ backgroundColor: c.value })}
              />
            ))}
          </div>
        ) : (
          <div className="sg-style-hint">将生成透明背景的独立主体，适合贴纸 / 图标。</div>
        )}
      </Section>

      <div className="sg-generate-wrap">
        <Button className="sg-generate-btn" onClick={onGenerate} disabled={running || !form.prompt.trim() || !form.model}>
          {running ? <Loader2 className="sg-icon-sm sg-spin" /> : <Wand2 className="sg-icon-sm" />}
          {running ? '生成中...' : '生成贴图'}
        </Button>
      </div>
    </div>
  );
}
