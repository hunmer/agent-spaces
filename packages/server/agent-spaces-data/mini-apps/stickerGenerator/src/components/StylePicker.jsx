// 风格选择：内置 16 种 + 用户自定义风格（创建/删除）
// 创建的自定义风格通过 invokeService('save_custom_style') 落库，多端同步
import { STICKER_STYLES, getStyle } from '../utils/styles';

const { Popover, PopoverTrigger, PopoverContent, Button, Check, Plus, Trash2, X, ImagePlus } = window.AgentSpacesUI;

export default function StylePicker({ value, customStyles = [], onChange, onSaveCustom, onDeleteCustom, disabled }) {
  const AS = window.AgentSpaces;
  const allStyles = [...STICKER_STYLES, ...customStyles];
  const active = getStyle(value, customStyles);
  const label = active?.label_zh || active?.name || '选择风格';
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newPrompt, setNewPrompt] = React.useState('');

  const submitCreate = () => {
    const name = newName.trim();
    const prompt = newPrompt.trim();
    if (!name || !prompt) return;
    const style = {
      id: `custom-${Date.now()}`,
      name,
      label_zh: name,
      promptModifier: prompt,
      dot: '#8b5cf6',
      isCustom: true,
    };
    AS.invokeService('save_custom_style', { style });
    onSaveCustom?.(style);
    setNewName('');
    setNewPrompt('');
    setCreating(false);
    onChange(style.id);
  };

  const removeCustom = (id) => {
    AS.invokeService('remove_custom_style', { id });
    onDeleteCustom?.(id);
    if (value === id) onChange(STICKER_STYLES[0].id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="sg-style-trigger" disabled={disabled} />}>
        {active?.previewImage ? (
          <img className="sg-style-trigger-thumb" src={active.previewImage} alt={label} />
        ) : (
          <span className="sg-style-dot" style={{ background: active?.dot || '#a8a29e' }} />
        )}
        <span className="sg-style-trigger-label">{label}</span>
        {customStyles.length > 0 && (
          <span className="sg-style-custom-count">+{customStyles.length} 自定义</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="sg-style-popover">
        <div className="sg-style-grid">
          {allStyles.map((style) => {
            const selected = style.id === value;
            const name = style.label_zh || style.name;
            return (
              <div key={style.id} className="sg-style-item-wrap">
                <button
                  type="button"
                  className={`sg-style-item${selected ? ' is-selected' : ''}`}
                  onClick={() => { onChange(style.id); setOpen(false); }}
                  title={style.promptModifier}
                >
                  {style.previewImage ? (
                    <img className="sg-style-preview" src={style.previewImage} alt={name} loading="lazy" />
                  ) : (
                    <span className="sg-style-dot" style={{ background: style.dot || '#a8a29e' }} />
                  )}
                  {selected && <Check className="sg-style-check" />}
                  {style.isCustom && <span className="sg-style-custom-tag">自定义</span>}
                  <span className="sg-style-item-name">{name}</span>
                </button>
                {style.isCustom && (
                  <button type="button" className="sg-style-del" title="删除" onClick={(e) => { e.stopPropagation(); removeCustom(style.id); }}>
                    <Trash2 className="sg-icon-xs" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 创建自定义风格 */}
        <div className="sg-style-create">
          {!creating ? (
            <button type="button" className="sg-style-create-btn" onClick={() => setCreating(true)}>
              <Plus className="sg-icon-sm" /> 创建自定义风格
            </button>
          ) : (
            <div className="sg-style-create-form">
              <div className="sg-style-create-head">
                <span className="sg-field-label">新建风格</span>
                <button type="button" className="sg-style-create-close" onClick={() => setCreating(false)}><X className="sg-icon-sm" /></button>
              </div>
              <input
                className="sg-style-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="风格名称（如：赛博水墨）"
              />
              <textarea
                className="sg-style-textarea"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="英文风格描述（会拼进提示词），如：cyber ink painting, neon splashes, digital brushstroke"
              />
              <Button size="sm" onClick={submitCreate} disabled={!newName.trim() || !newPrompt.trim()} style={{ width: '100%' }}>
                <ImagePlus className="sg-icon-xs" /> 保存风格
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
