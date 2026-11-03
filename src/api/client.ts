import { Effect, Schedule } from "effect";
import type { SceneData } from "../types";
import { parseSceneCode } from "./sceneCode";
import { adaptDslToScene } from "./parser";
import {
  ApiHttpError,
  EmptyResponse,
  NoApiKey,
  Truncated,
  type GenerateSceneError,
} from "./errors";

const API_BASE =
  (
    import.meta as unknown as Record<
      string,
      { VITE_META_API_BASE?: string; VITE_META_API_KEY?: string }
    >
  ).env?.VITE_META_API_BASE || "https://api.meta.ai/v1";
const API_KEY =
  (
    import.meta as unknown as Record<
      string,
      { VITE_META_API_BASE?: string; VITE_META_API_KEY?: string }
    >
  ).env?.VITE_META_API_KEY || "";

const MAX_ATTEMPTS = 3;

interface ApiEnvelope {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown };
  }>;
}

const RESEARCH_SYSTEM = `You are a mechanism researcher. Given a concept, output STRICT JSON only, no prose, no markdown: {"parts":[{"name":"","substance":"","size":"","color":"","connectsTo":"","moves":""}],"environment":"","causalChain":[""],"facts":[""],"misconceptions":[""]}. List every physical part a learner must see with real-world substance, size, color, what it touches, and how it moves; the environment it sits in; the causal chain in order; checkable facts; and common misconceptions to avoid. Keep it under 1500 words.`;

// One chat call returning raw text. Used for research (small) and
// scene building (large) alike.
const postChat = (
  system: string,
  user: string,
  maxTokens: number
): Effect.Effect<string, GenerateSceneError> =>
  Effect.gen(function* () {
    if (!API_KEY) {
      return yield* Effect.fail(
        new NoApiKey({
          message:
            "E_NO_API_KEY: no API key configured; set VITE_META_API_KEY in .env",
        })
      );
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${API_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: "muse-spark-1.3",
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: 0.0,
            max_tokens: maxTokens,
          }),
        }),
      catch: () =>
        new ApiHttpError({
          status: 0,
          message: "E_API_HTTP: network failure calling Meta Model API",
        }),
    });

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          new ApiHttpError({
            status: response.status,
            message: `E_API_HTTP: API error (${response.status}): unreadable body`,
          }),
      });
      return yield* Effect.fail(
        new ApiHttpError({
          status: response.status,
          message: `E_API_HTTP: API error (${response.status}): ${errorText.slice(0, 200)}`,
        })
      );
    }

    const data = (yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () =>
        new ApiHttpError({
          status: response.status,
          message: `E_API_HTTP: API returned non-JSON body (status ${response.status})`,
        }),
    })) as ApiEnvelope;

    if (data.choices?.[0]?.finish_reason === "length") {
      return yield* Effect.fail(
        new Truncated({
          message:
            "E_TRUNCATED: model hit the token ceiling mid-response; simplify the concept or shorten the prompt",
        })
      );
    }

    const raw = data.choices?.[0]?.message?.content;
    const content = typeof raw === "string" ? raw : "";
    if (!content) {
      return yield* Effect.fail(
        new EmptyResponse({ message: "E_EMPTY_RESPONSE: empty response from API" })
      );
    }
    return content;
  });

// Research brief. Never fails the pipeline: if research fails we log
// and build unbriefed (today's behavior) rather than failing the world.
const researchBrief = (concept: string): Effect.Effect<string> =>
  postChat(RESEARCH_SYSTEM, concept, 3000).pipe(
    Effect.catch((e: unknown) =>
      Effect.sync(() => {
        console.warn("[MetaModelAPI] research failed, building unbriefed:", e);
        return "";
      })
    )
  );

