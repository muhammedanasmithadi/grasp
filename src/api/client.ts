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

const singleAttempt = (
  concept: string
): Effect.Effect<SceneData, GenerateSceneError> =>
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
              {
                role: "system",
                content: `You generate a 3D teaching scene by writing calls to a fixed builder API. Infer the mechanism from the user prompt. Output ONLY code, one call per line. No prose. No markdown. No JSON.

Available calls (args are strict JSON objects):
concept({"question":"...","medium":"3d|2d|hybrid","mediumWhy":"...","verification":"solver|sketch"})
theme({"motif":"...","palette":"okabe-ito","keyAzimuth":135,"backdrop":"#e9e4d6"})
box|cylinder|sphere|cone|torus|torusKnot|tetrahedron|octahedron|dodecahedron|icosahedron|capsule|circle|ring|tube|plane|model|points({"id":"...","parent":null,"transform":{"p":[0,0,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#E69F00"},"label":"...","geometry":{}})
hinge|slider|gear({"id":"...","a":"node-id","b":"node-id","anchor":[0,0,0],"axis":[0,0,1],"range":[0,360],"driver":{"kind":"time","rpm":30}})
beat({"id":"...","t":[0,6],"goal":"...","becauseOf":["node-id"],"probe":{"kind":"trace","prompt":"...","answer":"node-id"},"narration":"..."})
camera({"axisOfAction":[0,1,0],"shots":[{"t":0,"size":"wide","target":"node-id","move":"orbit-in"}]})

Loops for repeated parts:
for i in range(0, 12) {
box({"id":"bar-$i","parent":null,"transform":{"p":[{"$i":[-8,1.5]},-0.3,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.1,"tint":"#0072B2"},"label":"bar"})
}

Geometry options (all optional): "geometry":{"args":[...]} overrides shape dimensions; "geometry":{"path":[[x,y,z],...],"radius":0.15} draws a curved tube through points; "geometry":{"url":"Khronos-sample-asset-glb-url"} loads a real 3D model (model type only; real designer meshes, picked by domain. Verified URLs (use exactly): Fox https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb, CesiumMan .../Models/CesiumMan/glTF-Binary/CesiumMan.glb, MilkTruck .../Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb, FlightHelmet .../Models/FlightHelmet/glTF/FlightHelmet.gltf, DamagedHelmet .../Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb, BrainStem .../Models/BrainStem/glTF-Binary/BrainStem.glb, Avocado .../Models/Avocado/glTF-Binary/Avocado.glb, WaterBottle .../Models/WaterBottle/glTF-Binary/WaterBottle.glb, BoomBox .../Models/BoomBox/glTF-Binary/BoomBox.glb, Duck .../Models/Duck/glTF-Binary/Duck.glb, Lantern .../Models/Lantern/glTF-Binary/Lantern.glb, Corset .../Models/Corset/glTF-Binary/Corset.glb (all under https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/). No other hosts.); prefer a model for the hero part when one fits, primitives for the rest. Hero rule: the single most important part in the scene is either a model call with a Khronos URL or a glass/water material with transmission above 0.5; it is never a flat opaque primitive.; "geometry":{"count":500,"size":0.08} sets particle count/size (points type only). Material options: clearcoat, clearcoatRoughness, transmission, ior, emissive, opacity, transparent.
Staging rules (follow all): theme.backdrop sets the sky: warm light like #e9e4d6 or #dfe5e6 by default, dark navy like #0d1120 ONLY for space or night scenes. Ground: exactly one horizontal plane (r:[-1.5708,0,0]) sized 16-24 wide at the lowest y; backdrops stay behind the action, never overhead. Keep every part within 25 units of the origin. Contact rule: mating faces touch. A valve seats inside its port (overlapping bores, shared axis), a shaft enters its bore, stacked parts share a contact plane, a key sits inside its lock. Every solid part touches another part or the ground; only particles, light rays, and flames float free. Scale discipline: model at hand scale with the whole assembly inside a 20-unit sphere; the largest single solid is at most 12 units and a door, wall, or housing at most 16, so close-ups keep context. Labels are 1-3 words. Never use pure black (#000000) or pure white (#FFFFFF) tints except in a space scene. Water and glass use transmission or low roughness, not flat gray.
Rules: "$i" in a string becomes the index. {"$i":[base,step]} in a numeric slot becomes base+i*step. Every becauseOf references an existing node id. Every beat has exactly one probe whose answer is a node id. Use 3-8 beats. Pick the primitive that matches each part: sphere for planets, atoms, droplets; cone for funnels, nozzles; torus/torusKnot for rings, coils, orbits; capsule for pills, cells; tetrahedron/octahedron/dodecahedron/icosahedron for crystals, dice, molecules; circle/ring for discs, halos, orbits; tube with a path for pipes, hoses, orbits; model for a hero part (Khronos sample assets only); points for particle swarms (molecules, stars, comparisons). Cylinders for shafts, pistons, rods, wheels and bars; boxes only for housings and blocks; planes only for ground or backdrops. Never use boxes for everything. Set verification honestly: "solver" only if motion matches a closed-form formula, else "sketch". Never claim "sourced". Output ONLY the code.`,
              },
              {
                role: "user",
                content: concept,
              },
            ],
            temperature: 0.0,
            max_tokens: 50000,
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

  generateScene(concept: string): Effect.Effect<SceneData, GenerateSceneError> {
    return Effect.retry(singleAttempt(concept), {
      times: MAX_ATTEMPTS - 1,
      schedule: Schedule.exponential("1 second"),
      while: (e) => e._tag !== "Truncated",
    });
  }
}

export const metaModelAPI = new MetaModelAPI();
