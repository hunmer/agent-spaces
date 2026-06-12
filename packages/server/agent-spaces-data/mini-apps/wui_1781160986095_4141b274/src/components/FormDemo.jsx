const {
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Textarea,
  Checkbox,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  ColorPicker,
  Label,
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  Separator,
  Button,
} = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

const styles = {
  ...sharedStyles,
  row: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 },
  col: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxWidth: 320 },
};

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

export default function FormDemo() {
  const [inputValue, setInputValue] = React.useState("");
  const [textareaValue, setTextareaValue] = React.useState("");
  const [checked, setChecked] = React.useState(true);
  const [switchOn, setSwitchOn] = React.useState(false);
  const [selectValue, setSelectValue] = React.useState("");
  const [sliderValue, setSliderValue] = React.useState([50]);
  const [color, setColor] = React.useState("#3b82f6");

  return (
    <div>
      <Section title="Input 文本输入">
        <div style={styles.col}>
          <Input
            placeholder="请输入内容..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <Input placeholder="禁用状态" disabled />
          <Input type="password" placeholder="密码输入" />
          <div style={styles.hint}>当前输入: {inputValue || "(空)"}</div>
        </div>
      </Section>

      <Section title="InputGroup 输入组">
        <div style={styles.col}>
          <InputGroup>
            <InputGroupAddon>https://</InputGroupAddon>
            <InputGroupInput placeholder="yoursite.com" />
          </InputGroup>
          <InputGroup>
            <InputGroupInput placeholder="搜索..." />
            <InputGroupButton variant="outline">搜索</InputGroupButton>
          </InputGroup>
        </div>
      </Section>

      <Section title="Textarea 多行文本">
        <div style={styles.col}>
          <Textarea
            placeholder="请输入多行内容..."
            rows={3}
            value={textareaValue}
            onChange={(e) => setTextareaValue(e.target.value)}
          />
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Checkbox 复选框">
        <div style={styles.row}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Checkbox id="terms" checked={checked} onCheckedChange={setChecked} />
            <Label htmlFor="terms">同意服务条款</Label>
          </div>
        </div>
        <div style={styles.hint}>选中状态: {checked ? "✅ 已同意" : "⬜ 未同意"}</div>
      </Section>

      <Section title="Switch 开关">
        <div style={styles.row}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch id="airplane-mode" checked={switchOn} onCheckedChange={setSwitchOn} />
            <Label htmlFor="airplane-mode">飞行模式</Label>
          </div>
        </div>
        <div style={styles.hint}>开关状态: {switchOn ? "开启" : "关闭"}</div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Select 选择器">
        <div style={{ maxWidth: 240 }}>
          <Select value={selectValue} onValueChange={setSelectValue}>
            <SelectTrigger>
              <SelectValue placeholder="选择一个选项" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="react">React</SelectItem>
              <SelectItem value="vue">Vue</SelectItem>
              <SelectItem value="angular">Angular</SelectItem>
              <SelectItem value="svelte">Svelte</SelectItem>
            </SelectContent>
          </Select>
          <div style={styles.hint}>已选择: {selectValue || "(无)"}</div>
        </div>
      </Section>

      <Section title="Slider 滑块">
        <div style={{ maxWidth: 320 }}>
          <Slider
            value={sliderValue}
            onValueChange={setSliderValue}
            max={100}
            step={1}
          />
          <div style={styles.hint}>当前值: {sliderValue[0]}</div>
        </div>
      </Section>

      <Section title="ColorPicker 颜色选择">
        <div style={styles.row}>
          <ColorPicker value={color} onChange={setColor} />
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: color,
            border: "1px solid hsl(var(--border))",
          }} />
          <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{color}</span>
        </div>
      </Section>

      <Separator style={{ margin: "16px 0" }} />

      <Section title="Field / FieldGroup 表单字段">
        <FieldGroup>
          <Field>
            <FieldLabel>用户名</FieldLabel>
            <Input placeholder="请输入用户名" />
            <FieldDescription>用户名长度为 3-20 个字符</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>邮箱地址</FieldLabel>
            <InputGroup>
              <InputGroupInput type="email" placeholder="user@example.com" />
              <InputGroupAddon>@mail</InputGroupAddon>
            </InputGroup>
            <FieldDescription>用于接收系统通知</FieldDescription>
          </Field>
        </FieldGroup>
      </Section>
    </div>
  );
}
