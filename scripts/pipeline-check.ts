// End-to-end pipeline check: model-like builder code in, assertions out.
// Runs the REAL pipeline: parseSceneCode -> validateSceneDsl ->
// layoutScene -> adaptDslToScene -> createMutation -> DetailFor.
import { Effect } from "effect";
import { parseSceneCode } from "../src/api/sceneCode.ts";
import { adaptDslToScene } from "../src/api/parser.ts";
import { createMutation } from "../src/api/mutations.ts";
import { DetailFor } from "../src/components/details.tsx";
import { injectHero } from "../src/api/hero.ts";
import { scoreSceneDsl, ACCEPT_SCORE } from "../src/api/quality.ts";
import { substanceTexture, liftBlackTint, brightFaceTint, tubePointsRelative } from "../src/components/Scene3D.tsx";
import type { SceneDsl } from "../src/types.ts";


const THIN = `
concept({"question":"thin abstract demo","medium":"3d","mediumWhy":"x","verification":"sketch"})
theme({"motif":"m","palette":"okabe-ito","keyAzimuth":135})
box({"id":"p1","parent":null,"transform":{"p":[-20,5,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"part one","geometry":{"args":[1,1,1]}})
box({"id":"p2","parent":null,"transform":{"p":[-10,5,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"part two","geometry":{"args":[1,1,1]}})
box({"id":"p3","parent":null,"transform":{"p":[0,5,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"part three","geometry":{"args":[1,1,1]}})
box({"id":"p4","parent":null,"transform":{"p":[10,5,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"part four","geometry":{"args":[1,1,1]}})
box({"id":"p5","parent":null,"transform":{"p":[20,5,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"part five","geometry":{"args":[1,1,1]}})
box({"id":"p6","parent":null,"transform":{"p":[0,9,9],"r":[0,0,0],"s":[1,2,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"part six","geometry":{"args":[1,1,1]}})
group({"id":"g1","label":"pair one","members":["p1","p2"]})
hinge({"id":"j1","a":"p1","b":"p2","anchor":[0,0,0],"axis":[0,0,1],"range":[0,90],"driver":{"kind":"time","rpm":20}})
beat({"id":"s1","t":[0,6],"goal":"g1","becauseOf":["p1"],"probe":{"kind":"trace","prompt":"p","answer":"p1"},"narration":"n"})
beat({"id":"s2","t":[6,12],"goal":"g2","becauseOf":["p2"],"probe":{"kind":"trace","prompt":"p","answer":"p2"},"narration":"n"})
beat({"id":"s3","t":[12,18],"goal":"g3","becauseOf":["p3"],"probe":{"kind":"trace","prompt":"p","answer":"p3"},"narration":"n"})
camera({"axisOfAction":[0,1,0],"shots":[]})
`;

