import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Button, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff,
  FlipHorizontal2, FlipVertical2, Input, Label, RotateCcw, ScrollArea,
  Search, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@agent-spaces/ui';
import { getBoneTree } from '../loaders/SpineLoader.js';

const LIBRARY_BASE = 'https://cdn.jsdelivr.net/gh/FrankoFPM/Spine-Viewer-Web@gh-pages/assets/';
const PAGE_SIZE = 48;

export function SpineAssetLibrary({ disabled, onSelect }) {
  const [characters, setCharacters] = useState([]);
  const [query, setQuery] = useState('');
  const [faction, setFaction] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const AS = window.AgentSpaces;
    if (!AS?.srcFileUrl) return undefined;
    fetch(AS.srcFileUrl('spine/data/mainData.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`角色库加载失败 (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setCharacters(Object.values(data || {}));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || String(err));
      });
    return () => { cancelled = true; };
  }, []);

  const factions = useMemo(() => [...new Set(characters.map((item) => item.group).filter(Boolean))].sort(), [characters]);
  const types = useMemo(() => [...new Set(characters.map((item) => item.type).filter(Boolean))].sort(), [characters]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return characters.filter((item) => {
      if (needle && !String(item.name || '').toLowerCase().includes(needle)) return false;
      if (faction && item.group !== faction) return false;
      if (type && item.type !== type) return false;
      return true;
    });
  }, [characters, faction, query, type]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const selectCharacter = (item) => {
    const asset = (item.skin && item.skin[0]) || item.asset || item.name;
    onSelect?.({
      name: item.name,
      skel: `${LIBRARY_BASE}${asset}.skel`,
      atlas: `${LIBRARY_BASE}${asset}.atlas`,
      png: `${LIBRARY_BASE}${asset}.png`,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(0); }}
          placeholder="搜索角色"
          className="h-8 pl-7 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NativeFilter value={faction} onChange={(value) => { setFaction(value); setPage(0); }} options={factions} label="全部阵营" />
        <NativeFilter value={type} onChange={(value) => { setType(value); setPage(0); }} options={types} label="全部职业" />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-2 gap-1.5 pr-2">
          {pageItems.map((item) => (
            <Button
              key={`${item.name}-${item.group}-${item.type}`}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => selectCharacter(item)}
              title={`${item.name} · ${item.group || ''} · ${item.type || ''}`}
              className="h-auto min-h-10 justify-start whitespace-normal px-2 py-1.5 text-left text-[11px] leading-tight"
            >
              {item.name}
            </Button>
          ))}
        </div>
      </ScrollArea>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="icon-sm" disabled={safePage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Badge variant="secondary">{safePage + 1} / {totalPages}</Badge>
        <Button type="button" variant="ghost" size="icon-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function NativeFilter({ value, onChange, options, label }) {
  return (
    <Select value={value || '__all'} onValueChange={(next) => onChange(next === '__all' ? '' : next)}>
      <SelectTrigger size="sm" className="w-full min-w-0 text-[10px]">
        <SelectValue>{value || label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{label}</SelectItem>
        {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function SpineBoneTree({ spine, visibility, selectedBone, onSelect, onVisibilityChange }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [, forceRender] = useState(0);
  const treeRef = useRef(null);
  const tree = useMemo(() => getBoneTree(spine), [spine]);

  useEffect(() => {
    const next = new Set();
    const visit = (nodes) => nodes.forEach((node) => {
      next.add(node.bone.data.name);
      visit(node.children);
    });
    visit(tree);
    setExpanded(next);
  }, [tree]);

  useEffect(() => {
    if (!selectedBone) return undefined;
    setExpanded((current) => {
      const next = new Set(current);
      let parent = selectedBone.parent;
      while (parent) {
        next.add(parent.data.name);
        parent = parent.parent;
      }
      return next;
    });
    const frame = requestAnimationFrame(() => {
      const row = [...(treeRef.current?.querySelectorAll?.('[data-bone-name]') || [])]
        .find((element) => element.dataset.boneName === selectedBone.data.name);
      row?.scrollIntoView?.({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedBone]);

  const toggleExpanded = (name) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleVisibility = (bone) => {
    visibility?.toggle(spine, bone);
    onVisibilityChange?.();
    forceRender((value) => value + 1);
  };

  return (
    <ScrollArea className="h-full">
      <div ref={treeRef} className="space-y-0.5 p-2">
        {tree.length ? tree.map((node) => (
          <BoneRow
            key={node.bone.data.name}
            node={node}
            expanded={expanded}
            selectedBone={selectedBone}
            visibility={visibility}
            onToggleExpanded={toggleExpanded}
            onToggleVisibility={toggleVisibility}
            onSelect={onSelect}
          />
        )) : <p className="p-2 text-xs text-muted-foreground">加载角色后显示骨骼</p>}
      </div>
    </ScrollArea>
  );
}

function BoneRow({ node, expanded, selectedBone, visibility, onToggleExpanded, onToggleVisibility, onSelect }) {
  const name = node.bone.data.name;
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(name);
  const hidden = visibility?.isHidden(node.bone);
  return (
    <>
      <div data-bone-name={name} className={`flex items-center rounded px-1 py-0.5 ${selectedBone === node.bone ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`} style={{ paddingLeft: `${node.depth * 12 + 4}px` }}>
        <Button type="button" variant="ghost" size="icon-sm" disabled={!hasChildren} onClick={() => onToggleExpanded(name)} className="h-6 w-6">
          {hasChildren ? <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? '' : '-rotate-90'}`} /> : null}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(node.bone)} className="h-6 min-w-0 flex-1 justify-start truncate px-1 text-[11px]">
          {name}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onToggleVisibility(node.bone)} title={hidden ? '显示' : '隐藏'} className="h-6 w-6">
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {hasChildren && isExpanded ? node.children.map((child) => (
        <BoneRow
          key={child.bone.data.name}
          node={child}
          expanded={expanded}
          selectedBone={selectedBone}
          visibility={visibility}
          onToggleExpanded={onToggleExpanded}
          onToggleVisibility={onToggleVisibility}
          onSelect={onSelect}
        />
      )) : null}
    </>
  );
}

export function SpineTransformPanel({ bone, editor, revision, onChanged }) {
  const [values, setValues] = useState(() => boneValues(bone));

  useEffect(() => {
    setValues(boneValues(bone));
  }, [bone, revision]);

  // 实时改值：滑条拖动 / 数字输入时逐次写入骨骼并刷新画布，但不记历史。
  const liveUpdate = (key, value) => {
    if (!bone || !editor) return;
    const next = { ...values, [key]: Number(value) };
    setValues(next);
    editor.applyTransformLive?.(bone, next);
  };
  // 交互结束（松手 / 失焦）：固化一次到历史。
  const commit = () => {
    if (!bone || !editor) return;
    editor.commitTransform?.('liveTransform');
    onChanged?.();
  };
  const act = (callback) => {
    callback();
    setValues(boneValues(bone));
    onChanged?.();
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        {bone ? (
          <>
            <Badge variant="secondary">{bone.data.name}</Badge>
            <NumberField label="X" step={0.01} value={values.x} onLive={liveUpdate.bind(null, 'x')} onCommit={commit} />
            <NumberField label="Y" step={0.01} value={values.y} onLive={liveUpdate.bind(null, 'y')} onCommit={commit} />
            <SliderField label="旋转" unit="°" min={-180} max={180} step={0.1} value={values.rotation} onLive={liveUpdate.bind(null, 'rotation')} onCommit={commit} />
            <SliderField label="Scale X" min={0} max={3} step={0.01} value={values.scaleX} onLive={liveUpdate.bind(null, 'scaleX')} onCommit={commit} />
            <SliderField label="Scale Y" min={0} max={3} step={0.01} value={values.scaleY} onLive={liveUpdate.bind(null, 'scaleY')} onCommit={commit} />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => act(() => editor?.flip(bone, 'x'))}><FlipHorizontal2 className="h-4 w-4" />水平</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => act(() => editor?.flip(bone, 'y'))}><FlipVertical2 className="h-4 w-4" />竖直</Button>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => act(() => editor?.resetBone(bone))}><RotateCcw className="h-4 w-4" />重置骨骼</Button>
          </>
        ) : <p className="text-xs text-muted-foreground">在骨骼树或画布中选择骨骼</p>}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => act(() => editor?.flipCharacter('x'))}><FlipHorizontal2 className="h-4 w-4" />角色</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => act(() => editor?.flipCharacter('y'))}><FlipVertical2 className="h-4 w-4" />角色</Button>
        </div>
        <Button type="button" variant="destructive" size="sm" className="w-full" onClick={() => act(() => editor?.resetAll())}>全部重置</Button>
      </div>
    </ScrollArea>
  );
}

/** 数字输入：onChange 实时预览，onBlur/Enter 提交历史 */
function NumberField({ label, step, value, onLive, onCommit }) {
  return (
    <div className="grid grid-cols-[56px_1fr] items-center gap-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onLive?.(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.target.blur(); }}
        className="h-8 text-xs"
      />
    </div>
  );
}

/**
 * 滑条 + 数值显示：拖动时 onChange 实时刷新画布，松手 onPointerUp/onBlur 提交一次历史。
 * 用原生 input[range] 以拿到稳定的拖动流；外观按已有手柄风格轻量适配。
 */
function SliderField({ label, min, max, step, value, unit = '', onLive, onCommit }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onLive?.(event.target.value)}
        onPointerUp={onCommit}
        onBlur={onCommit}
        className="slider-sm h-4 w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

function boneValues(bone) {
  return {
    x: round(bone?.x || 0),
    y: round(bone?.y || 0),
    rotation: round(bone?.rotation || 0),
    scaleX: round(bone?.scaleX ?? 1),
    scaleY: round(bone?.scaleY ?? 1),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
