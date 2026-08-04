import {
  Background, Controls, ControlButton, MarkerType, ReactFlow,
} from '@xyflow/react';
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle, Images, MapPinned,
} from '@agent-spaces/ui';

import Toolbar from '../Toolbar';
import RightPanel from '../RightPanel';
import ConnectionLine from '../ConnectionLine';
import ExecutionQueuePopover from '../ExecutionQueuePopover';
import WorkspaceSwitcher from '../WorkspaceSwitcher';
import CanvasContextMenu from './CanvasContextMenu';
import DropNodeMenu from './DropNodeMenu';
import MultiSelectToolbar from './MultiSelectToolbar';
import ImageSelectionToolbar from './ImageSelectionToolbar';
import GroupOverlays from './GroupOverlays';
import GroupMiniMap from './GroupMiniMap';
import FloatingEdge from './FloatingEdge';
import AlignmentGuides from './AlignmentGuides';
import { NODE_META } from '../../utils/constants';
import { PANEL_ID_MAIN, PANEL_ID_RIGHT } from '../../utils/canvas-constants';

const EDGE_TYPES = { floating: FloatingEdge };
const DEFAULT_EDGE_OPTIONS = {
  type: 'floating',
  markerEnd: { type: MarkerType.ArrowClosed },
};
const SNAP_GRID = [16, 16];

export default function CanvasWorkspace({
  activeId,
  panelLayout,
  onPanelLayoutChange,
  toolbarProps,
  workspaceSwitcherProps,
  queueProps,
  canvasContainerProps,
  canvasContextMenuProps,
  reactFlowProps,
  backgroundVariant,
  alignmentProps,
  previewControl,
  minimapControl,
  minimapProps,
  groupOverlayProps,
  multiSelectProps,
  imageSelectionMenuProps,
  dropNodeMenuProps,
  rightPanelProps,
  children,
}) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full min-h-0"
      defaultLayout={panelLayout}
      onLayoutChange={onPanelLayoutChange}
    >
      <ResizablePanel id={PANEL_ID_MAIN} order={1} minSize="40%">
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <Toolbar
            {...toolbarProps}
            workspaceSlot={<WorkspaceSwitcher {...workspaceSwitcherProps} />}
            queueSlot={<ExecutionQueuePopover {...queueProps} />}
          />
          <CanvasContextMenu
            triggerElement={<div className="relative min-h-0 flex-1" {...canvasContainerProps} />}
            {...canvasContextMenuProps}
          >
            <ReactFlow
              key={activeId}
              {...reactFlowProps}
              connectionLineComponent={ConnectionLine}
              connectionRadius={160}
              nodeTypes={reactFlowProps.nodeTypes}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              snapGrid={SNAP_GRID}
              minZoom={0.01}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={backgroundVariant} gap={16} size={1} />
              <AlignmentGuides {...alignmentProps} />
              <Controls>
                <ControlButton
                  title={previewControl.title}
                  aria-label={previewControl.title}
                  aria-pressed={previewControl.enabled}
                  onClick={previewControl.onToggle}
                  style={{ background: previewControl.enabled ? 'var(--accent)' : undefined }}
                >
                  <Images className="h-4 w-4" />
                </ControlButton>
                <ControlButton
                  title={minimapControl.visible ? '隐藏小地图' : '显示小地图'}
                  onClick={minimapControl.onToggle}
                  style={{ background: minimapControl.visible ? undefined : 'var(--accent)' }}
                >
                  <MapPinned className="h-4 w-4" />
                </ControlButton>
              </Controls>
              {minimapControl.visible && (
                <GroupMiniMap
                  {...minimapProps}
                  pannable
                  zoomable
                  nodeColor={(node) => NODE_META[node.type]?.color || '#94a3b8'}
                  maskColor="rgb(0 0 0 / 0.05)"
                />
              )}
              <GroupOverlays {...groupOverlayProps} />
            </ReactFlow>

            <MultiSelectToolbar {...multiSelectProps} />
            <ImageSelectionToolbar {...imageSelectionMenuProps} />
            <DropNodeMenu {...dropNodeMenuProps} />
          </CanvasContextMenu>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel id={PANEL_ID_RIGHT} order={2} minSize="18%" maxSize="48%">
        <RightPanel {...rightPanelProps} />
      </ResizablePanel>

      {children}
    </ResizablePanelGroup>
  );
}
