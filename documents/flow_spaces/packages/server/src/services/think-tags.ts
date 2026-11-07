export type ThinkTagPart = { type: 'message' | 'thinking'; content: string };

const OPEN = '<think>';
const CLOSE = '</think>';

export function createThinkTagSplitter(onPart: (part: ThinkTagPart) => void) {
  let buffer = '';
  let inThinking = false;

  const emit = (content: string) => {
    if (content) onPart({ type: inThinking ? 'thinking' : 'message', content });
  };

  const push = (chunk: string) => {
    let text = buffer + chunk;
    buffer = '';

    while (text) {
      const tag = inThinking ? CLOSE : OPEN;
      const index = text.toLowerCase().indexOf(tag);
      if (index === -1) {
        const keep = partialTagLength(text, tag);
        emit(text.slice(0, text.length - keep));
        buffer = text.slice(text.length - keep);
        return;
      }

      emit(text.slice(0, index));
      text = text.slice(index + tag.length);
      inThinking = !inThinking;
    }
  };

  const flush = () => {
    emit(buffer);
    buffer = '';
  };

  return { push, flush };
}

function partialTagLength(text: string, tag: string): number {
  const lower = text.toLowerCase();
  const max = Math.min(tag.length - 1, lower.length);
  for (let length = max; length > 0; length -= 1) {
    if (tag.startsWith(lower.slice(-length))) return length;
  }
  return 0;
}
