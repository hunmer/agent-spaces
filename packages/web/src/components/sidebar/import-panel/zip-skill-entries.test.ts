import assert from 'node:assert/strict';
import test from 'node:test';
import { getZipSkillEntries } from './zip-skill-entries';

test('getZipSkillEntries keeps references as files of the root skill', () => {
  assert.deepEqual(getZipSkillEntries([
    'SKILL.md',
    'references/banned-words.md',
    'references/examples.md',
  ], 'unclecheng-reduce-ai-perception-v2-1.0.4'), [
    {
      name: 'unclecheng-reduce-ai-perception-v2-1.0.4',
      path: 'SKILL.md',
      root: '',
      files: ['references/banned-words.md', 'references/examples.md'],
    },
  ]);
});
