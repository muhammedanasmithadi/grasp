// src/api/hero.ts
// Code-owned photoreal heroes. The model may or may not call a real
// GLB for the hero; when the concept names an object we hold as a
// verified scan, inject it deterministically. Runs AFTER validation
// (in adaptDslToScene), so injection can never fail a world.

import type { DslNode, SceneDsl } from "../types";

const PH = "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k";
const KH = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";

// Whole-word concept match -> verified scan URL + display label.
const HEROES: Array<{ words: string[]; url: string; label: string }> = [
  { words: ["drill"], url: `${PH}/Drill_01/Drill_01_1k.gltf`, label: "power drill" },
  { words: ["lantern"], url: `${PH}/Lantern_01/Lantern_01_1k.gltf`, label: "lantern" },
  { words: ["ukulele"], url: `${PH}/Ukulele_01/Ukulele_01_1k.gltf`, label: "ukulele" },
  { words: ["television", " tv ", " tv", "tv "], url: `${PH}/Television_01/Television_01_1k.gltf`, label: "television" },
  { words: ["camera"], url: `${PH}/Camera_01/Camera_01_1k.gltf`, label: "camera" },
  { words: ["sofa", "couch"], url: `${PH}/Sofa_01/Sofa_01_1k.gltf`, label: "sofa" },
  { words: ["chair", "seat"], url: `${PH}/WoodenChair_01/WoodenChair_01_1k.gltf`, label: "wooden chair" },
  { words: ["table", "desk"], url: `${PH}/WoodenTable_01/WoodenTable_01_1k.gltf`, label: "wooden table" },
  { words: ["bed"], url: `${PH}/GothicBed_01/GothicBed_01_1k.gltf`, label: "bed" },
  { words: ["cabinet", "cupboard", "wardrobe"], url: `${PH}/GothicCabinet_01/GothicCabinet_01_1k.gltf`, label: "cabinet" },
  { words: ["barrel", "cask", "keg"], url: `${PH}/Barrel_01/Barrel_01_1k.gltf`, label: "barrel" },
  { words: ["chandelier"], url: `${PH}/Chandelier_01/Chandelier_01_1k.gltf`, label: "chandelier" },
  { words: ["duck"], url: `${KH}/Duck/glTF-Binary/Duck.glb`, label: "duck" },
  { words: ["fox"], url: `${KH}/Fox/glTF-Binary/Fox.glb`, label: "fox" },
  { words: ["helmet"], url: `${KH}/FlightHelmet/glTF/FlightHelmet.gltf`, label: "flight helmet" },
  { words: ["bottle"], url: `${KH}/WaterBottle/glTF-Binary/WaterBottle.glb`, label: "water bottle" },
  { words: ["boombox", "radio", "stereo"], url: `${KH}/BoomBox/glTF-Binary/BoomBox.glb`, label: "boombox" },
  { words: ["avocado"], url: `${KH}/Avocado/glTF-Binary/Avocado.glb`, label: "avocado" },
];

export function injectHero(dsl: SceneDsl): SceneDsl {
  if (dsl.nodes.some((n) => n.type === "model")) return dsl;
  const q = ` ${dsl.concept.question.toLowerCase()} `;
  const hit = HEROES.find((h) =>
    h.words.some((w) => q.includes(` ${w.trim()} `))
  );
  if (!hit) return dsl;
  const hero: DslNode = {
    id: "hero-scan",
    type: "model",
    parent: null,
    transform: { p: [0, 2, 0], r: [0, 0, 0], s: [1, 1, 1] },
    material: { roughness: 0.55, metalness: 0.05, tint: "#e8e0d0" },
    label: hit.label,
    geometry: { url: hit.url },
  };
  const groups = dsl.groups.map((g, i) =>
    i === 0 ? { ...g, members: [...g.members, hero.id] } : g
  );
  return { ...dsl, nodes: [...dsl.nodes, hero], groups };
}