const GOOD = `
concept({"question":"how a deadbolt lock opens with a key","medium":"3d","mediumWhy":"parts move in depth","verification":"sketch"})
theme({"motif":"brass deadbolt on oak door","palette":"okabe-ito","keyAzimuth":135,"backdrop":"#e9e4d6","hdri":"https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/lythwood_room_1k.hdr"})
box({"id":"door","parent":null,"transform":{"p":[18,9,14],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.7,"metalness":0.1,"tint":"#8a5a2b","map":"https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dark_wooden_planks/dark_wooden_planks_diff_1k.jpg"},"label":"oak door","geometry":{"args":[3,7,0.5]}})
cylinder({"id":"plug","parent":null,"transform":{"p":[-12,22,-9],"r":[0,0,1.5708],"s":[1,1,1]},"material":{"roughness":0.35,"metalness":0.9,"tint":"#C9A227"},"label":"brass plug","geometry":{"args":[0.5,0.5,1.6]}})
box({"id":"bolt","parent":null,"transform":{"p":[25,-14,6],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.35,"metalness":0.9,"tint":"#C9A227"},"label":"bolt bar","geometry":{"args":[1.8,0.5,0.5]}})
cylinder({"id":"shaft","parent":null,"transform":{"p":[-30,8,20],"r":[0,0,1.5708],"s":[1,1,1]},"material":{"roughness":0.35,"metalness":0.9,"tint":"#C9A227"},"label":"key shaft","geometry":{"args":[0.18,0.18,2.2]}})
torus({"id":"bow","parent":null,"transform":{"p":[40,30,-15],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.35,"metalness":0.9,"tint":"#C9A227"},"label":"key bow","geometry":{"args":[0.5,0.18]}})
box({"id":"pin1","parent":null,"transform":{"p":[-45,-25,30],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.4,"metalness":0.8,"tint":"#D55E00"},"label":"pin one","geometry":{"args":[0.2,0.6,0.2]}})
box({"id":"pin2","parent":null,"transform":{"p":[50,40,25],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.4,"metalness":0.8,"tint":"#D55E00"},"label":"pin two","geometry":{"args":[0.2,0.8,0.2]}})
box({"id":"housing","parent":null,"transform":{"p":[-15,-30,-20],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.6,"metalness":0.3,"tint":"#8a8272"},"label":"lock housing","geometry":{"args":[8,8,8]}})
cylinder({"id":"mast","parent":null,"transform":{"p":[70,0,-40],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#8a8272"},"label":"tall mast","geometry":{"args":[0.3,0.3,8]}})
capsule({"id":"spring","parent":null,"transform":{"p":[60,-40,30],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.4,"metalness":0.8,"tint":"#E69F00"},"label":"tiny spring","geometry":{"args":[0.05,0.1]}})
tube({"id":"beam","parent":null,"transform":{"p":[0,3,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.4,"metalness":0.2,"tint":"#E69F00","emissive":"#E69F00"},"label":"light beam","geometry":{"path":[[0,3,0],[3,3.5,1],[5,3,2]],"radius":1.2}})
group({"id":"grp-door","label":"door assembly","members":["door","bolt"]})
group({"id":"grp-key","label":"key assembly","members":["shaft","bow"]})
group({"id":"grp-pins","label":"pin set","members":["pin1","pin2"]})
hinge({"id":"j1","a":"shaft","b":"plug","anchor":[0,0,0],"axis":[0,0,1],"range":[0,90],"driver":{"kind":"time","rpm":20}})
beat({"id":"s1","t":[0,6],"goal":"key enters the plug","becauseOf":["shaft"],"probe":{"kind":"trace","prompt":"what enters the plug?","answer":"shaft"},"narration":"The key slides home."})
beat({"id":"s2","t":[6,12],"goal":"plug turns with key","becauseOf":["plug"],"probe":{"kind":"trace","prompt":"what turns?","answer":"plug"},"narration":"The plug rotates."})
beat({"id":"s3","t":[12,18],"goal":"bolt retracts","becauseOf":["bolt"],"probe":{"kind":"trace","prompt":"what retracts?","answer":"bolt"},"narration":"The bolt pulls back."})
beat({"id":"s4","t":[18,24],"goal":"housing holds all","becauseOf":["housing"],"probe":{"kind":"trace","prompt":"what holds all?","answer":"housing"},"narration":"The housing holds all."})
camera({"axisOfAction":[0,1,0],"shots":[{"t":0,"size":"wide","target":"door","move":"orbit-in"}]})
`;

const DUP_SPINE = GOOD.replace(`"id":"s3","t":[12,18],"goal":"bolt retracts","becauseOf":["bolt"]`, `"id":"s3","t":[12,18],"goal":"bolt retracts again","becauseOf":["shaft"]`);