const BUILDER_SYSTEM = `You generate a 3D teaching scene by writing calls to a fixed builder API. Infer the mechanism from the user prompt. Output ONLY code, one call per line. No prose. No markdown. No JSON.

Available calls (args are strict JSON objects):
concept({"question":"...","medium":"3d|2d|hybrid","mediumWhy":"...","verification":"solver|sketch"})
theme({"motif":"...","palette":"okabe-ito","keyAzimuth":135,"backdrop":"#e9e4d6","hdri":"https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/mossy_forest_1k.hdr"})
box|cylinder|sphere|cone|torus|torusKnot|tetrahedron|octahedron|dodecahedron|icosahedron|capsule|circle|ring|tube|plane|model|points({"id":"...","parent":null,"transform":{"p":[0,0,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#E69F00"},"label":"...","geometry":{}})
hinge|slider|gear({"id":"...","a":"node-id","b":"node-id","anchor":[0,0,0],"axis":[0,0,1],"range":[0,360],"driver":{"kind":"time","rpm":30}})
beat({"id":"...","t":[0,6],"goal":"...","becauseOf":["node-id"],"probe":{"kind":"trace","prompt":"...","answer":"node-id"},"narration":"..."})
camera({"axisOfAction":[0,1,0],"shots":[{"t":0,"size":"wide","target":"node-id","move":"orbit-in"}]})

Loops for repeated parts:
for i in range(0, 12) {
box({"id":"bar-$i","parent":null,"transform":{"p":[{"$i":[-8,1.5]},-0.3,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.1,"tint":"#0072B2"},"label":"bar"})
}

Geometry options (all optional): "geometry":{"args":[...]} overrides shape dimensions; "geometry":{"path":[[x,y,z],...],"radius":0.15} draws a curved tube through points; "geometry":{"url":"Khronos-sample-asset-glb-url"} loads a real 3D model (model type only; real designer meshes, picked by domain. Model calls always use "transform":{"p":[x,y,z],"r":[0,0,0],"s":[1,1,1]} with unit scale; the renderer normalizes every hero to hand scale, so never shrink or grow a model with s. Use a model call for the hero part whenever a verified URL below fits it; primitives only for the rest, never a primitive substitute for a listed hero. Verified URLs (use exactly): Fox https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb, CesiumMan .../Models/CesiumMan/glTF-Binary/CesiumMan.glb, MilkTruck .../Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb, FlightHelmet .../Models/FlightHelmet/glTF/FlightHelmet.gltf, DamagedHelmet .../Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb, BrainStem .../Models/BrainStem/glTF-Binary/BrainStem.glb, Avocado .../Models/Avocado/glTF-Binary/Avocado.glb, WaterBottle .../Models/WaterBottle/glTF-Binary/WaterBottle.glb, BoomBox .../Models/BoomBox/glTF-Binary/BoomBox.glb, Duck .../Models/Duck/glTF-Binary/Duck.glb, Lantern .../Models/Lantern/glTF-Binary/Lantern.glb, Corset .../Models/Corset/glTF-Binary/Corset.glb (all under https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/). Poly Haven props, pattern https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/{slug}/{slug}_1k.gltf with verified slugs Barrel_01, Barrel_02, Drill_01, Megaphone_01, Camera_01, Television_01, Ukulele_01, Lantern_01, Chandelier_01, Chandelier_02, Chandelier_03, Shelf_01, Sofa_01, GothicBed_01, GothicCabinet_01, SchoolDesk_01, SchoolChair_01, ArmChair_01, GreenChair_01, Rockingchair_01, WoodenChair_01, WoodenTable_01, WoodenTable_02, WoodenTable_03, CoffeeTable_01, CoffeeCart_01, ClassicConsole_01. No other hosts. theme.hdri sets a real captured environment, pattern https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{slug}_1k.hdr with verified slugs mossy_forest, cobblestone_street_night, grasslands_sunset, lythwood_room, concrete_tunnel, autumn_ground; match the HDRI mood to the scene (forest, street night, sunset field, room interior).); prefer a model for the hero part when one fits, primitives for the rest. Hero rule: the single most important part in the scene is either a model call with a Khronos URL or a glass/water material with transmission above 0.5; it is never a flat opaque primitive.; "geometry":{"count":500,"size":0.08} sets particle count/size (points type only). Material options: clearcoat, clearcoatRoughness, transmission, ior, emissive, opacity, transparent, and "map" for a real albedo texture. Surfaces carry matter: set material.map to a verified texture URL matching the substance, pattern https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{slug}/{slug}_diff_1k.jpg with slugs like dark_wooden_planks, kitchen_wood, brick_floor_02, brick_floor, metal_plate, blue_metal_plate, denim_fabric, aerial_rocks_01, brown_mud_rocks_01, grass_ground, brushed_concrete, marble_01, grey_plaster, snow_01, bark_brown_01, aerial_sand, blue_floor_tiles_01; or three.js repo textures like https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/hardwood2_diffuse.jpg, brick_diffuse.jpg, waternormals.jpg, grasslight-big.jpg, planets/earth_atmos_2048.jpg. Space scenes use the earth/moon maps.
Staging rules (follow all): theme.backdrop sets the sky: warm light like #e9e4d6 or #dfe5e6 by default, dark navy like #0d1120 ONLY for space or night scenes, never near-white like #ffffff or #fafafa which blinds the render; Ground: exactly one horizontal plane (r:[-1.5708,0,0]) sized 16-24 wide at the lowest y; backdrops stay behind the action, never overhead. Keep every part within 25 units of the origin. Compose tightly: keep all subjects within 8 units of the origin and grounds 12-16 wide, so the scene fills the frame instead of floating in an empty stage. Contact rule: mating faces touch. A valve seats inside its port (overlapping bores, shared axis), a shaft enters its bore, stacked parts share a contact plane, a key sits inside its lock. Every solid part touches another part or the ground; only particles, light rays, and flames float free. Scale discipline: model at hand scale with the whole assembly inside a 20-unit sphere; the largest single solid is at most 12 units and a door, wall, or housing at most 16, so close-ups keep context. Labels are 1-3 words. Never use pure black (#000000) or pure white (#FFFFFF) tints except in a space scene. Water and glass use transmission or low roughness, not flat gray.
Rules: "$i" in a string becomes the index. {"$i":[base,step]} in a numeric slot becomes base+i*step. Medium: 2d for flat layouts with no moving joints (circuits, maps, timelines, diagrams); 3d only when parts have volume and joints move them in depth. REQUIRED for 3d and enforced by rejection: include at least one hinge, slider, or gear joint plus non-uniform part scales; a uniform unjointed 3d scene is always rejected, so when in doubt declare 2d. Each beat spotlights a different part; never repeat a part name in the spine. Every becauseOf references an existing node id. Every beat has exactly one probe whose answer is a node id. Use 3-8 beats. Pick the primitive that matches each part: sphere for planets, atoms, droplets; cone for funnels, nozzles; torus/torusKnot for rings, coils, orbits; capsule for pills, cells; tetrahedron/octahedron/dodecahedron/icosahedron for crystals, dice, molecules; circle/ring for discs, halos, orbits; tube with a path for pipes, hoses, orbits; model for a hero part (Khronos sample assets only); points for particle swarms (molecules, stars, comparisons). Cylinders for shafts, pistons, rods, wheels and bars; boxes only for housings and blocks; planes only for ground or backdrops. Never use boxes for everything. Set verification honestly: "solver" only if motion matches a closed-form formula, else "sketch". Never claim "sourced". Output ONLY the code.`;

