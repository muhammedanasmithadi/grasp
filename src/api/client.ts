import { Effect, Schedule } from "effect";
import type { SceneData } from "../types";
import { parseSceneCode } from "./sceneCode";
import { adaptDslToScene } from "./parser";
import { scoreSceneDsl, ACCEPT_SCORE } from "./quality";
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
group({"id":"...","label":"...","members":["node-id","node-id"]})

Loops for repeated parts:
for i in range(0, 12) {
box({"id":"bar-$i","parent":null,"transform":{"p":[{"$i":[-8,1.5]},-0.3,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.1,"tint":"#0072B2"},"label":"bar"})
}

Geometry options (all optional): "geometry":{"args":[...]} overrides shape dimensions; "geometry":{"path":[[x,y,z],...],"radius":0.15} draws a curved tube through points; "geometry":{"url":"Khronos-sample-asset-glb-url"} loads a real 3D model (model type only; real designer meshes, picked by domain. Model calls always use "transform":{"p":[x,y,z],"r":[0,0,0],"s":[1,1,1]} with unit scale; the renderer normalizes every hero to hand scale, so never shrink or grow a model with s. Use a model call for the hero part whenever a verified URL below fits it; primitives only for the rest, never a primitive substitute for a listed hero. Verified URLs (use exactly): Fox https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb, CesiumMan .../Models/CesiumMan/glTF-Binary/CesiumMan.glb, MilkTruck .../Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb, FlightHelmet .../Models/FlightHelmet/glTF/FlightHelmet.gltf, DamagedHelmet .../Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb, BrainStem .../Models/BrainStem/glTF-Binary/BrainStem.glb, Avocado .../Models/Avocado/glTF-Binary/Avocado.glb, WaterBottle .../Models/WaterBottle/glTF-Binary/WaterBottle.glb, BoomBox .../Models/BoomBox/glTF-Binary/BoomBox.glb, Duck .../Models/Duck/glTF-Binary/Duck.glb, Lantern .../Models/Lantern/glTF-Binary/Lantern.glb, Corset .../Models/Corset/glTF-Binary/Corset.glb (all under https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/). Poly Haven props, pattern https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/{slug}/{slug}_1k.gltf with verified slugs Barrel_01, Barrel_02, Drill_01, Megaphone_01, Camera_01, Television_01, Ukulele_01, Lantern_01, Chandelier_01, Chandelier_02, Chandelier_03, Shelf_01, Sofa_01, GothicBed_01, GothicCabinet_01, SchoolDesk_01, SchoolChair_01, ArmChair_01, GreenChair_01, Rockingchair_01, WoodenChair_01, WoodenTable_01, WoodenTable_02, WoodenTable_03, CoffeeTable_01, CoffeeCart_01, ClassicConsole_01. No other hosts. theme.hdri sets a real captured environment, pattern https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{slug}_1k.hdr with verified slugs mossy_forest, cobblestone_street_night, grasslands_sunset, lythwood_room, concrete_tunnel, autumn_ground; match the HDRI mood to the scene (forest, street night, sunset field, room interior).); prefer a model for the hero part when one fits, primitives for the rest. Hero rule: the single most important part in the scene is either a model call with a Khronos URL or a glass/water material with transmission above 0.5; it is never a flat opaque primitive.; "geometry":{"count":500,"size":0.08} sets particle count/size (points type only). Material options: clearcoat, clearcoatRoughness, transmission, ior, emissive, opacity, transparent, "map" for a real albedo texture, and "normalMap" for surface relief (a normal map matching the albedo is applied automatically, so set it only to override); Surfaces carry matter: set material.map to a verified texture URL matching the substance, pattern https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{slug}/{slug}_diff_1k.jpg with slugs like dark_wooden_planks, kitchen_wood, brick_floor_02, brick_floor, metal_plate, blue_metal_plate, denim_fabric, aerial_rocks_01, brown_mud_rocks_01, grass_ground, brushed_concrete, marble_01, grey_plaster, snow_01, bark_brown_01, aerial_sand, blue_floor_tiles_01; or three.js repo textures like https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/hardwood2_diffuse.jpg, brick_diffuse.jpg, waternormals.jpg, grasslight-big.jpg, planets/earth_atmos_2048.jpg. Space scenes use the earth/moon maps.
Staging rules (follow all): theme.backdrop sets the sky: warm light like #e9e4d6 or #dfe5e6 by default, dark navy like #0d1120 ONLY for space or night scenes, never near-white like #ffffff or #fafafa which blinds the render; Ground: never author one. No ground plane, slab, disc, or stage: the renderer provides the stage, and any horizontal plane/circle or thin floor-slab wider than 8 units is rejected. Rest the lowest solid at y near 0. Backdrops stay behind the action, never overhead. Keep every part within 25 units of the origin. Compose tightly: keep all subjects within 8 units of the origin so the scene fills the frame instead of floating in an empty stage. Contact rule: parts are staged for you in causal order, seated on the ground with mating faces touching. Set each transform.p to a rough guess near the origin; the stage manager re-seats every solid on the ground in causal order, so spend your effort on correct sizes, substances, joints, and the causal chain, not exact coordinates. Compose every multi-part organ from 2-4 primitives (prefer 3) sharing one group label; no finished part is a lone cone, cylinder, or box. Worlds with more than 6 nodes MUST contain at least one group call or they are rejected. Keep every part within 25 units of the origin. Every solid part touches another part or the ground; only particles, light rays, and flames float free. Scale discipline: model at hand scale with the whole assembly inside a 20-unit sphere; the largest single solid is at most 12 units and a door, wall, or housing at most 16, so close-ups keep context. Labels are 1-3 words. Never use pure black (#000000) or pure white (#FFFFFF) tints except in a space scene. Water and glass use transmission or low roughness, not flat gray.
Naming, joints, and glow (follow all): name every part with its real object word (valve, lens, gear, spring, knob, mouthpiece, wheel, bulb, key, pin, cap, switch, lever, cup, bell, grille, screen). The renderer builds handles, rims, teeth, stems, and glass from the name and assigns real wood, metal, and glass textures from it; generic names (part-1, thing, object, bit) render as bare plastic. Lamps, flames, screens, beams, and suns glow: set "emissive" to a warm color on them. Smoke, steam, mist, and cloud particle swarms rise; droplet, spark, ember, and rain swarms fall — name points swarms accordingly. Hinge range is degrees of swing, anchor is the pivot point between the two parts, axis is the rotation axis (usually [0,0,1] facing the viewer). Slider range is world-unit travel along the axis: keep spans small like [0,1.5] or parts fly across the stage. Gear joints need two meshing wheels. Spin speeds: big parts slow (rpm 5-15), small parts quicker (rpm 15-40). Tube radius 0.1-0.3 for wires and hoses; light beams stay thin. probe.prompt asks which part drives this step and its answer is the becauseOf node id; narration is one vivid sentence describing the visible motion. The camera call is optional and only sets the opening axis; per-beat close-ups are automatic, so omit it unless the opening needs a specific axis.
Rules: "$i" in a string becomes the index. {"$i":[base,step]} in a numeric slot becomes base+i*step. Medium: 2d for flat layouts with no moving joints (circuits, maps, timelines, diagrams); 3d only when parts have volume and joints move them in depth. REQUIRED for 3d and enforced by rejection: include at least one hinge, slider, or gear joint plus non-uniform part scales; a uniform unjointed 3d scene is always rejected, so when in doubt declare 2d. Each beat spotlights a different part; never repeat a part name in the spine. Every becauseOf references an existing node id. Every beat has exactly one probe whose answer is a node id. Use 3-8 beats. Pick the primitive that matches each part: sphere for planets, atoms, droplets; cone for funnels, nozzles; torus/torusKnot for rings, coils, orbits; capsule for pills, cells; tetrahedron/octahedron/dodecahedron/icosahedron for crystals, dice, molecules; circle/ring for discs, halos, orbits; tube with a path for pipes, hoses, orbits (keep every path point within 6 units of the node origin; longer paths are rejected); model for a hero part (verified URLs below); points for particle swarms (molecules, stars, comparisons). Cylinders for shafts, pistons, rods, wheels and bars; boxes only for housings and blocks; planes only for ground or backdrops. Never use boxes for everything. Set verification honestly: "solver" only if motion matches a closed-form formula, else "sketch". Never claim "sourced". Output ONLY the code.`;

const singleAttempt = (
  concept: string,
  onStage?: (stage: "research" | "build") => void
): Effect.Effect<{ scene: SceneData; quality: number }, GenerateSceneError> =>
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
    const scene = adaptDslToScene(dsl);
    const quality = scene.dsl ? scoreSceneDsl(scene.dsl) : null;
    yield* Effect.sync(() =>
      console.log(
        `[MetaModelAPI] scene: ${dsl.nodes.length} nodes, ${dsl.groups.length} groups` +
          (dsl.groups.length > 0
            ? ` (${dsl.groups.map((g) => `${g.id}:${g.members.length}`).join(", ")})`
            : "") +
          (quality ? `, quality ${quality.score}/100` : "")
      )
    );
    return { scene, quality: quality?.score ?? 0 };
  });

// Prompt variants for the quality loop. Each nudges a different weak
// axis; temperature 0 makes each variant deterministic, so different
// words are the only source of variety.
const QUALITY_VARIANTS: Array<(concept: string) => string> = [
  (c) => c,
  (c) =>
    `${c} (stage compactly: every part touching its neighbors in one tight row; texture every surface: brushed metal, wood grain, glass)`,
  (c) =>
    `${c} (compose each organ from 3 primitives in a named group; give the hero part glass transmission or an explicit texture map)`,
];

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
    // Exception: flat-concept rejections (E_MEDIUM_MISMATCH, E_HERO_DULL)
    // are surfaced for the UI boundary, which runs one guided second
    // attempt as a flat 2D diagram. A dead end becomes a diagram
    // instead of an error card.
    const deterministic = (e: GenerateSceneError): boolean =>
      e._tag === "Truncated" ||
      e.message.includes("E_MEDIUM_MISMATCH") ||
      e.message.includes("E_HERO_DULL") ||
      e.message.includes("E_BEAT_COUNT") ||
      e.message.includes("E_SPINE_DUP") ||
      e.message.includes("E_GROUP_REQUIRED") ||
      e.message.includes("E_TUBE_SPRAWL");
    const attempt = (prompt: string) =>
      Effect.retry(singleAttempt(prompt, onStage), {
        times: MAX_ATTEMPTS - 1,
        schedule: Schedule.exponential("1 second"),
        while: (e) => !deterministic(e),
      });
    // Closed loop: try variants in order, keep the best-scoring scene,
    // stop early once one passes. Weak worlds re-prompt instead of
    // shipping the first draft; failures fall through to the next
    // variant, and the last error stands if everything fails.
    return Effect.gen(function* () {
      let best: SceneData | null = null;
      let bestScore = -1;
      let lastError: GenerateSceneError | null = null;
      for (const variant of QUALITY_VARIANTS) {
        const out = (yield* attempt(variant(concept)).pipe(
          Effect.match({
            onFailure: (e) => ({ ok: false as const, error: e }),
            onSuccess: (r) => ({ ok: true as const, ...r }),
          })
        )) as
          | { ok: false; error: GenerateSceneError }
          | { ok: true; scene: SceneData; quality: number };
        if (!out.ok) {
          lastError = out.error;
          continue;
        }
        if (out.quality > bestScore) {
          bestScore = out.quality;
          best = out.scene;
        }
        if (out.quality >= ACCEPT_SCORE) break;
      }
      if (best) return best;
      return yield* Effect.fail(
        lastError ??
          new ApiHttpError({
            status: 0,
            message: "E_API_HTTP: all quality attempts failed without a scene",
          })
      );
    });
  }
}

export const metaModelAPI = new MetaModelAPI();
