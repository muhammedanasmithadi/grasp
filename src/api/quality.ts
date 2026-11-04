// src/api/quality.ts
// Closed-loop quality gate: score a laid-out scene 0-100 so the client
// can re-prompt until the world passes instead of shipping the first
// draft. Every check mirrors QUALITY.md; every input is the DSL the
// renderer will actually see (post-layout), so staging fixes and
// scoring can never disagree.

import type { SceneDsl } from "../types";
import { matchesSubstance } from "./substance";

export interface QualityBreakdown {
  hero: number;
  substance: number;
  groups: number;
  beats: number;
  spine: number;
  tubes: number;
  compact: number;
  seated: number;
  grounds: number;
}

export interface QualityScore {
  score: number;
  checks: QualityBreakdown;
}

/** Score a laid-out scene. Deterministic, pure, no I/O. */
export function scoreSceneDsl(dsl: SceneDsl): QualityScore {
  const nodes = dsl.nodes;
  const n = Math.max(nodes.length, 1);

  // A real scan carries a scene. Capped: one hero is enough.
  const hero = nodes.some((x) => x.type === "model") ? 15 : 0;

  // Named matter on ordinary parts (explicit maps count double-weight
  // via full credit; auto-matchable labels count too).
  const mattered = nodes.filter(
    (x) =>
      x.type !== "tube" &&
      x.type !== "points" &&
      x.type !== "model" &&
      (typeof x.material.map === "string" ||
        matchesSubstance(x.label, x.id, x.type))
  ).length;
  const substance = Math.round(
    (mattered / Math.max(nodes.filter((x) => x.type !== "tube" && x.type !== "points" && x.type !== "model").length, 1)) * 15
  );

  // Group coverage: what fraction of parts belongs to an assembly.
  const grouped = new Set<string>();
  for (const g of dsl.groups ?? []) for (const m of g.members) grouped.add(m);
  const groups = Math.round((grouped.size / n) * 10);

  // Teaching spine: 3-8 beats, distinct spotlight labels.
  const beats = dsl.beats.length >= 3 && dsl.beats.length <= 8 ? 10 : 0;
  const labelOf = (id: string): string =>
    nodes.find((x) => x.id === id)?.label.toLowerCase() ?? String(id);
  const parts = dsl.beats.map((b) => labelOf(b.becauseOf[0]));
  const spine = parts.length > 0 && new Set(parts).size === parts.length ? 10 : 0;

  // Hoses stay home: penalize long paths (validator caps at 6, layout
  // clamps at 3.5, so anything above ~4 here slipped through).
  let worstReach = 0;
  for (const x of nodes) {
    if (x.type !== "tube" || !Array.isArray(x.geometry?.path)) continue;
    const p = x.transform.p;
    for (const pt of x.geometry.path as [number, number, number][]) {
      worstReach = Math.max(
        worstReach,
        Math.abs(pt[0] - p[0]),
        Math.abs(pt[1] - p[1]),
        Math.abs(pt[2] - p[2])
      );
    }
  }
  const tubes = worstReach <= 4 ? 10 : worstReach <= 6 ? 6 : 2;

  // Compact street: everything within a short walk of the origin.
  const maxX = Math.max(...nodes.map((x) => Math.abs(x.transform.p[0])), 0.1);
  const compact = maxX <= 8 ? 10 : maxX <= 12 ? 6 : 2;

  // Seated solids: bottoms at or above the stage.
  const solids = nodes.filter((x) => x.type !== "tube" && x.type !== "points");
  const minY = Math.min(...solids.map((x) => x.transform.p[1]), 0);
  const seated = minY >= -0.5 ? 10 : 0;

  // No authored stages: wide horizontal slabs or planes.
  const grounds = nodes.some((x) => {
    const a = x.geometry?.args;
    const arr = Array.isArray(a) ? a : [];
    const num = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) ? Math.abs(v) : 0;
    const s = x.transform.s;
    if ((x.type === "plane" || x.type === "circle") && num(arr[0]) * (num(s[0]) || 1) >= 8) {
      return Math.abs(num(x.transform.r[0]) - Math.PI / 2) < 0.15;
    }
    if (x.type === "box") {
      const h = num(arr[1]) * (num(s[1]) || 1);
      const w = Math.max(num(arr[0]) * (num(s[0]) || 1), num(arr[2]) * (num(s[2]) || 1));
      return h <= 1.5 && w >= 8 && num(x.transform.p[1]) - h / 2 <= 1.0;
    }
    return false;
  })
    ? 0
    : 10;

  const checks = { hero, substance, groups, beats, spine, tubes, compact, seated, grounds };
  const score = Object.values(checks).reduce((a, b) => a + b, 0);
  return { score, checks };
}

/** Acceptance threshold: below this the client re-prompts. */
export const ACCEPT_SCORE = 70;
