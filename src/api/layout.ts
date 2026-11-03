// src/api/layout.ts
// Deterministic stage manager. The model describes WHAT exists (parts,
// substances, sizes, causal chain). Code decides WHERE each part stands.
// This is the first-principles split: LLMs have no spatial grounding, so
// positions from the model are treated as rough hints and recomputed here
// into a tight museum row: causal order along X, every solid seated on
// the stage (bottom at y=0), backdrops pushed behind, effects kept near
// their beat. Tight composition is guaranteed structurally, not by luck.

import type { DslNode, SceneDsl, Vec3 } from "../types";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.abs(v) : 0;
}

/** Half-extents (hx, hy) of a node in world units. */
export function estimateExtents(n: DslNode): { hx: number; hy: number } {
  const a = n.geometry?.args;
  const arr = Array.isArray(a) ? a : [];
  const sx = num(n.transform.s[0]) || 1;
  const sy = num(n.transform.s[1]) || 1;
  switch (n.type) {
    case "box":
      return {
        hx: (num(arr[0]) || 1) * sx / 2,
        hy: (num(arr[1]) || 1) * sy / 2,
      };
    case "cylinder":
    case "cone":
      // Builder may pass [r,h] or three-style [rTop,rBottom,h].
      if (arr.length <= 2) {
        return { hx: (num(arr[0]) || 0.5) * sx, hy: (num(arr[1]) || 1) * sy / 2 };
      }
      return {
        hx: Math.max(num(arr[0]) || 0.5, num(arr[1]) || 0.5) * sx,
        hy: (num(arr[2]) || 1) * sy / 2,
      };
    case "sphere":
    case "icosahedron":
    case "dodecahedron":
    case "octahedron":
    case "tetrahedron":
      return { hx: (num(arr[0]) || 0.5) * sx, hy: (num(arr[0]) || 0.5) * sy };
    case "torus":
    case "torusKnot":
    case "ring":
      return {
        hx: ((num(arr[0]) || 0.5) + (num(arr[1]) || 0.2)) * sx,
        hy: ((num(arr[0]) || 0.5) + (num(arr[1]) || 0.2)) * sy,
      };
    case "capsule":
      return {
        hx: (num(arr[0]) || 0.3) * sx,
        hy: ((num(arr[1]) || 1) / 2 + (num(arr[0]) || 0.3)) * sy,
      };
    case "model":
      // Renderer normalizes heroes to ~3 units, scaled by s.
      return { hx: 1.5 * sx, hy: 1.5 * sy };
    case "tube": {
      const path = n.geometry?.path;
      if (Array.isArray(path) && path.length > 0) {
        let rx = 0.15;
        let ry = 0.15;
        const p0 = n.transform.p;
        for (const pt of path) {
          if (Array.isArray(pt)) {
            rx = Math.max(rx, Math.abs(num(pt[0]) - p0[0]));
            ry = Math.max(ry, Math.abs(num(pt[1]) - p0[1]));
          }
        }
        const r = num(n.geometry?.radius) || 0.15;
        return { hx: (rx + r) * sx, hy: (ry + r) * sy };
      }
      return { hx: 0.5 * sx, hy: 0.5 * sy };
    }
    case "points":
      return { hx: 1 * sx, hy: 1 * sy };
    case "circle":
    case "plane":
      return { hx: (num(arr[0]) || 1) * sx / 2, hy: (num(arr[1]) || 1) * sy / 2 };
    default:
      return { hx: 0.75 * sx, hy: 0.75 * sy };
  }
}

function isBackdropNode(n: DslNode): boolean {
  // Horizontal leftovers (should have been rejected) and vertical
  // walls stay out of the row; the renderer pushes them behind.
  if (n.type === "plane" || n.type === "circle" || n.type === "ring") return true;
  const a = n.geometry?.args;
  const arr = Array.isArray(a) ? a : [];
  if (n.type === "box") {
    const h = (num(arr[1]) || 1) * (num(n.transform.s[1]) || 1);
    const w = Math.max(
      (num(arr[0]) || 0) * (num(n.transform.s[0]) || 1),
      (num(arr[2]) || 0) * (num(n.transform.s[2]) || 1)
    );
    if (h <= 1.5 && w >= 8) return true;
  }
  return false;
}

