const {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Button,
  Separator,
  Popover,
  PopoverContent,
  PopoverTrigger,
} = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

const styles = {
  ...sharedStyles,
  row: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 },
};

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

export default function MenuDemo() {
  return (
    <div>
      <Section title="DropdownMenu 下拉菜单">
        <div style={styles.row}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                我的账户 ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent style={{ width: 200 }}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>我的账户</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  👤 个人资料
                  <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  ⚙️ 设置
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  🌨️ 键盘快捷键
                  <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  💬 反馈
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  🐙 GitHub
                </DropdownMenuItem>
                <DropdownMenuItem>
                  🎨 主题
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  🚪 退出登录
                  <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div style={styles.hint}>点击触发下拉菜单，支持分组、标签和快捷键提示</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="ContextMenu 右键菜单">
        <ContextMenu>
          <ContextMenuTrigger style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 120,
            border: "1px dashed hsl(var(--border))",
            borderRadius: 8,
            fontSize: 14,
            color: "hsl(var(--muted-foreground))",
          }}>
            在此区域右键点击
          </ContextMenuTrigger>
          <ContextMenuContent style={{ width: 200 }}>
            <ContextMenuItem>返回</ContextMenuItem>
            <ContextMenuItem>前进</ContextMenuItem>
            <ContextMenuItem>重新加载</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuLabel>编辑</ContextMenuLabel>
              <ContextMenuItem>
                剪切
                <ContextMenuShortcut>⌘X</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>
                复制
                <ContextMenuShortcut>⌘C</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>
                粘贴
                <ContextMenuShortcut>⌘V</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        </ContextMenu>
        <div style={styles.hint}>在虚线区域内点击鼠标右键触发菜单</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Command 命令面板">
        <div style={styles.subtitle}>内嵌式命令面板（类似 VS Code 的 Cmd+K）</div>
        <div style={{ maxWidth: 480 }}>
          <Command style={{ borderRadius: 8 }}>
            <CommandInput placeholder="输入命令或搜索..." />
            <CommandList>
              <CommandEmpty>未找到匹配结果</CommandEmpty>
              <CommandGroup heading="建议">
                <CommandItem>📅 日历</CommandItem>
                <CommandItem>🎨 搜索表情符号</CommandItem>
                <CommandItem>🧮 计算器</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="设置">
                <CommandItem>⚙️ 通用设置</CommandItem>
                <CommandItem>👤 个人资料</CommandItem>
                <CommandItem>🔔 通知</CommandItem>
                <CommandItem>🌐 语言和地区</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
        <div style={styles.hint}>输入文字可以过滤命令列表</div>
      </Section>
    </div>
  );
}
