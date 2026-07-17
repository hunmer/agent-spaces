const { Selecto, Button, Badge } = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

// 选中态样式直接走 CSS class，由 selecto 事件操作 DOM，
// 不经过 React state，避免高频 select 事件丢更新。
const CELL_STYLE_CSS = `
.selecto-cell {
  height: 72px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  transition: all 0.12s ease;
}
.selecto-cell.selected {
  border: 2px solid hsl(var(--primary));
  background: hsl(var(--primary) / 0.18);
  color: hsl(var(--primary));
  box-shadow: 0 0 0 3px hsl(var(--primary) / 0.2);
  transform: scale(1.04);
}
`;

const styles = {
  ...sharedStyles,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  stage: {
    position: "relative",
    border: "1px dashed hsl(var(--border))",
    borderRadius: 8,
    padding: 16,
    background: "hsl(var(--muted) / 0.3)",
    minHeight: 320,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
    gap: 12,
  },
};

const TOTAL = 24;

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

export default function SelectoDemo() {
  const stageRef = React.useRef(null);
  const selectoRef = React.useRef(null);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !Selecto) return;

    const syncCount = () => {
      setCount(stage.querySelectorAll(".selecto-cell.selected").length);
    };

    const selecto = new Selecto({
      container: stage,
      selectableTargets: [".selecto-cell"],
      selectByClick: true,
      selectFromInside: true,
      continueSelect: false,
      toggleContinueSelect: "shift",
      hitRate: 10,
    });
    selectoRef.current = selecto;

    const apply = (e) => {
      (e.added || []).forEach((el) => el.classList.add("selected"));
      (e.removed || []).forEach((el) => el.classList.remove("selected"));
      syncCount();
    };

    selecto.on("select", apply);
    selecto.on("selectEnd", apply);

    return () => {
      selecto.destroy();
      selectoRef.current = null;
    };
  }, []);

  const clear = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage
      .querySelectorAll(".selecto-cell.selected")
      .forEach((el) => el.classList.remove("selected"));
    setCount(0);
  };

  return (
    <div>
      <style>{CELL_STYLE_CSS}</style>
      <Section title="Selecto 拖拽框选">
        <div style={styles.toolbar}>
          <Button variant="outline" size="sm" onClick={clear}>
            清除选择
          </Button>
          <Badge variant="secondary">
            已选 {count} / {TOTAL}
          </Badge>
          <span style={styles.hint}>
            按住鼠标拖出选区；按住 Shift 可累加选择
          </span>
        </div>

        <div ref={stageRef} style={styles.stage}>
          <div style={styles.grid}>
            {Array.from({ length: TOTAL }, (_, i) => {
              const id = String(i + 1);
              return (
                <div key={id} className="selecto-cell" data-id={id}>
                  {id}
                </div>
              );
            })}
          </div>
        </div>
      </Section>
    </div>
  );
}
