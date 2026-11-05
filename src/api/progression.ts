// src/api/progression.ts
// Cumulative construction: the mechanism builds up beat by beat instead
// of arriving as a finished pile. A part is introduced by the first
// beat that spotlights it (or any of its group-mates, so assemblies
// arrive whole); everything not yet introduced stays hidden. Pure and
// synchronous: the UI derives hidden/dimmed sets from this.

export interface ProgressionBeat {
  becauseOf: string[];
}

export interface ProgressionGroup {
  members: string[];
}

/** IDs introduced up to and including currentBeat (1-based). */
export function introducedIds(
  beats: ProgressionBeat[] | undefined,
  groups: ProgressionGroup[] | undefined,
  currentBeat: number
): Set<string> {
  const introduced = new Set<string>();
  for (const b of (beats ?? []).slice(0, Math.max(currentBeat, 0))) {
    for (const ref of b.becauseOf ?? []) introduced.add(ref);
  }
  for (const g of groups ?? []) {
    if (g.members.some((m) => introduced.has(m))) {
      for (const m of g.members) introduced.add(m);
    }
  }
  return introduced;
}
