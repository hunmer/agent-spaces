const {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Button,
  Input,
  Label,
  Separator,
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

export default function DialogDemo() {
  return (
    <div>
      <Section title="Dialog 对话框">
        <div style={styles.row}>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">打开 Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>编辑个人资料</DialogTitle>
                <DialogDescription>
                  修改您的个人信息，完成后点击保存。
                </DialogDescription>
              </DialogHeader>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Label>显示名称</Label>
                  <Input placeholder="请输入名称" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Label>邮箱</Label>
                  <Input type="email" placeholder="user@example.com" />
                </div>
              </div>
              <DialogFooter>
                <Button>保存更改</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div style={styles.hint}>模态对话框，支持标题、描述、内容和底部操作区</div>
      </Section>

      <Section title="AlertDialog 警告对话框">
        <div style={styles.row}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">删除账户</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确定要删除账户吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作不可撤销。删除后您的所有数据将被永久移除，包括个人资料、文件和设置。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction>确认删除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div style={styles.hint}>用于需要用户明确确认的危险操作</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Sheet 侧边抽屉">
        <div style={styles.row}>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">打开 Sheet (右侧)</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>设置面板</SheetTitle>
                <SheetDescription>
                  在此调整应用的显示偏好设置。
                </SheetDescription>
              </SheetHeader>
              <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>🔹 主题设置</div>
                <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>🔹 通知偏好</div>
                <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>🔹 隐私选项</div>
                <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>🔹 语言切换</div>
              </div>
              <SheetFooter>
                <Button>保存设置</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
        <div style={styles.hint}>从屏幕边缘滑入的面板，适合设置和详情展示</div>
      </Section>

      <Section title="Drawer 底部抽屉">
        <div style={styles.row}>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline">打开 Drawer (底部)</Button>
            </DrawerTrigger>
            <DrawerContent>
              <div style={{ maxWidth: 480, margin: "0 auto" }}>
                <DrawerHeader>
                  <DrawerTitle>移动目标</DrawerTitle>
                  <DrawerDescription>选择要将项目移动到的位置。</DrawerDescription>
                </DrawerHeader>
                <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {["📄 文档", "🖼️ 图片", "🎵 音乐", "📦 下载"].map((item) => (
                    <Button key={item} variant="outline" style={{ justifyContent: "flex-start" }}>
                      {item}
                    </Button>
                  ))}
                </div>
                <DrawerFooter>
                  <Button>确认</Button>
                  <DrawerClose asChild>
                    <Button variant="outline">取消</Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
        <div style={styles.hint}>从底部滑入，常用于移动端操作面板</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Popover 气泡卡片">
        <div style={styles.row}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">打开 Popover</Button>
            </PopoverTrigger>
            <PopoverContent style={{ width: 240 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>快捷操作</div>
                <Separator />
                <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>📋 复制链接</div>
                <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>📌 固定到顶部</div>
                <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>🔗 分享给他人</div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div style={styles.hint}>点击触发的浮动卡片，用于快捷操作面板</div>
      </Section>

      <Section title="HoverCard 悬停卡片">
        <div style={styles.row}>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="link" style={{ padding: 0, height: "auto" }}>
                @AgentSpacesUI
              </Button>
            </HoverCardTrigger>
            <HoverCardContent style={{ width: 280 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>🤖</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>AgentSpacesUI</div>
                  <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                    237 个高质量 React 组件，开箱即用。
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div style={styles.hint}>鼠标悬停触发的信息预览卡片</div>
      </Section>
    </div>
  );
}
