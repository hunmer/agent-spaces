## Open Questions / Risks

- loop body 既支持 scope 内部节点，也支持 `bodyWorkflow` 数据，两条路径并存，长期容易分叉。
- `sub_workflow` 通过引用独立 workflow 实体执行，没有显式的版本锁定。
  - 被引用 workflow 更新后，调用方语义会变化。
- composite node 的 root/child/generated edge 一旦归一化逻辑改错，删除、连接、日志都会一起坏。
- loop 的并发和 shared vars 存在天然竞态风险，改 shared variable 语义时要特别小心。