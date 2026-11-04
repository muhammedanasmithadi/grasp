import { Effect } from "effect";
import type { SceneDsl } from "../types";
import { ValidationError } from "./errors";

const PRIMITIVES = new Set([
  "box",
  "cylinder",
  "sphere",
  "cone",
  "torus",
  "torusKnot",
  "tetrahedron",
  "octahedron",
  "dodecahedron",
  "icosahedron",
  "capsule",
  "circle",
  "ring",
  "tube",
  "plane",
  "model",
  "points",
]);

const MODEL_URL_ALLOWLIST = [
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/",
  "https://github.com/KhronosGroup/glTF-Sample-Assets/",
  "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@",
  "https://dl.polyhaven.org/file/ph-assets/Models/",
  "https://threejs.org/examples/models/",
];
const TEXTURE_URL_ALLOWLIST = [
  "https://dl.polyhaven.org/file/ph-assets/Textures/",
  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@",
];
const HDRI_URL_ALLOWLIST = [
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/",
];
const JOINTS = new Set(["hinge", "slider", "gear"]);
const MEDIUMS = new Set(["3d", "2d", "hybrid"]);

const fail = (message: string): Effect.Effect<never, ValidationError> =>
  Effect.fail(new ValidationError({ message }));

export const validateSceneDsl = (
  data: unknown,
): Effect.Effect<SceneDsl, ValidationError> =>
  Effect.gen(function* () {
    if (!data || typeof data !== "object") {
      return yield* fail("E_DSL_NOT_OBJECT: scene must be an object");
    }
    const d = data as Record<string, unknown>;
    if (d.dslVersion !== "0.1") {
      return yield* fail('E_DSL_VERSION: dslVersion must be "0.1"');
    }
    if (!d.concept || typeof d.concept !== "object") {
      return yield* fail("E_CONCEPT_MISSING: concept is required");
    }
    const concept = d.concept as Record<string, unknown>;
    if (typeof concept.question !== "string" || !concept.question) {
      return yield* fail(
        "E_CONCEPT_QUESTION: concept.question must be a non-empty string",
      );
    }
    if (!MEDIUMS.has(concept.medium as string)) {
      return yield* fail(
        "E_MEDIUM_UNKNOWN: concept.medium must be 3d|2d|hybrid"
      );
    }
    const theme = d.theme as Record<string, unknown> | undefined;
    if (
      theme?.backdrop !== undefined &&
      (typeof theme.backdrop !== "string" ||
        !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(theme.backdrop))
    ) {
      return yield* fail(
        "E_THEME_BACKDROP: theme.backdrop must be a hex color like #e9e4d6",
      );
    }
    if (theme?.hdri !== undefined) {
      const hdriUrl = theme.hdri;
      if (
        typeof hdriUrl !== "string" ||
        !HDRI_URL_ALLOWLIST.some((prefix) => hdriUrl.startsWith(prefix))
      ) {
        return yield* fail(
          "E_THEME_HDRI: theme.hdri must be an allowlisted HDRI URL",
        );
      }
    }
    if (!Array.isArray(d.nodes)) {
      return yield* fail("E_NODES_MISSING: nodes[] is required");
    }
    if (!Array.isArray(d.joints)) {
      return yield* fail("E_JOINTS_MISSING: joints[] is required");
    }
    if (!Array.isArray(d.beats)) {
      return yield* fail("E_BEATS_MISSING: beats[] is required");
    }
    if ((d.nodes as unknown[]).length === 0) {
      return yield* fail("E_NODES_EMPTY: nodes[] must not be empty");
    }

    const nodeIds = new Set<string>();
    // Parent references: must exist, must not cycle. Checked after all
    // ids are known (second pass below).
    const parentOf = new Map<string, string>();
    for (const n of d.nodes as Record<string, unknown>[]) {
      if (typeof n.id !== "string" || !n.id) {
        return yield* fail("E_NODE_ID: every node needs a string id");
      }
      if (nodeIds.has(n.id)) {
        return yield* fail(`E_NODE_DUP: duplicate node id "${n.id}"`);
      }
      nodeIds.add(n.id);
      if (!PRIMITIVES.has(n.type as string)) {
        return yield* fail(
          `E_NODE_TYPE: unknown primitive "${String(n.type)}" on node "${n.id}"`
        );
      }
      const geo = (n as Record<string, unknown>).geometry as
        | Record<string, unknown>
        | undefined;
      if (n.type === "model") {
        const url = geo?.url;
        if (typeof url !== "string" || !url) {
          return yield* fail(
            `E_NODE_MODEL_URL: node "${n.id}" of type "model" needs geometry.url`
          );
        }
        if (!MODEL_URL_ALLOWLIST.some((prefix) => url.startsWith(prefix))) {
          return yield* fail(
            `E_NODE_MODEL_URL: node "${n.id}" url must be an allowlisted GLB URL`
          );
        }
      }
      if (n.type === "points" && geo?.count !== undefined) {
        const count = geo.count as unknown;
        if (typeof count !== "number" || count < 1 || count > 5000) {
          return yield* fail(
            `E_NODE_POINTS: node "${n.id}" geometry.count must be 1..5000`
          );
        }
      }
      if (n.type === "tube" && geo?.path !== undefined) {
        const path = geo.path as unknown;
        if (
          !Array.isArray(path) ||
          path.length < 2 ||
          !path.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 3 &&
              p.every((v) => typeof v === "number")
          )
        ) {
          return yield* fail(
            `E_NODE_TUBE_PATH: node "${n.id}" geometry.path must be 2+ [x,y,z] points`
          );
        }
        // Sprawling hoses own the frame: keep paths near their node.
        const tf0 = (n.transform ?? {}) as { p?: unknown };
        const p0 = Array.isArray(tf0.p) ? (tf0.p as number[]) : [0, 0, 0];
        let reach = 0;
        for (const pt of path as number[][]) {
          reach = Math.max(
            reach,
            Math.abs(pt[0] - p0[0]),
            Math.abs(pt[1] - p0[1]),
            Math.abs(pt[2] - p0[2])
          );
        }
        if (reach > 6) {
          return yield* fail(
            `E_TUBE_SPRAWL: node "${n.id}" path reaches ${reach.toFixed(1)} units from its origin; keep tube paths within 6 units`
          );
        }
      }
      const mat = n.material as Record<string, unknown> | undefined;
      for (const field of ["map", "normalMap"] as const) {
        const url = mat?.[field];
        if (url !== undefined) {
          if (
            typeof url !== "string" ||
            !TEXTURE_URL_ALLOWLIST.some((prefix) => url.startsWith(prefix))
          ) {
            return yield* fail(
              `E_MATERIAL_MAP: node "${n.id}" material.${field} must be an allowlisted texture URL`
            );
          }
        }
      }
      // Authored stages are the stager's job, not the model's: drop the
      // rejection here and let layoutScene strip slabs silently. A
      // dropped slab beats a failed world.
    }

    // Parent references resolve and never cycle.
    for (const n of d.nodes as Record<string, unknown>[]) {
      const parent = (n as { parent?: unknown }).parent;
      if (parent === null || parent === undefined) continue;
      if (typeof parent !== "string" || !nodeIds.has(parent)) {
        return yield* fail(
          `E_PARENT_REF: node "${String(n.id)}" parent "${String(parent)}" does not exist`
        );
      }
      if (parent === n.id) {
        return yield* fail(`E_PARENT_CYCLE: node "${String(n.id)}" is its own parent`);
      }
      parentOf.set(n.id as string, parent);
    }
    for (const start of parentOf.keys()) {
      const seenChain = new Set<string>([start]);
      let cur = parentOf.get(start);
      while (cur) {
        if (seenChain.has(cur)) {
          return yield* fail(`E_PARENT_CYCLE: parent cycle through "${cur}"`);
        }
        seenChain.add(cur);
        cur = parentOf.get(cur);
      }
    }

    // Explicit causal edges: both ends resolve, relationship is named.
    // Edges are the only source of drawn causality; teaching order in
    // beats never invents them.
    if (d.edges !== undefined && !Array.isArray(d.edges)) {
      return yield* fail("E_EDGE_TYPE: edges must be an array");
    }
    for (const e of (Array.isArray(d.edges) ? d.edges : []) as Record<string, unknown>[]) {
      if (typeof e.from !== "string" || !nodeIds.has(e.from)) {
        return yield* fail(`E_EDGE_REF: edge from unknown node "${String(e.from)}"`);
      }
      if (typeof e.to !== "string" || !nodeIds.has(e.to)) {
        return yield* fail(`E_EDGE_REF: edge to unknown node "${String(e.to)}"`);
      }
      if (typeof e.rel !== "string" || !e.rel) {
        return yield* fail(`E_EDGE_REL: edge ${e.from}->${e.to} needs a relationship label`);
      }
    }

    // Compound groups: 2+ primitives sharing one label. Members must
    // exist, groups must not overlap, singles are pointless.
    if (d.groups !== undefined && !Array.isArray(d.groups)) {
      return yield* fail("E_GROUP_TYPE: groups must be an array");
    }
    const grouped = new Set<string>();
    const groupIds = new Set<string>();    for (const g of (Array.isArray(d.groups) ? d.groups : []) as Record<string, unknown>[]) {
      if (typeof g.id !== "string" || !g.id) {
        return yield* fail("E_GROUP_ID: every group needs a string id");
      }
      if (groupIds.has(g.id)) {
        return yield* fail(`E_GROUP_DUP: duplicate group id "${g.id}"`);
      }
      groupIds.add(g.id);
      if (typeof g.label !== "string" || !g.label) {
        return yield* fail(`E_GROUP_LABEL: group "${g.id}" needs a label`);
      }
      if (!Array.isArray(g.members) || g.members.length < 2) {
        return yield* fail(
          `E_GROUP_SIZE: group "${g.id}" needs at least 2 members`
        );
      }
      for (const m of g.members) {
        if (typeof m !== "string" || !nodeIds.has(m)) {
          return yield* fail(
            `E_GROUP_REF: group "${g.id}" references unknown node "${String(m)}"`
          );
        }
        if (grouped.has(m)) {
          return yield* fail(
            `E_GROUP_OVERLAP: node "${m}" is already grouped`
          );
        }
        grouped.add(m);
      }
    }

    // Busy worlds must compose: more than 6 nodes with zero groups
    // means single primitives everywhere, which always reads crude.
    if ((d.nodes as unknown[]).length > 6 && groupIds.size === 0) {
      return yield* fail(
        "E_GROUP_REQUIRED: worlds with more than 6 nodes must compose at least one group"
      );
    }

    for (const j of d.joints as Record<string, unknown>[]) {
      if (!JOINTS.has(j.type as string)) {
        return yield* fail(
          `E_JOINT_TYPE: unknown joint "${String(j.type)}"`
        );
      }
      if (typeof j.a !== "string" || !nodeIds.has(j.a)) {
        return yield* fail(
          `E_JOINT_REF: joint "${String(j.id)}" references unknown node "${String(j.a)}"`
        );
      }
      if (typeof j.b !== "string" || !nodeIds.has(j.b)) {
        return yield* fail(
          `E_JOINT_REF: joint "${String(j.id)}" references unknown node "${String(j.b)}"`
        );
      }
    }

    if ((d.beats as unknown[]).length < 3) {
      return yield* fail(
        "E_BEAT_COUNT: a teaching world needs at least 3 beats"
      );
    }
    // Spine clarity: every beat must spotlight a different part. The UI
  // maps each beat to the label of its first becauseOf node, so the
  // labels themselves must be distinct (case-insensitive).
  const seenParts = new Set<string>();
  for (const b of d.beats as Record<string, unknown>[]) {
    const refs = b.becauseOf as unknown;
    const first = Array.isArray(refs) ? refs[0] : undefined;
    const node = (d.nodes as Record<string, unknown>[]).find((n) => n.id === first);
    const label = typeof node?.label === "string" ? node.label.toLowerCase() : String(first ?? "");
    if (seenParts.has(label)) {
      return yield* fail(
        `E_SPINE_DUP: beat "${b.id}" repeats part "${node?.label ?? first}"; every beat must spotlight a different part`
      );
    }
    seenParts.add(label);
  }
  for (const b of d.beats as Record<string, unknown>[]) {
      if (typeof b.id !== "string" || !b.id) {
        return yield* fail("E_BEAT_ID: every beat needs a string id");
      }      const refs = b.becauseOf as unknown;
      if (!Array.isArray(refs) || refs.length === 0) {
        return yield* fail(
          `E_BEAT_CAUSE: beat "${b.id}" needs non-empty becauseOf[]`
        );
      }
      for (const r of refs) {
        if (typeof r !== "string" || !nodeIds.has(r)) {
          return yield* fail(
            `E_ORPHAN_BEAT: beat "${b.id}" references unknown node "${String(r)}"`
          );
        }
      }
      const probe = b.probe as Record<string, unknown> | undefined;
      if (
        !probe ||
        typeof probe.prompt !== "string" ||
        typeof probe.answer !== "string"
      ) {
        return yield* fail(
          `E_BEAT_PROBE: beat "${b.id}" needs probe{prompt,answer}`
        );
      }
    }

    // Hero gate: some part must carry the scene. A model, transmissive
    // glass, glow, metal, or textured map counts as rich. Only a world
    // with no rich part anywhere AND a dull-slab opening focus fails.
    // Missing material fields fall back to the renderer's satin defaults.
    const beats = d.beats as Record<string, unknown>[];
    const nodes = d.nodes as Record<string, unknown>[];
    const isRich = (n: Record<string, unknown>): boolean => {
      if (n.type === "model") return true;
      const mat = (n.material ?? {}) as Record<string, unknown>;
      const trans =
        typeof mat.transmission === "number" ? mat.transmission : 0;
      const metal = typeof mat.metalness === "number" ? mat.metalness : 0.6;
      const glow = typeof mat.emissive === "string" && mat.emissive.length > 0;
      const mapped = typeof mat.map === "string" && mat.map.length > 0;
      return trans > 0.3 || metal > 0.5 || glow || mapped;
    };
    const leadRef = (beats[0]?.becauseOf as unknown[])?.[0];
    const lead = nodes.find((n) => n.id === leadRef);
    const anyRich = nodes.some(isRich);
    if (lead && !anyRich) {
      const mat = (lead.material ?? {}) as Record<string, unknown>;
      const rough =
        typeof mat.roughness === "number" ? mat.roughness : 0.5;
      const metal = typeof mat.metalness === "number" ? mat.metalness : 0.6;
      const trans =
        typeof mat.transmission === "number" ? mat.transmission : 0;
      const glow =
        typeof mat.emissive === "string" && mat.emissive.length > 0;
      const flatType = lead.type === "box" || lead.type === "plane";
      if (flatType && rough >= 0.7 && metal <= 0.2 && trans <= 0.3 && !glow) {
        return yield* fail(
          `E_HERO_DULL: no rich part in scene and lead node "${String(lead.id)}" is a flat opaque slab; add a model, glass, glow, metal, or textured part`
        );
      }
    }
    const medium = (concept.medium as string) || "3d";
    if (medium === "3d") {
      const joints = d.joints as unknown[];
      const anyNonUniform = nodes.some((n) => {
        const t = n.transform as { s?: unknown } | undefined;
        const s = (t?.s ?? null) as unknown;
        return (
          Array.isArray(s) &&
          typeof s[0] === "number" &&
          typeof s[1] === "number" &&
          typeof s[2] === "number" &&
          (s[0] !== s[1] || s[1] !== s[2])
        );
      });
      if (!anyNonUniform && joints.length === 0) {
        return yield* fail(
          "E_MEDIUM_MISMATCH: 3d rejected for flat uniform nodes with no joints; use 2d"
        );
      }
    }

    return data as SceneDsl;
  });

