import assert from 'node:assert/strict';
import test from 'node:test';

import { PoseExporter } from '../exporters/PoseExporter.js';

test('pose export preserves Spine bone rotation degrees', () => {
  const result = PoseExporter.export({
    name: 'character',
    _spineVersion: '4.2',
    skeleton: {
      bones: [{
        data: { name: 'root' },
        x: 0,
        y: 0,
        rotation: 90,
        scaleX: 1,
        scaleY: 1,
      }],
    },
  });

  assert.equal(result.pose[0].rotation, 90);
});
