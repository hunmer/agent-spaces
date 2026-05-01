"use client";

import { useCallback } from "react";
import { Layout, Model, TabNode, IJsonModel } from "flexlayout-react";
import "flexlayout-react/style/light.css";

const defaultJson: IJsonModel = {
  global: {
    tabSetEnableTabStrip: true,
    borderEnableDrop: true,
  },
  borders: [
    {
      type: "border",
      location: "bottom",
      children: [
        { type: "tab", name: "Terminal", component: "terminal" },
        { type: "tab", name: "Git", component: "git" },
      ],
    },
  ],
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        weight: 0.25,
        children: [
          { type: "tab", name: "Channels", component: "channel-list" },
          { type: "tab", name: "Issues", component: "issue-list" },
        ],
      },
      {
        type: "tabset",
        weight: 0.75,
        children: [
          { type: "tab", name: "Editor", component: "editor" },
          { type: "tab", name: "Chat", component: "chat" },
          { type: "tab", name: "Issue Detail", component: "issue-detail" },
        ],
      },
    ],
  },
};

interface WorkspaceShellProps {
  workspaceId: string;
}

export function WorkspaceShell({ workspaceId }: WorkspaceShellProps) {
  const factory = useCallback(
    (node: TabNode) => {
      const comp = node.getComponent();
      switch (comp) {
        case "channel-list":
          return <Placeholder name="Channels" />;
        case "issue-list":
          return <Placeholder name="Issues" />;
        case "editor":
          return <Placeholder name="Code Editor" />;
        case "chat":
          return <Placeholder name="Chat" />;
        case "issue-detail":
          return <Placeholder name="Issue Detail" />;
        case "terminal":
          return <Placeholder name="Terminal" />;
        case "git":
          return <Placeholder name="Git" />;
        default:
          return <Placeholder name={node.getName()} />;
      }
    },
    [workspaceId],
  );

  const model = Model.fromJson(defaultJson);

  return (
    <div className="h-screen w-screen">
      <Layout model={model} factory={factory} />
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {name} (coming soon)
    </div>
  );
}
