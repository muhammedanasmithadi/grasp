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

/** Half-extents (hx, hy, hz) of a node in world units. */
export interface Extents { hx: number; hy: number; hz: number }

export function estimateExtents(n: DslNode): Extents {
  const a = n.geometry?.args;
  const arr = Array.isArray(a) ? a : [];
  const sx = num(n.transform.s[0]) || 1;
  const sy = num(n.transform.s[1]) || 1;
  const sz = num(n.transform.s[2]) || 1;
  switch (n.type) {
    case "box":
      return {
        hx: (num(arr[0]) || 1) * sx / 2,
        hy: (num(arr[1]) || 1) * sy / 2,
        hz: (num(arr[2]) || 1) * sz / 2,
      };
    case "cylinder":
    case "cone":
      // Builder may pass [r,h] or three-style [rTop,rBottom,h].
      if (arr.length <= 2) {
        return { hx: (num(arr[0]) || 0.5) * sx, hy: (num(arr[1]) || 1) * sy / 2, hz: (num(arr[0]) || 0.5) * sx };
      }
      return {
        hx: Math.max(num(arr[0]) || 0.5, num(arr[1]) || 0.5) * sx,
        hy: (num(arr[2]) || 1) * sy / 2,
        hz: Math.max(num(arr[0]) || 0.5, num(arr[1]) || 0.5) * sx,
      };
    case "sphere":
    case "icosahedron":
    case "dodecahedron":
    case "octahedron":
    case "tetrahedron":
      return { hx: (num(arr[0]) || 0.5) * sx, hy: (num(arr[0]) || 0.5) * sy, hz: (num(arr[0]) || 0.5) * sx };
    case "torus":
    case "torusKnot":
    case "ring":
      return {
        hx: ((num(arr[0]) || 0.5) + (num(arr[1]) || 0.2)) * sx,
        hy: ((num(arr[0]) || 0.5) + (num(arr[1]) || 0.2)) * sy,
        hz: ((num(arr[0]) || 0.5) + (num(arr[1]) || 0.2)) * sx,
      };
    case "capsule":
      return {
        hx: (num(arr[0]) || 0.3) * sx,
        hy: ((num(arr[1]) || 1) / 2 + (num(arr[0]) || 0.3)) * sy,
        hz: (num(arr[0]) || 0.3) * sx,
      };
    case "model":
      // Renderer normalizes heroes to ~2.4 units, scaled by s.
      return { hx: 1.2 * sx, hy: 1.2 * sy, hz: 1.2 * sx };
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
        // Reach is clamped at placement (see layoutScene), so estimate
        // with the same cap: a sprawling hose must not reserve the row.
        const r = num(n.geometry?.radius) || 0.15;
        return { hx: Math.min(rx + r, 3.65) * sx, hy: Math.min(ry + r, 3.65) * sy, hz: Math.min(rx + r, 3.65) * sx };
      }
      return { hx: 0.5 * sx, hy: 0.5 * sy, hz: 0.5 * sx };
    }
    case "points":
      return { hx: 1 * sx, hy: 1 * sy, hz: 1 * sy };
    case "circle":
    case "plane":
      return { hx: (num(arr[0]) || 1) * sx / 2, hy: (num(arr[1]) || 1) * sy / 2, hz: (num(arr[0]) || 1) * sx / 2 };
    default:
      return { hx: 0.75 * sx, hy: 0.75 * sy, hz: 0.75 * sx };
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

/**
 * Assembled staging. The authored scene is a mechanism, not a parts
 * list: relative positions, sizes, and rotations are preserved exactly.
 * One uniform scale fits the whole assembly to the stage, the whole
 * assembly seats on the floor (lowest bottom at y=0), and the whole
 * assembly centers on the origin. Nothing is rearranged into a row,
 * nothing is resized independently, nothing is deleted.
 *
 * Coordinate contract: node transforms and tube paths are world-space
 * in the authored scene; this function applies one affine transform
 * (uniform scale + translate) to all of them, so every relationship
 * the author expressed survives staging.
 */
export function layoutScene(dsl: SceneDsl): SceneDsl {
  // Template scenes are code-authored contracts: their geometry is the
  // mechanism. Never rearrange, resize, or re-seat them.
  if (dsl.concept.template) return dsl;
  const subjects = dsl.nodes.filter((n) => !isBackdropNode(n));
  if (subjects.length === 0) return dsl;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, z: number): void => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  for (const n of subjects) {
    const e = estimateExtents(n);
    const [px, py, pz] = n.transform.p;
    grow(px - e.hx, py - e.hy, pz - e.hz);
    grow(px + e.hx, py + e.hy, pz + e.hz);
    if (n.type === "tube" && Array.isArray(n.geometry?.path)) {
      const r = num(n.geometry?.radius) || 0.15;
      for (const pt of n.geometry.path as [number, number, number][]) {
        grow(pt[0] - r, pt[1] - r, pt[2] - r);
        grow(pt[0] + r, pt[1] + r, pt[2] + r);
      }
    }
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const floor = minY;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  // Fit the assembly to a 9-unit stage; never explode tiny scenes
  // beyond 3x. The low floor matters: authored spreads can reach
  // ~120 units (parser clamps at ±60), and 9/120 is 0.075.
  const k = Math.max(0.05, Math.min(3, 9 / span));
  const tx = (p: [number, number, number]): Vec3 => [
    (p[0] - cx) * k,
    (p[1] - floor) * k,
    (p[2] - cz) * k,
  ];
  const nodes = dsl.nodes.map((n) => {
    if (isBackdropNode(n) && (n.type === "plane" || n.type === "circle" || n.type === "ring")) {
      // Flat backdrops pin behind the action, as before.
      return { ...n, transform: { ...n.transform, p: [0, 2.5, -6] as Vec3 } };
    }
    let geometry = n.geometry;
    if (n.type === "tube") {
      // A drainpipe-thick beam owns the frame regardless of staging.
      const r = Math.min(num(n.geometry?.radius) || 0.15, 0.4);
      geometry = { ...n.geometry, radius: r };
    }
    if (n.type === "tube" && Array.isArray(n.geometry?.path)) {
      geometry = {
        ...n.geometry,
        path: (n.geometry.path as [number, number, number][]).map((pt) => tx(pt)),
      };
    }
    const s = n.transform.s;
    return {
      ...n,
      transform: {
        ...n.transform,
        p: tx(n.transform.p),
        s: [s[0] * k, s[1] * k, s[2] * k] as Vec3,
      },
      geometry,
    };
  });
  return { ...dsl, nodes };
}
