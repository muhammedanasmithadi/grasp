// src/api/hero.ts
// Code-owned photoreal heroes. The model may or may not call a real
// GLB for the hero; when the concept names an object we hold as a
// verified scan, inject it deterministically. Runs AFTER validation
// (in adaptDslToScene), so injection can never fail a world.

import type { DslNode, SceneDsl } from "../types";

const PH = "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k";
const KH = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";
const TJ = "https://threejs.org/examples/models/gltf";

// Whole-word concept match -> verified scan URL + display label.
// Sources: Poly Haven props, Khronos sample assets (binary .glb where
// available), three.js example figures. Every URL below is HTTP-verified.
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
  { words: ["horse", "pony", "stallion"], url: `${TJ}/Horse.glb`, label: "horse" },
  { words: ["parrot"], url: `${TJ}/Parrot.glb`, label: "parrot" },
  { words: ["flamingo"], url: `${TJ}/Flamingo.glb`, label: "flamingo" },
  { words: ["stork", "heron", "crane bird"], url: `${TJ}/Stork.glb`, label: "wading bird" },
  { words: ["soldier", "person", "people", "human", "man", "woman", "troops", "guard"], url: `${TJ}/Soldier.glb`, label: "figure" },
  { words: ["robot", "android", "cyborg"], url: `${TJ}/Xbot.glb`, label: "robot" },
  { words: ["dragon"], url: `${KH}/DragonAttenuation/glTF-Binary/DragonAttenuation.glb`, label: "dragon" },
  { words: ["fish", "goldfish", "trout", "bass", "carp"], url: `${KH}/BarramundiFish/glTF-Binary/BarramundiFish.glb`, label: "fish" },
  { words: ["watch", "wristwatch", "timepiece"], url: `${KH}/ChronographWatch/glTF-Binary/ChronographWatch.glb`, label: "watch" },
  { words: ["shoe", "boot", "sneaker", "footwear", "heel"], url: `${KH}/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb`, label: "shoe" },
  { words: ["skull", "skeleton", "cranium"], url: `${KH}/ScatteringSkull/glTF-Binary/ScatteringSkull.glb`, label: "skull" },
  { words: ["toy car", "hot wheels"], url: `${KH}/ToyCar/glTF-Binary/ToyCar.glb`, label: "toy car" },
  { words: ["car", "automobile", "sedan", "coupe"], url: `${KH}/CarConcept/glTF-Binary/CarConcept.glb`, label: "car" },
  { words: ["vintage camera", "antique camera", "film camera"], url: `${KH}/AntiqueCamera/glTF-Binary/AntiqueCamera.glb`, label: "vintage camera" },
  { words: ["lamp", "table lamp", "tiffany"], url: `${KH}/StainedGlassLamp/glTF-Binary/StainedGlassLamp.glb`, label: "lamp" },
  { words: ["mosquito", "gnat", "insect", "bug"], url: `${KH}/MosquitoInAmber/glTF-Binary/MosquitoInAmber.glb`, label: "mosquito in amber" },
  { words: ["forge", "coals", "fire pit", "kiln"], url: `${KH}/PotOfCoals/glTF-Binary/PotOfCoals.glb`, label: "bed of coals" },
];

export function injectHero(dsl: SceneDsl): SceneDsl {
  if (dsl.nodes.some((n) => n.type === "model")) return dsl;
  const q = ` ${dsl.concept.question.toLowerCase()} `;
  // Whole words, plural-tolerant ("horses" matches "horse").
  const hit = HEROES.find((h) =>
    h.words.some((w) => {
      const t = w.trim();
      return (
        q.includes(` ${t} `) || q.includes(` ${t}s `) || q.includes(` ${t}es `)
      );
    })
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
