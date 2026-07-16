"use client";

import React, { useState } from "react";
import { TabNode, type IJsonModel } from "flexlayout-react";
import { FlexLayoutShell, type AddableComponent } from "@/components/common/flex-layout-shell";
import { Sparkles, Hash, StickyNote, Palette } from "lucide-react";

// ---------- 示例组件：演示 components 注入 ----------

function WelcomeComponent() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Sparkles className="size-10 text-primary" />
      <h2 className="text-xl font-semibold">FlexLayout Playground</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        这是一个基于 flexlayout-react 的自由布局演示。你可以拖拽 tab、拆分面板、
        浮动窗口、最大化、关闭，并在顶部工具栏切换样式、保存布局预设。
      </p>
      <ul className="mt-2 space-y-1 text-left text-xs text-muted-foreground">
        <li>• 点击左上角 + 添加新 Tab</li>
        <li>• 点击浮窗图标创建独立浮动窗口</li>
        <li>• 点击「预设」保存 / 应用 / 删除布局</li>
        <li>• 右上角下拉切换主题样式</li>
        <li>• 布局数据持久化到 localStorage（key 隔离）</li>
      </ul>
    </div>
  );
}

function CounterComponent() {
  const [count, setCount] = useState(0);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <span className="text-5xl font-bold tabular-nums">{count}</span>
      <div className="flex gap-2">
        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
          onClick={() => setCount((c) => c - 1)}
        >
          -1
        </button>
        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
          onClick={() => setCount(0)}
        >
          reset
        </button>
        <button
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
          onClick={() => setCount((c) => c + 1)}
        >
          +1
        </button>
      </div>
    </div>
  );
}

function NotesComponent() {
  const [text, setText] = useState("");
  return (
    <textarea
      className="h-full w-full resize-none border-none bg-transparent p-3 text-sm outline-none"
      placeholder="在这里记点什么..."
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

function ColorComponent({ node }: { node: TabNode }) {
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="text-sm font-medium">{node.getName()}</div>
      <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-4">
        {colors.map((c) => (
          <div
            key={c}
            className="flex items-center justify-center rounded-md text-xs font-medium text-white"
            style={{ backgroundColor: c }}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 默认布局 ----------

const defaultLayout: IJsonModel = {
  global: {
    tabSetEnableMaximize: true,
    tabSetEnableClose: true,
    tabEnableClose: true,
    // 启用浮动（popout）支持 —— float 图标可用
    tabEnablePopout: true,
    tabEnablePopoutFloatIcon: true,
  },
  borders: [],
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        weight: 50,
        active: true,
        children: [{ type: "tab", name: "欢迎", component: "welcome" }],
      },
      {
        type: "tabset",
        weight: 50,
        children: [{ type: "tab", name: "计数器", component: "counter" }],
      },
    ],
  },
};

// ---------- 可添加的组件清单 ----------

const addableComponents: AddableComponent[] = [
  { key: "welcome", name: "欢迎", icon: <Sparkles className="size-4" /> },
  { key: "counter", name: "计数器", icon: <Hash className="size-4" /> },
  { key: "notes", name: "记事本", icon: <StickyNote className="size-4" /> },
  { key: "color", name: "调色板", icon: <Palette className="size-4" /> },
];

// ---------- 页面 ----------

export function PlaygroundPage() {
  return (
    <div className="h-[var(--app-content-height)] w-full p-2">
      <FlexLayoutShell
        storageKey="playground-demo"
        title="Playground"
        defaultLayout={defaultLayout}
        addableComponents={addableComponents}
        components={{
          welcome: () => <WelcomeComponent />,
          counter: () => <CounterComponent />,
          notes: () => <NotesComponent />,
          color: (node: TabNode) => <ColorComponent node={node} />,
        }}
      />
    </div>
  );
}
