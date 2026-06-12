const {
  Button,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  CopyButton,
  HoldToConfirm,
  Badge,
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

export default function ButtonDemo() {
  const [toggleValue, setToggleValue] = React.useState("bold");

  return (
    <div>
      <Section title="Button 变体">
        <div style={styles.subtitle}>Variant: default / destructive / outline / secondary / ghost / link</div>
        <div style={styles.row}>
          <Button variant="default">Default</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
      </Section>

      <Section title="Button 尺寸">
        <div style={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon">🚀</Button>
        </div>
      </Section>

      <Section title="Button 状态">
        <div style={styles.row}>
          <Button>正常按钮</Button>
          <Button disabled>禁用按钮</Button>
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Toggle / ToggleGroup">
        <div style={styles.subtitle}>单个 Toggle（按下切换）</div>
        <div style={styles.row}>
          <Toggle>粗体</Toggle>
          <Toggle>斜体</Toggle>
          <Toggle aria-label="下划线">
            <span style={{ textDecoration: "underline" }}>U</span>
          </Toggle>
        </div>

        <div style={styles.subtitle}>ToggleGroup（单选 / 多选）</div>
        <ToggleGroup type="single" value={toggleValue} onValueChange={setToggleValue}>
          <ToggleGroupItem value="bold" aria-label="Bold">
            <strong>B</strong>
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <em>I</em>
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <span style={{ textDecoration: "underline" }}>U</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <div style={styles.hint}>当前选中: {toggleValue || "(无)"}</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="CopyButton">
        <div style={styles.row}>
          <CopyButton value="Hello AgentSpacesUI!" />
          <CopyButton value="复制的文本内容" />
        </div>
        <div style={styles.hint}>点击图标复制文本到剪贴板</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="HoldToConfirm">
        <div style={styles.row}>
          <HoldToConfirm onConfirm={() => alert("已确认删除！")}>
            <Button variant="destructive">长按确认删除</Button>
          </HoldToConfirm>
        </div>
        <div style={styles.hint}>长按按钮触发确认操作</div>
      </Section>
    </div>
  );
}
