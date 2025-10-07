export type Entry = { count: number };

export function computeProgress(planned: number, entries: Entry[]) {
  const safePlanned =
    Number.isFinite(planned) && planned > 0 ? Math.floor(planned) : 0;
  const done = entries.reduce(
    (sum, e) => sum + Math.max(0, Math.floor(e?.count ?? 0)),
    0
  );
  const remaining = Math.max(0, safePlanned - done);
  const overflow = Math.max(0, done - safePlanned);
  const percent =
    safePlanned > 0 ? Math.min(100, Math.round((done / safePlanned) * 100)) : 0;

  return { done, remaining, overflow, percent };
}
