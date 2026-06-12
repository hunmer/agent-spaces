/**
 * 共享展示样式
 *
 * 所有 Demo 组件通用的 Section 样式定义。
 * 集中管理便于统一调整主题适配（亮色/暗色模式）。
 */

const styles = {
  section: { marginBottom: 24 },
  title: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 12,
    marginTop: 0,
    color: "hsl(var(--foreground))",
    paddingLeft: 10,
    borderLeft: "3px solid hsl(var(--primary))",
    lineHeight: 1.4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 8,
    color: "hsl(var(--muted-foreground))",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: "hsl(var(--muted-foreground))",
    marginTop: 4,
  },
};

export default styles;
