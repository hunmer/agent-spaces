import { useCallback, useEffect, useRef, useState } from 'react';
import { applyNodeChanges } from '@xyflow/react';
import { computeAlignmentGuides } from '../utils/alignment-guides';

const EMPTY_GUIDES = { vertical: null, horizontal: null };

function sameGuides(a, b) {
  return a.vertical === b.vertical && a.horizontal === b.horizontal;
}

export default function useAlignmentGuides({ nodes, setNodes, enabled, zoom }) {
  const nodesRef = useRef(nodes);
  const [guides, setGuides] = useState(EMPTY_GUIDES);
  nodesRef.current = nodes;

  const clearGuides = useCallback(() => {
    setGuides((current) => (sameGuides(current, EMPTY_GUIDES) ? current : EMPTY_GUIDES));
  }, []);

  useEffect(() => {
    if (!enabled) clearGuides();
  }, [clearGuides, enabled]);

  const onNodesChange = useCallback((changes) => {
    let nextChanges = changes;
    const dragging = changes.filter((change) => (
      change.type === 'position' && change.dragging === true && change.position
    ));

    if (enabled && dragging.length === 1) {
      const moving = dragging[0];
      const aligned = computeAlignmentGuides(
        nodesRef.current,
        moving.id,
        moving.position,
        zoom,
      );
      nextChanges = changes.map((change) => (
        change === moving ? { ...change, position: aligned.position } : change
      ));
      const nextGuides = { vertical: aligned.vertical, horizontal: aligned.horizontal };
      setGuides((current) => (sameGuides(current, nextGuides) ? current : nextGuides));
    } else {
      clearGuides();
    }

    setNodes((current) => applyNodeChanges(nextChanges, current));
  }, [clearGuides, enabled, setNodes, zoom]);

  return { guides, onNodesChange, clearGuides };
}