const singleAttempt = (
  concept: string,
  onStage?: (stage: "research" | "build") => void
): Effect.Effect<SceneData, GenerateSceneError> =>
  Effect.gen(function* () {
    if (onStage) {
      yield* Effect.sync(() => onStage("research"));
    }
    const brief = yield* researchBrief(concept);
    const briefBlock = brief
      ? `\nResearch brief (verified facts; follow it over guesses, but still output ONLY code):\n${brief}`
      : "";
    if (onStage) {
      yield* Effect.sync(() => onStage("build"));
    }
    const content = yield* postChat(BUILDER_SYSTEM + briefBlock, concept, 50000);

    yield* Effect.sync(() =>
      console.log("[MetaModelAPI] raw content:", content?.slice(0, 500))
    );

    const dsl = yield* parseSceneCode(content);
    return adaptDslToScene(dsl);
  });

export class MetaModelAPI {
  constructor() {
    if (!API_KEY) {
      console.warn(
        "[MetaModelAPI] No VITE_META_API_KEY set — API calls will fail"
      );
    }
  }

  generateScene(
    concept: string,
    onStage?: (stage: "research" | "build") => void
  ): Effect.Effect<SceneData, GenerateSceneError> {
    // Deterministic errors never heal on retry (temperature 0): fail
    // fast and let the user rephrase. Only transient errors retry.
    const deterministic = (e: GenerateSceneError): boolean =>
      e._tag === "Truncated" ||
      e.message.includes("E_MEDIUM_MISMATCH") ||
      e.message.includes("E_HERO_DULL") ||
      e.message.includes("E_BEAT_COUNT");
    return Effect.retry(singleAttempt(concept, onStage), {
      times: MAX_ATTEMPTS - 1,
      schedule: Schedule.exponential("1 second"),
      while: (e) => !deterministic(e),
    });
  }
}

export const metaModelAPI = new MetaModelAPI();
