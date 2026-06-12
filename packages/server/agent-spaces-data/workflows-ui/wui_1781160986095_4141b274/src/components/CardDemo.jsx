const {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Button,
  Badge,
} = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

const styles = {
  ...sharedStyles,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 16 },
};

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

export default function CardDemo() {
  const [collapsibleOpen, setCollapsibleOpen] = React.useState(false);

  return (
    <div>
      <Section title="Card 基础卡片">
        <div style={styles.grid}>
          <Card>
            <CardHeader>
              <CardTitle>通知</CardTitle>
              <CardDescription>您有 3 条未读消息</CardDescription>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: 14 }}>这是卡片的正文内容区域，可以放置任意内容。</p>
            </CardContent>
            <CardFooter style={{ justifyContent: "flex-end" }}>
              <Button size="sm" variant="outline">查看全部</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>项目状态</CardTitle>
              <CardDescription>当前迭代进度</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14 }}>前端开发</span>
                  <Badge variant="default">进行中</Badge>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14 }}>后端 API</span>
                  <Badge variant="secondary">已完成</Badge>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14 }}>测试部署</span>
                  <Badge variant="outline">待开始</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>简约卡片</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
                只有标题和内容的简约卡片样式。
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Accordion 手风琴">
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>什么是 AgentSpacesUI？</AccordionTrigger>
            <AccordionContent>
              AgentSpacesUI 是一套基于 Radix UI 构建的 React 组件库，提供了 200+ 个开箱即用的高质量组件。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>如何使用这些组件？</AccordionTrigger>
            <AccordionContent>
              通过 <code>window.AgentSpacesUI</code> 全局对象解构所需组件即可使用，无需安装任何依赖。
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>支持哪些组件类型？</AccordionTrigger>
            <AccordionContent>
              支持按钮、表单、对话框、导航、数据展示、图表、动画效果等几乎所有常见 UI 类型。
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section title="Collapsible 折叠">
        <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">
                {collapsibleOpen ? "收起 ▲" : "展开 ▼"}
              </Button>
            </CollapsibleTrigger>
            <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>点击按钮切换内容显示</span>
          </div>
          <CollapsibleContent>
            <Card>
              <CardContent style={{ paddingTop: 16 }}>
                <p style={{ fontSize: 14 }}>
                  这是一段可折叠的内容。通过 Collapsible 组件控制内容的显示与隐藏，
                  适用于需要节省页面空间的场景，如高级选项、详细信息等。
                </p>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
        <div style={styles.hint}>当前状态: {collapsibleOpen ? "展开" : "收起"}</div>
      </Section>
    </div>
  );
}
