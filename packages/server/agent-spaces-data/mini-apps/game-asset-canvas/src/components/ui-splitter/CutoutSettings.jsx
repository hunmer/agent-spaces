import {
  Button, ColorPicker, Label, NumberInput,
  Tooltip, TooltipContent, TooltipTrigger,
} from '@agent-spaces/ui';
import { Pipette } from '@agent-spaces/ui';
import { BG_PRESETS } from '../../utils/ui-splitter-helpers';

export function SettingField({ label, children }) {
  return (
    <Label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

export default function CutoutSettings({
  method, tolerance, pickedHex,
  onMethodChange, onToleranceChange, onColorChange,
  onPickColor, picking = false, pickDisabled = false,
  showTolerance = true, alwaysShowColor = false, alwaysShowPick = false,
  methodLabel = '抠图方式',
}) {
  return (
    <>
      <SettingField label={methodLabel}>
        <select
          value={method}
          onChange={(event) => onMethodChange?.(event.target.value)}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        >
          <option value="none">不处理</option>
          <option value="corner">四角背景色</option>
          <option value="picked">指定背景色</option>
          <option value="alpha">保留 Alpha</option>
          <option value="brightness">移除亮色背景</option>
        </select>
      </SettingField>
      {showTolerance && method !== 'none' && method !== 'alpha' && (
        <SettingField label={`容差 ${tolerance}`}>
          <NumberInput min={0} max={765} value={tolerance}
            onChange={(value) => onToleranceChange?.(value ?? 0)} className="h-8 w-24" />
        </SettingField>
      )}
      {(method === 'picked' || alwaysShowColor || alwaysShowPick) && (
        <>
          {(method === 'picked' || alwaysShowColor) && (
            <SettingField label="背景色">
              <div className="flex h-8 items-center rounded-md border border-border bg-background px-2">
                <ColorPicker colors={BG_PRESETS} value={pickedHex} onChange={onColorChange} />
              </div>
            </SettingField>
          )}
          {onPickColor && (method === 'picked' || alwaysShowPick) && (
            <div className="flex items-end gap-1.5">
              <Tooltip>
                <TooltipTrigger render={
                  <Button size="icon" variant={picking ? 'default' : 'outline'}
                    className={`h-8 w-8 ${picking ? 'ring-2 ring-primary/40' : ''}`}
                    disabled={pickDisabled} onClick={onPickColor} />
                }>
                  <Pipette className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom">吸取背景色</TooltipContent>
              </Tooltip>
            </div>
          )}
        </>
      )}
    </>
  );
}
