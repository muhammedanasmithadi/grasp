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
  // Template scenes are code-authored contracts: their geometry is the
  // mechanism. Never rearrange, resize, or re-seat them.
  if (dsl.concept.template) return dsl;
  // Copy: placement never mutates the validated input.
  const ordered = causalOrder(dsl)
    .filter((n) => !isBackdropNode(n))
    .map((n) => ({ ...n, transform: { ...n.transform, p: [...n.transform.p] as Vec3, r: [...n.transform.r] as Vec3, s: [...n.transform.s] as Vec3 } }));
  if (ordered.length === 0) return dsl;
  // Effects (hoses-as-atmosphere, particle swarms, beams) do not take
  // row slots: one sprawling path must never size the street. They pin
  // to the row middle after placement, paths translated and clamped.
  // Exception: a tube a beat spotlights IS the subject (wick, straw,
  // arm pipe), not atmosphere. Referenced tubes join the row, seated
  // with the rest, their paths already clamped.
  const referencedByBeats = new Set<string>();
  for (const b of dsl.beats) for (const ref of b.becauseOf ?? []) referencedByBeats.add(ref);
  const isEffect = (n: DslNode): boolean =>
    n.type === "points" || (n.type === "tube" && !referencedByBeats.has(n.id));
  // Parented nodes take no row slot: they follow their parent with the
  // authored relative offset preserved (a key stays inside its housing).
  const row = ordered.filter((n) => !isEffect(n) && !n.parent);
  const effects = ordered.filter(isEffect);
  const ext = new Map<string, Extents>();
  for (const n of row) {
    const e = estimateExtents(n);
    ext.set(n.id, { hx: Math.min(Math.max(e.hx, 0.01), 8), hy: Math.min(Math.max(e.hy, 0.01), 8), hz: Math.min(Math.max(e.hz, 0.01), 8) });
  }
  // Cursor pass: gap 0.15 inside a group (touching), 0.7 between organs.
  const groupOf = new Map<string, string>();
  for (const g of dsl.groups ?? []) for (const m of g.members) groupOf.set(m, g.id);
  // No giants, no specks: uniform presence for solid primitives.
  // Rescale s so the largest half-extent lands in [0.5, 1.2]; proportions
  // preserved. A tall thin mast counts by height, not just girth.
  // Models keep authorial scale but are capped, never grown: a hero
  // scan must not dwarf the row it belongs to.
  // Tubes keep authorial scale (rescaling s would warp world-unit
  // paths) but cap the slot they reserve so one hose never sizes
  // the street. Particles and backdrops keep their own sizing.
  // Assembly-preserving presence: one uniform factor per group (or per
  // solo node), derived from the group's largest member. Relative sizes
  // inside an assembly are never distorted; only the whole assembly
  // scales. Models are capped, never grown. Tubes keep authorial scale
  // (rescaling s would warp world-unit paths) but cap their slot.
  const ownTarget = (n: DslNode, biggest: number): number =>
    n.type === "model" ? Math.min(biggest, 1.2) : Math.min(Math.max(biggest, 0.5), 1.2);
  const groupMax = new Map<string, number>();
  for (const n of row) {
    const gid = groupOf.get(n.id);
    if (!gid || n.type === "tube") continue;
    const e = ext.get(n.id)!;
    const biggest = Math.max(e.hx, e.hy, e.hz);
    groupMax.set(gid, Math.max(groupMax.get(gid) ?? 0, biggest));
  }
  for (const n of row) {
    if (
      n.type === "points" ||
      n.type === "plane" || n.type === "circle" || n.type === "ring"
    ) continue;
    const e = ext.get(n.id)!;
    if (n.type === "tube") {
      ext.set(n.id, {
        hx: Math.min(e.hx, 2.5),
        hy: Math.min(e.hy, 2.5),
        hz: Math.min(e.hz, 2.5),
      });
      continue;
    }
    const gid = groupOf.get(n.id);
    const basis = gid ? groupMax.get(gid)! : Math.max(e.hx, e.hy, e.hz);
    const biggest = Math.max(e.hx, e.hy, e.hz);
    const k = basis > 0 ? ownTarget(n, basis) / basis : 1;
    void biggest;
    if (Math.abs(k - 1) < 0.01) continue;
    const s = n.transform.s;
    n.transform = { ...n.transform, s: [s[0] * k, s[1] * k, s[2] * k] as Vec3 };
    ext.set(n.id, { hx: e.hx * k, hy: e.hy * k, hz: e.hz * k });
  }
  let cursor = 0;
  const xs = new Map<string, number>();
  row.forEach((n, i) => {
    const e = ext.get(n.id)!;
    const prev = i > 0 ? row[i - 1] : null;
    const sameGroup = prev && groupOf.get(prev.id) !== undefined && groupOf.get(prev.id) === groupOf.get(n.id);
    cursor += (i === 0 ? e.hx : e.hx + (sameGroup ? 0.15 : 0.7));
    xs.set(n.id, cursor);
    cursor += e.hx;
  });
  // Depth stagger: alternate groups between front and back rows so the
  // composition reads in depth, not as a flat lineup. Members of one
  // group share z (contacts stay valid); the gap between organs is in
  // x, so staggering never breaks a mating face.
  const staggerZ = new Map<string, number>();
  {
    const seenGroups: string[] = [];
    const keyOf = (n: DslNode): string => groupOf.get(n.id) ?? `__solo:${n.id}`;
    for (const n of row) {
      const k = keyOf(n);
      if (!seenGroups.includes(k)) seenGroups.push(k);
    }
    seenGroups.forEach((k, i) => staggerZ.set(k, i % 2 === 0 ? 0 : -1.6));
    // Front row stays at 0; back row recedes. Alternate keeps neighbors apart.
  }
  const total = cursor;
  const shiftX = total / 2;
  // Span cap: a 20-organ row would shrink every part to a speck. Squeeze
  // x toward the middle so the whole street fits in 16 units; order and
  // relative gaps survive, contacts stay approximately mated.
  const squeeze = total > 16 ? 16 / total : 1;
  const zOf = (n: DslNode): number => staggerZ.get(groupOf.get(n.id) ?? `__solo:${n.id}`) ?? 0;
  const placed = new Map(ordered.map((n) => [n.id, n]));
  // Nothing is ever deleted here. Wide or stage-like parts are kept and
  // validated like everything else; layout only re-seats row solids.
  const placeOne = (n: (typeof dsl.nodes)[number]): (typeof dsl.nodes)[number] => {
    const src = placed.get(n.id) ?? n;
    const effIdx = effects.findIndex((e) => e.id === n.id);
    if (effIdx >= 0) {
      // Pin effects near the middle, slightly stacked, paths clamped.
      const nx = (effIdx - (effects.length - 1) / 2) * 1.2;
      const ny = 1.6 + effIdx * 0.3;
      const old = n.transform.p;
      const dx = nx - old[0];
      const dy = ny - old[1];
      const dz = 0 - old[2];
      let geometry = n.geometry;
      if (n.type === "tube") {
        // Pin the radius too: a drainpipe-thick beam owns the frame.
        const r = Math.min(num((n.geometry as Record<string, unknown> | undefined)?.radius) || 0.15, 0.4);
        geometry = { ...n.geometry, radius: r };
      }
      if (n.type === "tube" && Array.isArray(n.geometry?.path)) {
        const clamp = (v: number, c: number): number =>
          c + Math.max(-3.5, Math.min(3.5, v - c));
        const base = (geometry ?? n.geometry)!;
        geometry = {
          ...base,
          path: (base.path as [number, number, number][]).map(
            ([x, y, z]) => [clamp(x + dx, nx), clamp(y + dy, ny), clamp(z + dz, 0)] as Vec3
          ),
        };
      }
      return {
        ...n,
        transform: { ...n.transform, p: [nx, ny, 0] as Vec3 },
        geometry,
      };
    }
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
    const nx = (xs.get(n.id)! - shiftX) * squeeze;
    const ny = e.hy + 0.02;
    const nz = zOf(n);
    const old = n.transform.p;
    const dx = nx - old[0];
    const dy = ny - old[1];
    const dz = nz - old[2];
    let geometry = n.geometry;
    if (n.type === "tube" && Array.isArray(n.geometry?.path)) {
      // Translate with the node, but clamp reach: one sprawling hose
      // must never own the frame or the ground. Shape is preserved,
      // sprawl is not.
      const MAX_REACH = 3.5;
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
      transform: { ...src.transform, p: [nx, ny, nz] as Vec3 },
      geometry,
    };
  };
  const out = new Map<string, (typeof dsl.nodes)[number]>();
  for (const n of dsl.nodes) {
    if (!n.parent) out.set(n.id, placeOne(n));
  }
  // Children follow their parent: placed parent position plus the
  // authored relative offset, so assemblies keep their internal layout.
  const authored = new Map(dsl.nodes.map((n) => [n.id, n]));
  let pending = dsl.nodes.filter((n) => n.parent);
  for (let guard = 0; guard <= dsl.nodes.length && pending.length > 0; guard++) {
    const next: typeof pending = [];
    for (const n of pending) {
      const parentPlaced = out.get(n.parent!);
      const parentAuthored = authored.get(n.parent!);
      if (!parentPlaced || !parentAuthored) {
        next.push(n);
        continue;
      }
      const d: Vec3 = [
        n.transform.p[0] - parentAuthored.transform.p[0],
        n.transform.p[1] - parentAuthored.transform.p[1],
        n.transform.p[2] - parentAuthored.transform.p[2],
      ];
      const src = placed.get(n.id) ?? n;
      out.set(n.id, {
        ...n,
        transform: {
          ...src.transform,
          p: [
            parentPlaced.transform.p[0] + d[0],
            parentPlaced.transform.p[1] + d[1],
            parentPlaced.transform.p[2] + d[2],
          ] as Vec3,
        },
      });
    }
    pending = next;
  }
  for (const n of pending) out.set(n.id, n); // unreachable: validator rejects bad parents
  const nodes = dsl.nodes.map((n) => out.get(n.id) ?? n);
  return { ...dsl, nodes };
}
