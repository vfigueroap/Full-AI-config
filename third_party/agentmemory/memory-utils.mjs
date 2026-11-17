// Adapted from rohitg00/agentmemory src/state/memory-utils.ts.
const MAX_DATE_MS = 8.64e15;

export function supersededAt(previous, now) {
  const prior = previous ? Date.parse(previous) : Number.NaN;
  const current = Date.parse(now);
  if (Number.isNaN(prior) || current > prior) return now;
  return new Date(Math.min(prior + 1, MAX_DATE_MS)).toISOString();
}
