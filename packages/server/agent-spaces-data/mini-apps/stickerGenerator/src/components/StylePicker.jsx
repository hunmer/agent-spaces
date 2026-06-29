// 风格选择：内置 16 种 + 用户自定义风格
// 用 Popover 展示网格，每格显示色点 + 名称
import { STICKER_STYLES, getStyle } from '../utils/styles';

const { Popover, PopoverTrigger, PopoverContent, Button, Check } = window.AgentSpacesUI;

export default function StylePicker({ value, customStyles = [], onChange, disabled }) {
  const allStyles = [...STICKER_STYLES, ...customStyles];
  const active = getStyle(value, customStyles);
  const label = active?.label_zh || active?.name || '选择风格';

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="sg-style-trigger" disabled={disabled} />}>
        <span className="sg-style-dot" style={{ background: active?.dot || '#a8a29e' }} />
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
              <button
                type="button"
                key={style.id}
                className={`sg-style-item${selected ? ' is-selected' : ''}`}
                onClick={() => onChange(style.id)}
                title={style.promptModifier}
              >
                <span className="sg-style-dot" style={{ background: style.dot || '#a8a29e' }} />
                <span className="sg-style-item-name">{name}</span>
                {selected && <Check className="sg-style-check" />}
                {style.isCustom && <span className="sg-style-custom-tag">自定义</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
