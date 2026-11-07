import assert from 'node:assert/strict';
import test from 'node:test';
import { getTaskEventsSince } from './mini-app-task-events';

test('returns every event received before the first dispatch', () => {
  const events = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(getTaskEventsSince(events, null), events);
});

test('returns all events appended after the cursor in one React update', () => {
  const first = { id: 1 };
  const second = { id: 2 };
  const third = { id: 3 };
  assert.deepEqual(getTaskEventsSince([first, second, third], first), [second, third]);
});

test('returns the retained buffer when the cursor has rolled out', () => {
  const expired = { id: 0 };
  const retained = [{ id: 51 }, { id: 52 }];
  assert.deepEqual(getTaskEventsSince(retained, expired), retained);
});
