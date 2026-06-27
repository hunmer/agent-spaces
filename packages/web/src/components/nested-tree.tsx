"use client"

/**
 * NestedTree —— 通用嵌套树公共组件
 *
 * 从 editor/file-tree.tsx 抽取的纯展示型递归树，不耦合任何编辑器上下文
 * （next-intl / sdk / terminal store），可在任意场景（含 mini-app 预览）复用。
 *
 * 职责：
 *  1. 递归渲染任意带 children 的节点数据
 *  2. 暴露展开态（expandedIds 支持数组或对象）、激活态、拖拽态
 *  3. 把行级 props（draggable / 拖拽事件 / 缩进 padding）交给调用方组合
 *
 * 不负责：数据加载、选中/展开状态管理、文件系统语义。这些都由调用方驱动。
 */

import {
  Fragment,
  type CSSProperties,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react"

export type NestedTreeRenderState = {
  /** 当前层级深度，根为 0 */
  level: number
  /** 是否有子节点 */
  hasChildren: boolean
  /** 当前节点是否展开 */
  isExpanded: boolean
  /** 当前节点是否激活 */
  isActive: boolean
  /** 是否正被拖拽悬停 */
  isDraggedOver: boolean
}

export type NestedTreeRowProps = HTMLAttributes<HTMLDivElement> & {
  draggable?: boolean
  style?: CSSProperties
}

export type NestedTreeRenderArgs<TNode> = {
  node: TNode
  state: NestedTreeRenderState
  rowProps: NestedTreeRowProps
  children: ReactNode
}

export type NestedTreeProps<TNode> = {
  /** 顶层节点数组 */
  nodes: TNode[]
  /** 取节点稳定 id */
  getNodeId: (node: TNode) => string
  /** 取节点子节点数组 */
  getChildren: (node: TNode) => TNode[]
  /** 当前激活节点 id（用于高亮） */
  activeId?: string | null
  /** 展开态：支持对象（id -> boolean）或 Set（包含即展开） */
  expandedIds?: Record<string, boolean> | Set<string>
  /** 正被拖拽悬停的节点 id */
  draggedOverId?: string | null
  /** 是否在非展开节点上也渲染子节点（如懒加载场景需提前挂载） */
  shouldRenderChildren?: (node: TNode, state: NestedTreeRenderState) => boolean
  onDragStart?: (event: DragEvent<HTMLDivElement>, nodeId: string) => void
  onDragOver?: (event: DragEvent<HTMLDivElement>, nodeId: string) => void
  onDragLeave?: (event: DragEvent<HTMLDivElement>, nodeId: string) => void
  onDrop?: (event: DragEvent<HTMLDivElement>, nodeId: string) => void
  /** 单个节点的渲染函数 */
  renderNode: (args: NestedTreeRenderArgs<TNode>) => ReactNode
}

const hasExpandedId = (
  expandedIds: NestedTreeProps<unknown>["expandedIds"],
  id: string,
) => {
  if (!expandedIds) return false
  if (expandedIds instanceof Set) return expandedIds.has(id)
  return !!expandedIds[id]
}

export function NestedTree<TNode>({
  nodes,
  getNodeId,
  getChildren,
  activeId,
  expandedIds,
  draggedOverId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  shouldRenderChildren,
  renderNode,
}: NestedTreeProps<TNode>) {
  const renderBranch = (branchNodes: TNode[], level: number): ReactNode => (
    branchNodes.map((node) => {
      const id = getNodeId(node)
      const childrenNodes = getChildren(node)
      const state: NestedTreeRenderState = {
        level,
        hasChildren: childrenNodes.length > 0,
        isExpanded: hasExpandedId(expandedIds, id),
        isActive: activeId === id,
        isDraggedOver: draggedOverId === id,
      }
      const showChildren =
        state.hasChildren &&
        (shouldRenderChildren?.(node, state) ?? state.isExpanded)
      const rowProps: NestedTreeRowProps = {
        draggable: true,
        style: { paddingLeft: level * 12 },
        onDragStart: (event) => onDragStart?.(event, id),
        onDragOver: (event) => onDragOver?.(event, id),
        onDragLeave: (event) => onDragLeave?.(event, id),
        onDrop: (event) => onDrop?.(event, id),
      }

      return (
        <Fragment key={id}>
          {renderNode({
            node,
            state,
            rowProps,
            children: showChildren ? renderBranch(childrenNodes, level + 1) : null,
          })}
        </Fragment>
      )
    })
  )

  return <>{renderBranch(nodes, 0)}</>
}

export default NestedTree
