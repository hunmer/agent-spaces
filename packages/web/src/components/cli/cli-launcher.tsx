"use client";

import { useMemo } from "react";
import { ChevronDown, TerminalSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRuntimeCliSettings } from "@/lib/runtime-cli-settings";
import { getCliIconUrl } from "@/lib/cli-icons";

function CliIcon({ id, className }: { id: string; className?: string }) {
  const url = getCliIconUrl(id);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} />;
}

interface CliLauncherProps {
  /** 选中某个 CLI 时回调：command（执行命令）、label（显示名）、id（CLI id，用于匹配图标） */
  onPick: (command: string, label: string, id: string) => void;
}

/**
 * CLI 启动器：点击展开已检测到的 CLI 列表，
 * 选中后把 command 传回父组件用于打开新终端并自动执行。
 */
export function CliLauncher({ onPick }: CliLauncherProps) {
  const { items } = useRuntimeCliSettings();

  // 仅展示「已发现 + 已启用」的 CLI 类工具（SDK 不直接当命令跑）
  const cliItems = useMemo(
    () => items.filter((item) => item.category === "cli" && item.found && item.enabled),
    [items],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            title="Launch CLI"
            aria-label="Launch CLI"
          >
            <TerminalSquare className="size-3.5" />
            <span>CLI</span>
            <ChevronDown className="size-3 opacity-70" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Detected CLIs</DropdownMenuLabel>
          {cliItems.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No CLI detected.
              <br />
              Go to <span className="font-medium">Settings → Runtime</span> to discover.
            </div>
          ) : (
            cliItems.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="flex items-center justify-between gap-2"
                onClick={() => onPick(item.command, item.label, item.id)}
              >
                <span className="flex items-center gap-2">
                  <CliIcon id={item.id} className="size-5 shrink-0 rounded-sm" />
                  <span className="flex flex-col">
                    <span className="text-sm">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{item.command}</span>
                  </span>
                </span>
                {item.version && (
                  <span className="text-[10px] text-muted-foreground">v{item.version}</span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
