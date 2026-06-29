// 左侧控制面板：提示词 / 风格 / 参考图 / 输出设置 / 高级选项 / 生成按钮
// 所有可选项最终都拼进 prompt 提交给工作流（见 styles.js#buildPrompt）
import StylePicker from './StylePicker';
import PromptAgentPanel from './PromptAgentPanel';
import {
  ASPECT_RATIOS, SIZES, BACKGROUND_COLORS, FONTS, TEXT_LANGUAGES, PRESET_PROMPTS,
  LAYOUT_MODES, COLLECTION_COUNT_PRESETS, getStyle,
} from '../utils/styles';
import { MODEL_OPTIONS } from '../utils/settings';
import { persistableReferences } from '../utils/workflow';

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
  form, onChange, customStyles, running, onGenerate, onSaveCustomStyle, onDeleteCustomStyle,
  promptAgent,
}) {
  const update = (patch) => onChange({ ...form, ...patch });
  const style = getStyle(form.styleId, customStyles);
  const itemsBusy = !!promptAgent?.itemsBusy;

  // 子贴纸数量变化时同步 collectionItems 长度（补齐空串/截断）
  React.useEffect(() => {
    const items = Array.isArray(form.collectionItems) ? form.collectionItems : [];
    const target = Array.from({ length: form.collectionCount }, (_, i) => items[i] || '');
    const same = target.length === items.length && target.every((v, i) => v === items[i]);
    if (!same) update({ collectionItems: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.collectionCount]);

  const updateCollectionItem = (index, value) => {
    const next = Array.from({ length: form.collectionCount }, (_, i) =>
      (i === index ? value : (form.collectionItems[i] || '')),
    );
    update({ collectionItems: next });
  };

  // 一键生成：调用 promptAgent.generateCollectionItems，回填到 collectionItems
  const handleGenerateItems = async () => {
    if (!promptAgent?.generateCollectionItems) return;
    const generated = await promptAgent.generateCollectionItems(form.prompt, form.collectionCount);
    if (generated.length) {
      const next = Array.from({ length: form.collectionCount }, (_, i) => generated[i] || '');
      update({ collectionItems: next });
    }
  };

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
          <div className="sg-collection-box">
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

            <div className="sg-items-head">
              <span className="sg-mini-label">每张子贴纸内容</span>
              <button
                type="button"
                className="sg-items-gen"
                disabled={running || itemsBusy || !form.prompt.trim() || !promptAgent?.hasAgent}
                title={!promptAgent?.hasAgent ? '未配置 Agent，请到设置中配置' : '根据上方主提示词一键生成'}
                onClick={handleGenerateItems}
              >
                {itemsBusy ? <Loader2 className="sg-icon-xs sg-spin" /> : <Wand2 className="sg-icon-xs" />}
                {itemsBusy ? '生成中' : '一键生成'}
              </button>
            </div>
            <div className="sg-items-list">
              {Array.from({ length: form.collectionCount }, (_, i) => (
                <label key={i} className="sg-item-row">
                  <span className="sg-item-idx">{i + 1}</span>
                  <input
                    type="text"
                    className="sg-item-input"
                    value={form.collectionItems[i] || ''}
                    disabled={running}
                    onChange={(e) => updateCollectionItem(i, e.target.value)}
                    placeholder={`第 ${i + 1} 张贴纸内容`}
                  />
                </label>
              ))}
            </div>
            <div className="sg-style-hint">可手动填写，或点击「一键生成」由 AI 根据主提示词拆出多个不同主体。</div>
          </div>
        )}
      </Section>

      <Section title="提示词" icon={Sparkles}>
        <Field label="贴图描述">
          <div className="sg-prompt-wrap">
            <Textarea
              value={form.prompt}
              onChange={(e) => update({ prompt: e.target.value })}
              placeholder={'每行一个提示词可批量生成...\n例如：\n一只快乐的小狐狸\n一支潜艇舰队'}
              className="sg-textarea sg-textarea-with-agent"
              disabled={running}
            />
            {promptAgent && (
              <PromptAgentPanel
                agent={promptAgent}
                disabled={running}
                onApply={(text) => update({ prompt: form.prompt.trim() ? `${form.prompt.trim()}\n${text}` : text })}
              />
            )}
          </div>
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
          onSaveCustom={onSaveCustomStyle}
          onDeleteCustom={onDeleteCustomStyle}
          disabled={running}
        />
        <div className="sg-style-hint">{style?.promptModifier}</div>
      </Section>

      <Section title="参考图（图生图）" icon={ImagePlus} defaultOpen={form.references?.length > 0}>
        <FileUpload
          value={form.references}
          onChange={(files) => {
            update({ references: files });
            // 等所有文件上传完成（uploadPromise resolve）后回写持久化结构，去掉 File 对象
            Promise.all((files || []).map((f) => {
              const file = f?.file || f;
              return file?.uploadPromise ? file.uploadPromise.then(() => file).catch(() => null) : file;
            }))
              .then(() => {
                onChange((prev) => ({ ...prev, references: persistableReferences(prev.references) }));
              })
              .catch(() => {});
          }}
          onUploadStatusChange={(uploadStatus) => {
            if (!uploadStatus?.uploading) {
              onChange((prev) => ({ ...prev, references: persistableReferences(prev.references) }));
            }
          }}
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
          <Select
            value={MODEL_OPTIONS.some((m) => m.value === form.model) ? form.model : '__custom__'}
            onValueChange={(v) => update({ model: v === '__custom__' ? form.model : v })}
            disabled={running}
          >
            <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label} · {m.providerLabel}</SelectItem>
              ))}
              <SelectItem value="__custom__">自定义（手动填写）</SelectItem>
            </SelectContent>
          </Select>
          {(!MODEL_OPTIONS.some((m) => m.value === form.model)) && (
            <Input
              value={form.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="输入自定义模型名称"
              disabled={running}
              className="sg-model-custom"
            />
          )}
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
            <div className="sg-text-lang-row">
              <span className="sg-field-label">语言</span>
              <Select value={form.textLanguage} onValueChange={(v) => update({ textLanguage: v })} disabled={running}>
                <SelectTrigger className="sg-text-lang-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEXT_LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sg-font-row">
              <span className="sg-field-label">字体</span>
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
