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
      }
      const mat = n.material as Record<string, unknown> | undefined;
      if (mat?.map !== undefined) {
        const mapUrl = mat.map;
        if (
          typeof mapUrl !== "string" ||
          !TEXTURE_URL_ALLOWLIST.some((prefix) => mapUrl.startsWith(prefix))
        ) {
          return yield* fail(
            `E_MATERIAL_MAP: node "${n.id}" material.map must be an allowlisted texture URL`
          );
        }
      }
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

    for (const b of d.beats as Record<string, unknown>[]) {
      if (typeof b.id !== "string" || !b.id) {
        return yield* fail("E_BEAT_ID: every beat needs a string id");
      }
      const refs = b.becauseOf as unknown;
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