/**
 * Post-transform reference integrity. Run after layout, hero, or any
 * other scene rewrite: every beat, edge, group, parent, and joint
 * reference must still resolve. Returns an E_* message or null.
 * Pure and synchronous so non-Effect callers (the adapter) can use it.
 */
export function validateReferences(dsl: SceneDsl): string | null {
  const ids = new Set(dsl.nodes.map((n) => n.id));
  for (const n of dsl.nodes) {
    if (n.parent && !ids.has(n.parent)) {
      return `E_PARENT_REF: node "${n.id}" parent "${n.parent}" missing after transform`;
    }
  }
  for (const g of dsl.groups ?? []) {
    for (const m of g.members) {
      if (!ids.has(m)) return `E_GROUP_REF: group "${g.id}" member "${m}" missing after transform`;
    }
  }
  for (const e of dsl.edges ?? []) {
    if (!ids.has(e.from)) return `E_EDGE_REF: edge from "${e.from}" missing after transform`;
    if (!ids.has(e.to)) return `E_EDGE_REF: edge to "${e.to}" missing after transform`;
  }
  for (const j of dsl.joints ?? []) {
    if (!ids.has(j.a)) return `E_JOINT_REF: joint "${j.id}" a "${j.a}" missing after transform`;
    if (!ids.has(j.b)) return `E_JOINT_REF: joint "${j.id}" b "${j.b}" missing after transform`;
  }
  for (const b of dsl.beats ?? []) {
    for (const r of b.becauseOf ?? []) {
      if (!ids.has(r)) return `E_ORPHAN_BEAT: beat "${b.id}" references "${r}" missing after transform`;
    }
    if (b.probe?.answer && !ids.has(b.probe.answer)) {
      return `E_BEAT_PROBE: beat "${b.id}" answer "${b.probe.answer}" missing after transform`;
    }
  }
  return null;
}