/** Order nodes by causal chain, keeping group members adjacent. */
function causalOrder(dsl: SceneDsl): DslNode[] {
  const byId = new Map(dsl.nodes.map((n) => [n.id, n]));
  const groupOf = new Map<string, string>();
  for (const g of dsl.groups ?? []) for (const m of g.members) groupOf.set(m, g.id);
  const seen = new Set<string>();
  const ordered: DslNode[] = [];
  const emitGroup = (id: string): void => {
    const gid = groupOf.get(id);
    if (!gid) {
      if (!seen.has(id) && byId.has(id)) {
        seen.add(id);
        ordered.push(byId.get(id)!);
      }
      return;
    }
    const g = (dsl.groups ?? []).find((x) => x.id === gid);
    if (!g) return;
    for (const m of g.members) {
      if (!seen.has(m) && byId.has(m)) {
        seen.add(m);
        ordered.push(byId.get(m)!);
      }
    }
  };
  for (const b of dsl.beats) for (const ref of b.becauseOf ?? []) emitGroup(ref);
  for (const n of dsl.nodes) emitGroup(n.id);
  return ordered;
}

/**
 * Re-seat every row node: causal order along X with contact gaps,
 * bottoms at y=0, centered on the origin. Tube paths translate with
 * their node. Returns a new SceneDsl; the input is untouched.
 */
export function layoutScene(dsl: SceneDsl): SceneDsl {
  const ordered = causalOrder(dsl).filter((n) => !isBackdropNode(n));
  if (ordered.length === 0) return dsl;
  const ext = new Map<string, { hx: number; hy: number }>();
  for (const n of ordered) {
    const e = estimateExtents(n);
    ext.set(n.id, { hx: Math.min(Math.max(e.hx, 0.3), 6), hy: Math.min(Math.max(e.hy, 0.3), 6) });
  }
  // Cursor pass: gap 0.15 inside a group (touching), 0.7 between organs.
  const groupOf = new Map<string, string>();
  for (const g of dsl.groups ?? []) for (const m of g.members) groupOf.set(m, g.id);
  let cursor = 0;
  const xs = new Map<string, number>();
  ordered.forEach((n, i) => {
    const e = ext.get(n.id)!;
    const prev = i > 0 ? ordered[i - 1] : null;
    const sameGroup = prev && groupOf.get(prev.id) !== undefined && groupOf.get(prev.id) === groupOf.get(n.id);
    cursor += (i === 0 ? e.hx : e.hx + (sameGroup ? 0.15 : 0.7));
    xs.set(n.id, cursor);
    cursor += e.hx;
  });
  const total = cursor;
  const shiftX = total / 2;
  const nodes = dsl.nodes.map((n) => {
    if (!xs.has(n.id)) {
      // Backdrop: pin behind the action, centered vertically near the row.
      if (n.type === "plane" || n.type === "circle" || n.type === "ring") {
        return {
          ...n,
          transform: { ...n.transform, p: [0, 2.5, -6] as Vec3 },
        };
      }
      return n;
    }
    const e = ext.get(n.id)!;
    const nx = xs.get(n.id)! - shiftX;
    const ny = e.hy + 0.02;
    const old = n.transform.p;
    const dx = nx - old[0];
    const dy = ny - old[1];
    const dz = 0 - old[2];
    let geometry = n.geometry;
    if (n.type === "tube" && Array.isArray(n.geometry?.path)) {
      // Translate with the node, but clamp reach: one sprawling hose
      // must never own the frame or the ground. Shape is preserved,
      // sprawl is not.
      const MAX_REACH = 5;
      const clamp = (v: number, c: number): number =>
        c + Math.max(-MAX_REACH, Math.min(MAX_REACH, v - c));
      geometry = {
        ...n.geometry,
        path: (n.geometry.path as [number, number, number][]).map(
          ([x, y, z]) => [clamp(x + dx, nx), clamp(y + dy, ny), clamp(z + dz, 0)] as Vec3
        ),
      };
    }
    return {
      ...n,
      transform: { ...n.transform, p: [nx, ny, 0] as Vec3 },
      geometry,
    };
  });
  return { ...dsl, nodes };
}
