export function occurrenceKeys(values) {
  const counts = new Map();
  return values.map((value) => {
    const text = String(value);
    const occurrence = counts.get(text) || 0;
    counts.set(text, occurrence + 1);
    return `${occurrence}:${text}`;
  });
}
