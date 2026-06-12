const {
  Separator,
  ScrollArea,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
} = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

const styles = { ...sharedStyles };

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

const scrollItems = Array.from({ length: 20 }, (_, i) => `列表项 ${i + 1} - 示例内容文本`);

export default function LayoutDemo() {
  return (
    <div>
      <Section title="Separator 分隔符">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>章节一</span>
          <Separator orientation="vertical" style={{ height: 16 }} />
          <span style={{ fontSize: 14 }}>章节二</span>
          <Separator orientation="vertical" style={{ height: 16 }} />
          <span style={{ fontSize: 14 }}>章节三</span>
        </div>
        <Separator />
        <div style={{ fontSize: 14, padding: "8px 0", color: "hsl(var(--muted-foreground))" }}>
          水平分隔符上方的内容
        </div>
        <div style={styles.hint}>支持水平和垂直方向</div>
      </Section>

      <Section title="ScrollArea 滚动区域">
        <ScrollArea style={{ height: 180, border: "1px solid hsl(var(--border))", borderRadius: 8, padding: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {scrollItems.map((item, i) => (
              <div key={i} style={{
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 4,
                background: i % 2 === 0 ? "hsl(var(--muted))" : "transparent",
                color: "hsl(var(--foreground))",
              }}>
                {item}
              </div>
            ))}
          </div>
        </ScrollArea>
        <div style={styles.hint}>自定义滚动条样式的可滚动容器，共 20 条数据</div>
      </Section>

      <Section title="ResizablePanelGroup 可调整面板">
        <div style={styles.subtitle}>拖拽面板边框调整大小</div>
        <ResizablePanelGroup direction="horizontal" style={{ height: 200, border: "1px solid hsl(var(--border))", borderRadius: 8 }}>
          <ResizablePanel defaultSize={40} style={{ padding: 16 }}>
            <Card style={{ height: "100%" }}>
              <CardHeader>
                <CardTitle style={{ fontSize: 14 }}>左侧面板</CardTitle>
              </CardHeader>
              <CardContent>
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
                  拖动中间分隔线调整面板宽度
                </p>
              </CardContent>
            </Card>
          </ResizablePanel>
          <ResizableHandle style={{ width: 4 }} />
          <ResizablePanel defaultSize={60} style={{ padding: 16 }}>
            <Card style={{ height: "100%" }}>
              <CardHeader>
                <CardTitle style={{ fontSize: 14 }}>右侧面板</CardTitle>
              </CardHeader>
              <CardContent>
                <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
                  可调整大小的面板布局，适用于编辑器、文件管理器等场景。
                </p>
              </CardContent>
            </Card>
          </ResizablePanel>
        </ResizablePanelGroup>
        <div style={styles.hint}>拖动面板之间的分隔条调整比例</div>
      </Section>
    </div>
  );
}
