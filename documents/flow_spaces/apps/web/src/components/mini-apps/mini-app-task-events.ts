export function getTaskEventsSince<T>(events: T[] | undefined, cursor: T | null): T[] {
  if (!events?.length) return [];
  if (cursor === null) return events;
  const cursorIndex = events.lastIndexOf(cursor);
  return cursorIndex >= 0 ? events.slice(cursorIndex + 1) : events;
}
