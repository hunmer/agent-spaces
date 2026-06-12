import ButtonDemo from "./components/ButtonDemo";
import CardDemo from "./components/CardDemo";
import FormDemo from "./components/FormDemo";
import DialogDemo from "./components/DialogDemo";
import NavigationDemo from "./components/NavigationDemo";
import DataDisplayDemo from "./components/DataDisplayDemo";
import MenuDemo from "./components/MenuDemo";
import LayoutDemo from "./components/LayoutDemo";
import AlertDemo from "./components/AlertDemo";
import MediaDemo from "./components/MediaDemo";

const {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ScrollArea,
  Badge,
} = window.AgentSpacesUI;

const tabItems = [
  { value: "buttons", label: "🔘 按钮", icon: " BTN", component: ButtonDemo },
  { value: "cards", label: "🃏 卡片", icon: " CARD", component: CardDemo },
  { value: "forms", label: "📝 表单", icon: " FORM", component: FormDemo },
  { value: "dialogs", label: "💬 对话框", icon: " DIALOG", component: DialogDemo },
  { value: "navigation", label: "🧭 导航", icon: " NAV", component: NavigationDemo },
  { value: "data", label: "📊 数据", icon: " DATA", component: DataDisplayDemo },
  { value: "menus", label: "📋 菜单", icon: " MENU", component: MenuDemo },
  { value: "layout", label: "📐 布局", icon: " LAYOUT", component: LayoutDemo },
  { value: "alerts", label: "🔔 反馈", icon: " ALERT", component: AlertDemo },
  { value: "media", label: "🎬 媒体", icon: " MEDIA", component: MediaDemo },
];

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 24px",
  borderBottom: "1px solid hsl(var(--border))",
  marginBottom: 0,
};

const titleStyle = {
  fontSize: 20,
  fontWeight: 700,
  color: "hsl(var(--foreground))",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

function App() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "hsl(var(--background))" }}>
      {/* 顶部标题栏 */}
      <div style={headerStyle}>
        <div style={titleStyle}>
          <span style={{ fontSize: 24 }}>🎨</span>
          AgentSpacesUI 组件展示
        </div>
        <Badge variant="secondary">237 组件</Badge>
      </div>

      {/* 选项卡导航 + 内容区 */}
      <Tabs defaultValue="buttons" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "0 24px", borderBottom: "1px solid hsl(var(--border))" }}>
          <TabsList style={{ flexWrap: "wrap", gap: 4 }}>
            {tabItems.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} style={{ fontSize: 13 }}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabItems.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} style={{ flex: 1, overflow: "hidden" }}>
            <ScrollArea style={{ height: "100%" }}>
              <div style={{ padding: "20px 24px", maxWidth: 960 }}>
                <tab.component />
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default App;
