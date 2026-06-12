const {
  Alert,
  AlertTitle,
  AlertDescription,
  Loader,
  MorphingSpinner,
  Shimmer,
  Skeleton,
  BorderGlide,
  MovingBorder,
  Card,
  CardContent,
  Separator,
} = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

const styles = {
  ...sharedStyles,
  row: { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 12 },
};

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

export default function AlertDemo() {
  return (
    <div>
      <Section title="Alert 提示">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <Alert>
            <AlertTitle>提示</AlertTitle>
            <AlertDescription>
              您的订阅将于 7 天后到期，请及时续费以免服务中断。
            </AlertDescription>
          </Alert>

          <Alert variant="destructive">
            <AlertTitle>错误</AlertTitle>
            <AlertDescription>
              操作失败，请检查网络连接后重试。错误代码: ERR_NETWORK_TIMEOUT
            </AlertDescription>
          </Alert>
        </div>
        <div style={styles.hint}>支持 default 和 destructive 两种变体</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Loader 加载器">
        <div style={styles.row}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Loader />
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>默认</span>
          </div>
        </div>
      </Section>

      <Section title="MorphingSpinner 变形加载">
        <div style={styles.row}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <MorphingSpinner />
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>变形动画</span>
          </div>
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Shimmer 文字微光">
        <div style={{ maxWidth: 320 }}>
          <Shimmer>AgentSpacesUI 组件库加载中...</Shimmer>
        </div>
        <div style={styles.hint}>文字闪光扫过动画，需传入文字内容</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Skeleton 骨架屏">
        <div style={{ maxWidth: 320 }}>
          <Skeleton style={{ height: 16, borderRadius: 4, marginBottom: 8 }} />
          <Skeleton style={{ height: 16, borderRadius: 4, width: "80%", marginBottom: 8 }} />
          <Skeleton style={{ height: 16, borderRadius: 4, width: "60%" }} />
        </div>
        <div style={styles.hint}>常用于内容加载占位</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="BorderGlide 边框滑动">
        <BorderGlide style={{ borderRadius: 12, padding: 2 }}>
          <Card style={{ border: "none" }}>
            <CardContent style={{ padding: 16 }}>
              <div style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>
                ✨ BorderGlide — 边框光效滑动动画
              </div>
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                适用于需要突出显示的卡片或区域
              </div>
            </CardContent>
          </Card>
        </BorderGlide>
      </Section>

      <Section title="MovingBorder 移动边框">
        <MovingBorder style={{ borderRadius: 12, padding: 2 }}>
          <Card style={{ border: "none" }}>
            <CardContent style={{ padding: 16 }}>
              <div style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>
                🎯 MovingBorder — 边框移动动画
              </div>
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                不同于 BorderGlide 的另一种边框动画风格
              </div>
            </CardContent>
          </Card>
        </MovingBorder>
      </Section>
    </div>
  );
}
