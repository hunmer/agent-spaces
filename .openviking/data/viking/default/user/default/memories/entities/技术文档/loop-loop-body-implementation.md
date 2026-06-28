本目录包含Web编辑器中`loop`/`loop_body`关键实现的技术参考文档，聚焦节点结构、布局同步、渲染层级、节点操作规则及删除约束等核心逻辑。文档旨在为需维护或迁移该功能的开发者提供技术依据，涵盖`loop`作为根节点、`loop_body`作为自动生成scope边界的结构设计，内置`start`/`end`边界节点的生成与边关系，通过内部子节点反推Scope大小的布局机制。

<!-- MEMORY_FIELDS
{
  "category": "技术文档",
  "name": "loop-loop-body-implementation",
  "user_id": "default",
  "memory_type": "entities"
}
-->