const run = Effect.gen(function* () {
  const results: string[] = [];
  const check = (name: string, cond: boolean, detail = ""): void => {
    results.push(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
    if (!cond) throw new Error(`assertion failed: ${name} ${detail}`);
  };

  // 1. Good world: validates, lays out tight and seated.
  const dsl = (yield* parseSceneCode(GOOD)) as SceneDsl;
  const scene = adaptDslToScene(dsl);
  const laid = scene.dsl!;
  const xs = laid.nodes.map((n) => Math.abs(n.transform.p[0]));
  const minY = Math.min(...laid.nodes.filter((n) => n.type !== "tube").map((n) => n.transform.p[1]));
  check("validates", true);
  check("compact-row", Math.max(...xs) < 12, `max|x|=${Math.max(...xs).toFixed(2)}`);
  check("seated", minY >= 0, `minY=${minY.toFixed(2)}`);
  check("groups-kept", laid.groups.length === 3, `${laid.groups.length} groups`);
  // Uniform presence: solid primitives sized into [0.4, 2.2] half-extent.
  const housing = laid.nodes.find((n) => n.id === "housing")!;
  const spring = laid.nodes.find((n) => n.id === "spring")!;
  check("giant-shrunk", Math.abs(housing.transform.s[0] - 1.2 / 4) < 0.01, `s=${housing.transform.s[0].toFixed(3)}`);
  check("speck-grown", Math.abs(spring.transform.s[0] - 0.5 / 0.1) < 0.01, `s=${spring.transform.s[0].toFixed(2)}`);
  const mast = laid.nodes.find((n) => n.id === "mast")!;
  // Validator clamps the 8-tall arg to 6 first, so layout sees hy=3.
  check("mast-capped-by-height", Math.abs(mast.transform.s[0] - 1.2 / 3) < 0.02, `s=${mast.transform.s[0].toFixed(2)}`);
  // Stability: laying out twice changes nothing (steady frame).
  const twice = adaptDslToScene(laid).dsl!;
  const same = JSON.stringify(twice.nodes.map((n) => n.transform)) === JSON.stringify(laid.nodes.map((n) => n.transform));
  check("layout-stable", same);
  const tube = laid.nodes.find((n) => n.id === "beam")!;
  const reach = Math.max(...(tube.geometry!.path as number[][]).map((p) => Math.abs(p[0] - tube.transform.p[0])));
  check("tube-clamped", reach <= 3.61, `reach=${reach.toFixed(2)}`);
  const beamR = laid.nodes.find((n) => n.id === "beam")!.geometry!.radius as number;
  check("tube-radius-capped", beamR <= 0.41, `r=${beamR}`);
  check("beats-mapped", scene.beats.length === 4 && scene.causalSpine.length === 4);

  // 2. Duplicate spine beats merge instead of failing the world.
  const merged = (yield* parseSceneCode(DUP_SPINE)) as SceneDsl;
  const mergedLabels = merged.beats.map((b) => {
    const n = merged.nodes.find((x) => x.id === (b.becauseOf as string[])[0]);
    return (n?.label ?? "").toLowerCase();
  });
  check("spine-merged", merged.beats.length === 3 && new Set(mergedLabels).size === 3, `${merged.beats.length} beats`);

  // 3. Drill visibly breaks: true driver hidden on the drill beat.
  const mut = createMutation(laid, "deadbolt-test")!;
  check("mutation-made", !!mut, mut?.kind ?? "none");
  const hidden = mut.hiddenNodeIds;
  check("driver-hidden", hidden.includes(mut.probe.answer), `hidden=${hidden} answer=${mut.probe.answer}`);

  // 4. Detail library: word-matched builders and generic trims exist.
  const dslNode = (id: string, type: string, label: string) => ({
    id, type, parent: null,
    transform: { p: [0, 1, 0], r: [0, 0, 0], s: [1, 1, 1] },
    material: { roughness: 0.5, metalness: 0.6, tint: "#C9A227" },
    label, geometry: { args: [1, 1, 1] },
  });
  check("detail-valve", DetailFor({ node: dslNode("v", "cylinder", "brass valve") as never }) !== null);
  check("detail-gear", DetailFor({ node: dslNode("g", "cylinder", "drive gear") as never }) !== null);
  check("detail-box-trim", DetailFor({ node: dslNode("b", "box", "plain housing") as never }) !== null);
  check("detail-sphere-none", DetailFor({ node: dslNode("s", "sphere", "plain orb") as never }) === null);

  // 5. Authored slabs strip instead of failing the world.
  const SLAB = GOOD + 'box({"id":"slab","parent":null,"transform":{"p":[0,0,0],"r":[-1.5708,0,0],"s":[1,1,1]},"material":{"roughness":0.9,"metalness":0,"tint":"#8a8272"},"label":"stage slab","geometry":{"args":[16,0.5,16]}})\n';
  const withSlab = (yield* parseSceneCode(SLAB)) as SceneDsl;
  const laidSlab = adaptDslToScene(withSlab).dsl!;
  check("slab-stripped", !laidSlab.nodes.some((n) => n.id === "slab"), `${laidSlab.nodes.length} nodes kept`);

  // 6. Hero injection: matching concepts gain a verified scan, others untouched.
  const drillDsl = { ...laid, concept: { ...laid.concept, question: "how a power drill drives screws" } };
  const withHero = injectHero(drillDsl as SceneDsl);
  check("hero-injected", withHero.nodes.some((n) => n.id === "hero-scan" && n.type === "model"), `${withHero.nodes.length} nodes`);
  check("hero-grouped", withHero.groups[0]?.members.includes("hero-scan") ?? false);
  const horseDsl = { ...laid, concept: { ...laid.concept, question: "how horses gallop across fields" } };
  const withHorse = injectHero(horseDsl as SceneDsl);
  check("hero-horse", withHorse.nodes.some((n) => n.id === "hero-scan" && n.label === "horse"), "horse injected");
  const fishDsl = { ...laid, concept: { ...laid.concept, question: "how a fish swims upstream" } };
  check("hero-fish", injectHero(fishDsl as SceneDsl).nodes.some((n) => n.label === "fish"));
  const robotArm = { ...laid, concept: { ...laid.concept, question: "how a robot arm picks up boxes" } };
  check("hero-skipped-machine", !injectHero(robotArm as SceneDsl).nodes.some((n) => n.id === "hero-scan"));
  const robotWalks = { ...laid, concept: { ...laid.concept, question: "how a robot walks upstairs" } };
  check("hero-robot", injectHero(robotWalks as SceneDsl).nodes.some((n) => n.label === "robot"));
  const noHero = injectHero(laid);
  check("hero-skipped", noHero.nodes.length === laid.nodes.length);
  const dupHero = injectHero(withHero);
  check("hero-once", dupHero.nodes.filter((n) => n.id === "hero-scan").length === 1);

  // 7. Substance fallback covers mechanical words (keys, gears, springs).
  const subNode = (label: string, type = "cylinder") => ({ id: "x", type, parent: null, transform: { p: [0,1,0], r: [0,0,0], s: [1,1,1] }, material: { roughness: 0.5, metalness: 0.8, tint: "#C9A227" }, label, geometry: { args: [1,1,1] } });
  check("substance-gear", (substanceTexture(subNode("large gear") as never) ?? "").includes("blue_metal_plate"));
  check("substance-key", (substanceTexture(subNode("key bow") as never) ?? "").includes("blue_metal_plate"));
  check("substance-spring", (substanceTexture(subNode("mainspring coil") as never) ?? "").includes("blue_metal_plate"));

  // 8. Near-black tints lift to warm charcoal; mid tones untouched.
  check("black-lifted", liftBlackTint("#0a0a0a") === "#4a4238", liftBlackTint("#0a0a0a"));
  check("gray-kept", liftBlackTint("#8a8272") === "#8a8272");

  // 9. Large bright faces get a gentle pull; small ones untouched.
  check("bright-pulled", brightFaceTint("#ffffff", 6) !== "#ffffff", brightFaceTint("#ffffff", 6));
  check("small-kept", brightFaceTint("#ffffff", 2) === "#ffffff");
  check("paper-pulled", brightFaceTint("#ffffff", 3) !== "#ffffff", brightFaceTint("#ffffff", 3));
  check("gray-kept2", brightFaceTint("#8a8272", 6) === "#8a8272");

  // 10. Tube paths relativize to the node origin (no double transform).
  const rel = tubePointsRelative([[0,3,0],[4,4,1]] as never, [0,3,0] as never);
  check("tube-relative", rel[0][0] === 0 && rel[0][1] === 0 && rel[1][0] === 4 && rel[1][1] === 1, JSON.stringify(rel));

  // 11. Beat-referenced tubes join the row (seated subjects), while
  // unreferenced tubes pin as atmosphere.
  const TUBEROW = `
concept({"question":"t","medium":"3d","mediumWhy":"x","verification":"sketch"})
theme({"motif":"m","palette":"okabe-ito","keyAzimuth":135})
box({"id":"a","parent":null,"transform":{"p":[30,9,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#E69F00"},"label":"block a","geometry":{"args":[1.2,1,1]}})
hinge({"id":"j1","a":"a","b":"b","anchor":[0,0,0],"axis":[0,0,1],"range":[0,90],"driver":{"kind":"time","rpm":20}})
tube({"id":"hose","parent":null,"transform":{"p":[0,4,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.2,"tint":"#0072B2"},"label":"feed hose","geometry":{"path":[[0,4,0],[3,4,0]],"radius":0.15}})
box({"id":"b","parent":null,"transform":{"p":[-20,6,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#009E73"},"label":"block b","geometry":{"args":[1,1,1]}})
beat({"id":"s1","t":[0,6],"goal":"g1","becauseOf":["hose"],"probe":{"kind":"trace","prompt":"p","answer":"hose"},"narration":"n"})
beat({"id":"s2","t":[6,12],"goal":"g2","becauseOf":["a"],"probe":{"kind":"trace","prompt":"p","answer":"a"},"narration":"n"})
beat({"id":"s3","t":[12,18],"goal":"g3","becauseOf":["b"],"probe":{"kind":"trace","prompt":"p","answer":"b"},"narration":"n"})
camera({"axisOfAction":[0,1,0],"shots":[]})
`;
  const tubeLaid = adaptDslToScene((yield* parseSceneCode(TUBEROW)) as SceneDsl).dsl!;
  const hose = tubeLaid.nodes.find((n) => n.id === "hose")!;
  check("row-tube-seated", hose.transform.p[1] < 1.0, `y=${hose.transform.p[1].toFixed(2)}`);
  const hosePath = (hose.geometry!.path as number[][])[0];
  check("row-tube-path-follows", hosePath[1] < 3.0, `pathY=${hosePath[1].toFixed(2)}`);

  // 12. Celestial fallback: globes get earth, moons get the moon.
  const celNode = (label: string) => ({ id: "c", type: "sphere", parent: null, transform: { p: [0,1,0], r: [0,0,0], s: [1,1,1] }, material: { roughness: 0.5, metalness: 0.1, tint: "#888888" }, label, geometry: { args: [1] } });
  check("substance-earth", (substanceTexture(celNode("Globe Sphere") as never) ?? "").includes("earth_atmos_2048"));
  check("substance-moon", (substanceTexture(celNode("lunar disc") as never) ?? "").includes("moon_1024"));

  // 13. Quality gate: the good world passes, a thin one does not.
  const goodScore = scoreSceneDsl(laid);
  check("quality-good-passes", goodScore.score >= ACCEPT_SCORE, `${goodScore.score}/100`);
  const thin = (yield* parseSceneCode(THIN)) as SceneDsl;
  const thinLaid = adaptDslToScene(thin).dsl!;
  const thinScore = scoreSceneDsl(thinLaid);
  check("quality-thin-fails", thinScore.score < ACCEPT_SCORE && thinScore.score < goodScore.score, `${thinScore.score}/100`);
  console.log(results.join("\n"));
  console.log("E2E ALL GREEN");
});

Effect.runPromise(run).catch((e) => {
  console.error("E2E RED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
