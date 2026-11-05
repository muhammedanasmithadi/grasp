// src/api/layout.ts
// Deterministic stage manager. The model describes WHAT exists (parts,
// substances, sizes, causal chain). Code decides WHERE each part stands.
// This is the first-principles split: LLMs have no spatial grounding, so
// positions from the model are treated as rough hints and recomputed here
// into a tight museum row: causal order along X, every solid seated on
// the stage (bottom at y=0), backdrops pushed behind, effects kept near
// their beat. Tight composition is guaranteed structurally, not by luck.

import type { DslJoint, DslNode, SceneDsl, Vec3 } from "../types";

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

/** Joint re-derivation. Model-authored anchors point at pre-layout
 * positions that no longer exist after staging, and model RPM values
 * are arbitrary (a 4-unit wheel at 60rpm is a blur, not a mechanism).
 * Anchors become midpoints of the staged pair, axes fall back to the
 * face-on default when degenerate, and RPM clamps to tip speed:
 * small parts may spin fast, big parts turn slowly. Ranges stay
 * model-authored: swing span is lesson content, not taste. */
function deriveJoints(
  nodes: DslNode[],
  joints: DslJoint[]
): DslJoint[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return joints.map((j) => {
    const a = byId.get(j.a);
    const b = byId.get(j.b);
    if (!a || !b) return j;
    const mid: Vec3 = [
      (a.transform.p[0] + b.transform.p[0]) / 2,
      (a.transform.p[1] + b.transform.p[1]) / 2,
      (a.transform.p[2] + b.transform.p[2]) / 2,
    ];
    const ax = Array.isArray(j.axis) ? j.axis : [0, 0, 1];
    const len = Math.hypot(ax[0], ax[1], ax[2]);
    const axis: Vec3 = len > 0.01 ? [ax[0] / len, ax[1] / len, ax[2] / len] : [0, 0, 1];
    const eb = estimateExtents(b);
    const r = Math.max(eb.hx, eb.hy, eb.hz, 0.2);
    const modelRpm =
      typeof j.driver?.rpm === "number" && Number.isFinite(j.driver.rpm)
        ? Math.abs(j.driver.rpm)
        : 20;
    const rpm = Math.max(3, Math.min(modelRpm, Math.max(6, Math.round(20 / r))));
    return {
      ...j,
      anchor: mid,
      axis,
      driver: { ...(j.driver ?? {}), kind: "time", rpm } as DslJoint["driver"],
    };
  });
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
  // (validator clamps inputs, so these bounds are defensive, not load-bearing).
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
      const base = (geometry ?? n.geometry)!;
      geometry = {
        ...base,
        path: (base.path as [number, number, number][]).map((pt) => tx(pt)),
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

  // De-penetration: authored positions routinely interpenetrate (the
  // model has no collision sense). Relax solid pairs apart in plan
  // view (x/z only, so stacking and heights survive) until AABBs no
  // longer overlap. Assemblies stay clustered; chaos becomes contact.
  const solids = nodes.filter(
    (n) =>
      n.type !== "tube" &&
      n.type !== "points" &&
      n.type !== "plane" &&
      n.type !== "circle" &&
      n.type !== "ring" &&
      !isBackdropNode(n)
  );
  const boxOf = (n: DslNode) => {
    const e = estimateExtents(n);
    const [x, y, z] = n.transform.p;
    return { x, y, z, hx: e.hx, hy: e.hy, hz: e.hz };
  };
  // Children follow their placed parents: authored relative offsets,
  // scaled by the scene factor k, are re-applied after staging so
  // assemblies keep internal layout. De-penetration runs first on
  // parentless solids only, so pushes never detach a child; then
  // children reattach to moved parents.
  const authored = new Map(dsl.nodes.map((n) => [n.id, n]));
  const followChildren = (): void => {
    const placed = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (!n.parent) continue;
      const pp = placed.get(n.parent);
      const ap = authored.get(n.parent);
      const an = authored.get(n.id);
      if (!pp || !ap || !an) continue;
      n.transform = {
        ...n.transform,
        p: [
          pp.transform.p[0] + (an.transform.p[0] - ap.transform.p[0]) * k,
          pp.transform.p[1] + (an.transform.p[1] - ap.transform.p[1]) * k,
          pp.transform.p[2] + (an.transform.p[2] - ap.transform.p[2]) * k,
        ] as Vec3,
      };
    }
  };
  // Parented parts never take part in pushing: they inherit their
  // parent's placement below, so moving them here would only detach
  // them before reattachment.
  const movers = solids.filter((n) => !n.parent);
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = boxOf(movers[i]);
        const b = boxOf(movers[j]);
        if (Math.abs(a.y - b.y) >= a.hy + b.hy) continue; // stacked, not colliding
        // Enclosure is not collision: a cabinet, dome, or tub fully
        // containing another part in plan view is doing its job.
        const contains = (o: typeof a, i: typeof b): boolean =>
          Math.abs(i.x - o.x) + i.hx <= o.hx + 0.01 &&
          Math.abs(i.z - o.z) + i.hz <= o.hz + 0.01;
        if (contains(a, b) || contains(b, a)) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const penX = a.hx + b.hx - Math.abs(dx);
        const penZ = a.hz + b.hz - Math.abs(dz);
        if (penX <= 0 || penZ <= 0) continue;
        moved = true;
        if (penX <= penZ) {
          const push = (penX / 2 + 0.02) * (dx >= 0 ? 1 : -1);
          movers[i].transform = { ...movers[i].transform, p: [a.x - push, a.y, a.z] as unknown as Vec3 };
          movers[j].transform = { ...movers[j].transform, p: [b.x + push, b.y, b.z] as unknown as Vec3 };
        } else {
          const push = (penZ / 2 + 0.02) * (dz >= 0 ? 1 : -1);
          movers[i].transform = { ...movers[i].transform, p: [a.x, a.y, a.z - push] as unknown as Vec3 };
          movers[j].transform = { ...movers[j].transform, p: [b.x, b.y, b.z + push] as unknown as Vec3 };
        }
      }
    }
    if (!moved) break;
  }
  // Re-center in plan after relaxation so pushes cannot drift the scene.
  // Uniform shift: relative assembly offsets survive it.
  if (solids.length > 0) {
    let lo = Infinity, hi = -Infinity, loZ = Infinity, hiZ = -Infinity;
    for (const n of solids) {
      const b = boxOf(n);
      lo = Math.min(lo, b.x - b.hx); hi = Math.max(hi, b.x + b.hx);
      loZ = Math.min(loZ, b.z - b.hz); hiZ = Math.max(hiZ, b.z + b.hz);
    }
    const ox = (lo + hi) / 2;
    const oz = (loZ + hiZ) / 2;
    for (const n of solids) {
      n.transform = {
        ...n.transform,
        p: [n.transform.p[0] - ox, n.transform.p[1], n.transform.p[2] - oz] as Vec3,
      };
    }
  }
  followChildren();
  const joints = deriveJoints(nodes, dsl.joints);
  return { ...dsl, nodes, joints };
}
