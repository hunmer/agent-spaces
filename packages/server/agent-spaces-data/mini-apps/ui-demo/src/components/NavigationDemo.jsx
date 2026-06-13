const {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

export default function NavigationDemo() {
  const [currentPage, setCurrentPage] = React.useState(1);

  return (
    <div>
      <Section title="Breadcrumb 面包屑导航">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink>首页</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink>组件库</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink>导航</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>面包屑</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div style={styles.hint}>显示当前页面在导航层级中的位置</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Tabs 选项卡">
        <div style={styles.subtitle}>默认选项卡</div>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="features">功能特性</TabsTrigger>
            <TabsTrigger value="changelog">更新日志</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div style={{ padding: "12px 0", fontSize: 14, color: "hsl(var(--foreground))" }}>
              AgentSpacesUI 提供了 237 个高质量 React 组件，覆盖常见 UI 场景。
            </div>
          </TabsContent>
          <TabsContent value="features">
            <div style={{ padding: "12px 0", fontSize: 14, color: "hsl(var(--foreground))" }}>
              基于 Radix UI 原语构建，支持完全的可访问性和键盘导航。
            </div>
          </TabsContent>
          <TabsContent value="changelog">
            <div style={{ padding: "12px 0", fontSize: 14, color: "hsl(var(--foreground))" }}>
              v1.0 — 初始发布，包含所有基础组件。
            </div>
          </TabsContent>
        </Tabs>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Pagination 分页">
        <div style={styles.subtitle}>当前页: {currentPage}</div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              />
            </PaginationItem>
            {[1, 2, 3, 4, 5].map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  isActive={currentPage === page}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage((p) => Math.min(5, p + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        <div style={styles.hint}>点击页码或前后箭头切换分页</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Tooltip 工具提示">
        <TooltipProvider>
          <div style={styles.row}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">💾</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>保存文件</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">📋</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>复制内容</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">🗑️</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>删除项目</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon">⚙️</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>设置</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div style={styles.hint}>悬停在按钮上查看工具提示</div>
      </Section>
    </div>
  );
}
