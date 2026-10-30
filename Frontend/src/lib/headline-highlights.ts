export type HeadlineHighlight = { start: number; end: number };

export function colorHeadline(ranges: HeadlineHighlight[], start: number, end: number, orange: boolean): HeadlineHighlight[] {
  if (start >= end) return ranges;
  const remaining = ranges.flatMap(range => range.end <= start || range.start >= end ? [range] : [
    ...(range.start < start ? [{ start: range.start, end: start }] : []),
    ...(range.end > end ? [{ start: end, end: range.end }] : []),
  ]);
  if (orange) remaining.push({ start, end });
  return remaining.sort((a, b) => a.start - b.start).reduce<HeadlineHighlight[]>((merged, range) => {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

export function headlineParts(title: string, ranges: HeadlineHighlight[] = []) {
  const chars = Array.from(title);
  let cursor = 0;
  const parts: { text: string; orange: boolean }[] = [];
  for (const range of ranges) {
    parts.push({ text: chars.slice(cursor, range.start).join(''), orange: false });
    parts.push({ text: chars.slice(range.start, range.end).join(''), orange: true });
    cursor = range.end;
  }
  parts.push({ text: chars.slice(cursor).join(''), orange: false });
  return parts;
}
