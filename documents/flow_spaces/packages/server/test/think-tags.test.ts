import assert from 'node:assert/strict';
import { createThinkTagSplitter, type ThinkTagPart } from '../src/services/think-tags.js';

const parts: ThinkTagPart[] = [];
const splitter = createThinkTagSplitter((part) => parts.push(part));

splitter.push('hello <thi');
splitter.push('nk>hidden</think> world <think>again');
splitter.flush();

assert.deepEqual(parts, [
  { type: 'message', content: 'hello ' },
  { type: 'thinking', content: 'hidden' },
  { type: 'message', content: ' world ' },
  { type: 'thinking', content: 'again' },
]);
