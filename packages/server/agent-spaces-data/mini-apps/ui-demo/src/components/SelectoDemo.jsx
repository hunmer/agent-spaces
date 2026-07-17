const { Selecto, Button } = window.AgentSpacesUI;

import sharedStyles from "../utils/styles";

// 选中态走 CSS class，由 selecto 事件直接操作 DOM。
// 关键：不调用 React setState，避免重渲染把 className 重置回 "selecto-cell"
// 而清掉手动加的 "selected"。
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
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease;
}
.selecto-cell.selected {
  border: 2px solid #6366f1;
  background: rgb(99 102 241 / 0.18) !important;
  color: #6366f1 !important;
  box-shadow: 0 0 0 3px rgb(99 102 241 / 0.2);
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
  countBadge: {
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 999,
    background: "hsl(var(--primary) / 0.12)",
    color: "hsl(var(--primary))",
    border: "1px solid hsl(var(--primary) / 0.3)",
  },
  diag: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "hsl(var(--muted-foreground))",
    marginTop: 8,
    minHeight: 16,
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
  const countRef = React.useRef(null);
  const diagRef = React.useRef(null);
  const eventSeq = React.useRef(0);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (!Selecto) {
      if (diagRef.current) diagRef.current.textContent = "⚠️ Selecto 未注入 window.AgentSpacesUI";
      return;
    }

    const refreshCount = () => {
      const n = stage.querySelectorAll(".selecto-cell.selected").length;
      if (countRef.current) countRef.current.textContent = `已选 ${n} / ${TOTAL}`;
    };
    const log = (msg) => {
      eventSeq.current += 1;
      if (diagRef.current)
        diagRef.current.textContent = `#${eventSeq.current}  ${msg}`;
    };

    let selecto;
    try {
      selecto = new Selecto({
        container: stage,
        selectableTargets: [".selecto-cell"],
        selectByClick: true,
        selectFromInside: true,
        continueSelect: false,
        toggleContinueSelect: "shift",
        hitRate: 1,
      });
    } catch (err) {
      if (diagRef.current) diagRef.current.textContent = "⚠️ Selecto 实例化失败: " + (err && err.message);
      return;
    }
    selectoRef.current = selecto;

    selecto.on("selectStart", () => log("selectStart"));
    selecto.on("select", (e) => {
      const added = (e && e.added) || [];
      const removed = (e && e.removed) || [];
      added.forEach((el) => el.classList.add("selected"));
      removed.forEach((el) => el.classList.remove("selected"));
      log(`select  +${added.length} -${removed.length}`);
      refreshCount();
    });
    selecto.on("selectEnd", (e) => {
      // 兜底：用全量 selected 列表重置，防止中途事件丢失
      const selected = (e && e.selected) || [];
      stage
        .querySelectorAll(".selecto-cell.selected")
        .forEach((el) => el.classList.remove("selected"));
      selected.forEach((el) => el.classList.add("selected"));
      log(`selectEnd  共 ${selected.length} 项`);
      refreshCount();
    });

    log("已就绪，拖拽试试");

    return () => {
      try { selecto.destroy(); } catch { /* ignore */ }
      selectoRef.current = null;
    };
  }, []);

  const clear = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage
      .querySelectorAll(".selecto-cell.selected")
      .forEach((el) => el.classList.remove("selected"));
    if (countRef.current) countRef.current.textContent = `已选 0 / ${TOTAL}`;
  };

  return (
    <div>
      <style>{CELL_STYLE_CSS}</style>
      <Section title="Selecto 拖拽框选">
        <div style={styles.toolbar}>
          <Button variant="outline" size="sm" onClick={clear}>
            清除选择
          </Button>
          <span ref={countRef} style={styles.countBadge}>
            已选 0 / {TOTAL}
          </span>
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

        <div ref={diagRef} style={styles.diag}>
          初始化中…
        </div>
      </Section>
    </div>
  );
}
