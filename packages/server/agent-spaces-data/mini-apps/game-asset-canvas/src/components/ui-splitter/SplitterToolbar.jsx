import {
  Button, NumberInput,
  Tooltip, TooltipTrigger, TooltipContent,
} from '@agent-spaces/ui';
import { Undo2, Redo2, SquarePen, MousePointer2, Scissors, LayoutGrid } from '@agent-spaces/ui';
import CutoutSettings, { SettingField as Field } from './CutoutSettings';

/**
 * UiSplitterDialog 工具条。
 * 三种态：gridOnly（Sheet 拆分）/ 普通模式（自动检测 + 手动框选）/ 网格模式。
 * 末尾是裁切 / 网格切换按钮组（与绘制模式互斥）。
 *
 * pickingRef 传 React ref 对象，内部读 .current（保持与原实现的渲染时机一致）。
 */
export default function SplitterToolbar({
  gridOnly, gridMode, cropMode, drawMode,
  gridCols, gridRows, method, tolerance, minArea, padding, pickedHex, count,
  pickingRef,
  onApplyGridSize, onSetMethod, onSetTolerance, onSetMinArea, onSetPadding,
  onHandlePickColor, onTogglePicking, onToggleDrawMode,
  onUndo, onRedo, canUndo, canRedo,
  onToggleCropMode, onToggleGridMode,
}) {
  const isPicking = !!pickingRef?.current;
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-4 py-2">
      {gridOnly ? (
        <>
          <Field label="列数">
            <NumberInput min={1} max={20} value={gridCols}
              onChange={(v) => onApplyGridSize(v ?? 1, gridRows)} className="h-8 w-20" />
          </Field>
          <Field label="行数">
            <NumberInput min={1} max={20} value={gridRows}
              onChange={(v) => onApplyGridSize(gridCols, v ?? 1)} className="h-8 w-20" />
          </Field>
          <CutoutSettings
            method={method}
            tolerance={tolerance}
            pickedHex={pickedHex}
            onMethodChange={onSetMethod}
            onToleranceChange={onSetTolerance}
            onColorChange={onHandlePickColor}
            onPickColor={onTogglePicking}
            picking={isPicking}
            pickDisabled={cropMode}
            showTolerance={false}
          />
          <span className="pb-2 text-[11px] text-muted-foreground">实时切片 {count}</span>
        </>
      ) : null}
      {!gridOnly && !gridMode && (
        <>
          <CutoutSettings
            method={method}
            tolerance={tolerance}
            pickedHex={pickedHex}
            onMethodChange={onSetMethod}
            onToleranceChange={onSetTolerance}
            onColorChange={onHandlePickColor}
            onPickColor={onTogglePicking}
            picking={isPicking}
            pickDisabled={cropMode}
            methodLabel="检测方法"
            alwaysShowColor
            alwaysShowPick
          />
          <Field label={`最小面积 ${minArea}`}>
            <NumberInput min={1} value={minArea}
              onChange={(v) => onSetMinArea(v ?? 1)}
              className="h-8 w-28" />
          </Field>
          <Field label={`边距 ${padding}`}>
            <NumberInput min={0} value={padding}
              onChange={(v) => onSetPadding(v ?? 0)}
              className="h-8 w-24" />
          </Field>
          <div className="flex items-end gap-1.5">
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant={drawMode ? 'default' : 'outline'}
                  className={`h-8 w-8 ${drawMode ? 'ring-2 ring-primary/40' : ''}`}
                  disabled={cropMode}
                  onClick={onToggleDrawMode} />
              }>
                {drawMode ? <SquarePen className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
              </TooltipTrigger>
              <TooltipContent side="bottom">{drawMode ? '框选模式：左键拉框新建切片（当前）' : '选择模式：左键点选/移动切片框（当前）'}（Alt 强制拉框）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={canUndo === false} onClick={onUndo} />
              }>
                <Undo2 className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">撤销 (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={canRedo === false} onClick={onRedo} />
              }>
                <Redo2 className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">重做 (Ctrl+Y)</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}
      {!gridOnly && gridMode && (
        <>
          <Field label="列数">
            <NumberInput min={1} max={20} value={gridCols}
              onChange={(v) => onApplyGridSize(v ?? 1, gridRows)} className="h-8 w-20" />
          </Field>
          <Field label="行数">
            <NumberInput min={1} max={20} value={gridRows}
              onChange={(v) => onApplyGridSize(gridCols, v ?? 1)} className="h-8 w-20" />
          </Field>
          <span className="pb-2 text-[11px] text-muted-foreground">实时切片 {count}</span>
        </>
      )}
      {/* 裁切 / 网格 模式组（与绘制模式互斥） */}
      {gridOnly ? (
        // grid-only：只显示裁切按钮（始终可用），不显示网格切换（禁止退出网格）
        <div className="flex items-end gap-1.5 border-l border-border pl-2">
          <Tooltip>
            <TooltipTrigger render={
              <Button size="icon" variant={cropMode ? 'default' : 'outline'}
                className={`h-8 w-8 ${cropMode ? 'ring-2 ring-primary/40' : ''}`}
                onClick={onToggleCropMode} />
            }>
              <Scissors className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom">裁切：拉框选范围，替换原图</TooltipContent>
          </Tooltip>
        </div>
      ) : (
      <div className={`flex items-end gap-1.5 ${gridMode ? '' : 'border-l border-border pl-2'}`}>
        {!gridMode && (
          <Tooltip>
            <TooltipTrigger render={
              <Button size="icon" variant={cropMode ? 'default' : 'outline'}
                className={`h-8 w-8 ${cropMode ? 'ring-2 ring-primary/40' : ''}`}
                onClick={onToggleCropMode} />
            }>
              <Scissors className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="bottom">裁切：拉框选范围，替换原图</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger render={
            <Button size="icon" variant={gridMode ? 'default' : 'outline'}
              className={`h-8 w-8 ${gridMode ? 'ring-2 ring-primary/40' : ''}`}
              disabled={cropMode}
              onClick={onToggleGridMode} />
          }>
            <LayoutGrid className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="bottom">{gridMode ? '退出网格模式' : '进入网格模式'}</TooltipContent>
        </Tooltip>
      </div>
      )}
    </div>
  );
}
