const {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  ShinyBadge,
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
  Status,
  StatusIndicator,
  StatusLabel,
  Progress,
  Skeleton,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
  Button,
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

const invoices = [
  { id: "INV001", customer: "张三", amount: "¥ 250.00", status: "已支付" },
  { id: "INV002", customer: "李四", amount: "¥ 150.00", status: "待处理" },
  { id: "INV003", customer: "王五", amount: "¥ 350.00", status: "已支付" },
  { id: "INV004", customer: "赵六", amount: "¥ 450.00", status: "已退款" },
  { id: "INV005", customer: "钱七", amount: "¥ 550.00", status: "待处理" },
];

const statusVariant = {
  已支付: "default",
  待处理: "secondary",
  已退款: "destructive",
};

export default function DataDisplayDemo() {
  const [progress, setProgress] = React.useState(45);

  return (
    <div>
      <Section title="Badge 徽章">
        <div style={styles.row}>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      <Section title="ShinyBadge 闪光徽章">
        <div style={styles.row}>
          <ShinyBadge text="Pro" />
          <ShinyBadge text="New" />
          <ShinyBadge text="Hot" />
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Avatar 头像">
        <div style={styles.subtitle}>单个头像</div>
        <div style={styles.row}>
          <Avatar>
            <AvatarFallback>AS</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback style={{ background: "#3b82f6" }}>JD</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback style={{ background: "#8b5cf6" }}>MK</AvatarFallback>
          </Avatar>
        </div>

        <div style={styles.subtitle}>头像组 (AvatarGroup)</div>
        <AvatarGroup>
          <Avatar><AvatarFallback>AS</AvatarFallback></Avatar>
          <Avatar><AvatarFallback style={{ background: "#3b82f6" }}>JD</AvatarFallback></Avatar>
          <Avatar><AvatarFallback style={{ background: "#8b5cf6" }}>MK</AvatarFallback></Avatar>
          <Avatar><AvatarFallback style={{ background: "#f59e0b" }}>LW</AvatarFallback></Avatar>
        </AvatarGroup>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Status 状态">
        <div style={styles.row}>
          <Status>
            <StatusIndicator style={{ color: "#22c55e" }} />
            <StatusLabel>在线</StatusLabel>
          </Status>
          <Status>
            <StatusIndicator style={{ color: "#f59e0b" }} />
            <StatusLabel>离开</StatusLabel>
          </Status>
          <Status>
            <StatusIndicator style={{ color: "#ef4444" }} />
            <StatusLabel>忙碌</StatusLabel>
          </Status>
          <Status>
            <StatusIndicator style={{ color: "hsl(var(--muted-foreground))" }} />
            <StatusLabel>离线</StatusLabel>
          </Status>
        </div>
      </Section>

      <Section title="Progress 进度条">
        <div style={{ maxWidth: 400 }}>
          <Progress value={progress} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={styles.hint}>{progress}%</span>
            <div style={{ display: "flex", gap: 4 }}>
              <Button size="sm" variant="outline" onClick={() => setProgress(Math.max(0, progress - 10))}>-10</Button>
              <Button size="sm" variant="outline" onClick={() => setProgress(Math.min(100, progress + 10))}>+10</Button>
            </div>
          </div>
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Skeleton 骨架屏">
        <div style={{ maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Skeleton style={{ width: 48, height: 48, borderRadius: "50%" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton style={{ width: "60%", height: 16 }} />
              <Skeleton style={{ width: "40%", height: 12 }} />
            </div>
          </div>
          <Skeleton style={{ width: "100%", height: 80 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Skeleton style={{ width: 80, height: 32 }} />
            <Skeleton style={{ width: 80, height: 32 }} />
          </div>
        </div>
        <div style={styles.hint}>数据加载时的占位动画</div>
      </Section>

      <Section title="Empty 空状态">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无数据</EmptyTitle>
            <EmptyDescription>
              当前列表为空，请添加新项目或尝试其他筛选条件。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline">添加项目</Button>
          </EmptyContent>
        </Empty>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Table 数据表格">
        <Table>
          <TableCaption>最近的订单列表</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>订单号</TableHead>
              <TableHead>客户</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell style={{ fontWeight: 500 }}>{inv.id}</TableCell>
                <TableCell>{inv.customer}</TableCell>
                <TableCell>{inv.amount}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[inv.status]}>{inv.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
