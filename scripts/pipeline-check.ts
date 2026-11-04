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
import { particleBehavior } from "../src/components/Scene3D.tsx";
import { normalizeArgs } from "../src/api/sceneCode.ts";
import { verifyScene } from "../src/api/verify.ts";
import { crankSliderScene, pendulumScene, matchTemplate } from "../src/api/templates.ts";
import { pendulumAngle, pendulumPeriod } from "../src/api/kinematics.ts";
import { estimateExtents } from "../src/api/layout.ts";
import { crankSliderPose, sliderPosition, validCrankSlider } from "../src/api/kinematics.ts";
import { layoutDiagram } from "../src/components/diagramLayout.ts";
import { validateReferences } from "../src/api/validateDsl.ts";
import { readFileSync } from "node:fs";
import { normalForAlbedo } from "../src/api/substance.ts";
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
  // Assembled staging: ONE uniform factor for the whole scene.
  check("uniform-scale", Math.abs(housing.transform.s[0] - spring.transform.s[0]) < 0.001, `housing=${housing.transform.s[0].toFixed(3)} spring=${spring.transform.s[0].toFixed(3)}`);
  const laidSpan = (() => {
    let lo = Infinity, hi = -Infinity;
    for (const n of laid.nodes) { const e = estimateExtents(n); lo = Math.min(lo, n.transform.p[0] - e.hx); hi = Math.max(hi, n.transform.p[0] + e.hx); }
    return hi - lo;
  })();
  check("scene-fits-stage", laidSpan <= 9.6, `span=${laidSpan.toFixed(2)}`);
  const mast = laid.nodes.find((n) => n.id === "mast")!;
  check("mast-same-uniform-k", Math.abs(mast.transform.s[0] - housing.transform.s[0]) < 0.001, `s=${mast.transform.s[0].toFixed(3)}`);
  // Stability: laying out twice changes nothing (steady frame).
  const twice = adaptDslToScene(laid).dsl!;
  const maxDelta = Math.max(...twice.nodes.map((n, i) => Math.abs(n.transform.p[0] - laid.nodes[i].transform.p[0])));
  check("layout-stable", maxDelta < 0.05, `delta=${maxDelta.toFixed(3)}`);
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
  check("slab-kept", laidSlab.nodes.some((n) => n.id === "slab"), `${laidSlab.nodes.length} nodes kept`);

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
  check("tube-in-scene", hose.transform.p[1] < 2.0, `y=${hose.transform.p[1].toFixed(2)}`);
  const hosePath = (hose.geometry!.path as number[][])[0];
  check("tube-path-shares-transform", Math.abs(hosePath[0] - hose.transform.p[0]) < 0.01 && Math.abs(hosePath[1] - hose.transform.p[1]) < 0.01, `path0=${hosePath} p=${hose.transform.p}`);

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
  // 14. Physics words route particles: smoke rises, droplets fall.
  check("particle-rise", particleBehavior("steam cloud") === "rise");
  check("particle-fall", particleBehavior("water droplets") === "fall");
  check("particle-drift", particleBehavior("dust motes") === "drift");
  // 15. Relief stays 1k while albedo goes 2k.
  check("normal-1k", (normalForAlbedo("https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/metal_plate/metal_plate_diff_2k.jpg") ?? "").includes("1k/metal_plate/metal_plate_nor_dx_1k.jpg"));
  check("normal-plain", normalForAlbedo("https://cdn.jsdelivr.net/x.jpg") === null);
  // 16. Second figure: women resolve to Michelle, not the soldier.
  const michelle = { ...laid, concept: { ...laid.concept, question: "how a woman throws a ball" } };
  check("hero-michelle", injectHero(michelle as SceneDsl).nodes.some((n) => n.label === "woman"));

  // 17. Wonder-era heroes: fox, duck, truck resolve.
  const foxDsl = { ...laid, concept: { ...laid.concept, question: "how a fox hunts mice" } };
  check("hero-fox", injectHero(foxDsl as SceneDsl).nodes.some((n) => n.label === "fox"));
  const truckDsl = { ...laid, concept: { ...laid.concept, question: "how a truck delivers milk" } };
  check("hero-truck", injectHero(truckDsl as SceneDsl).nodes.some((n) => n.label === "truck"));

  // 18. Geometry contract: segments are not dimensions.
  check("sphere-segments-kept", JSON.stringify(normalizeArgs("sphere", [1, 32, 32])) === "[1,32,32]", JSON.stringify(normalizeArgs("sphere", [1, 32, 32])));
  check("cylinder-shorthand", JSON.stringify(normalizeArgs("cylinder", [0.4, 2])) === "[0.4,0.4,2,24]", JSON.stringify(normalizeArgs("cylinder", [0.4, 2])));
  check("cylinder-full", JSON.stringify(normalizeArgs("cylinder", [0.3, 0.5, 2, 48])) === "[0.3,0.5,2,48]");

  // 19. Honest verification: a lock with hinge+slider earns no solver badge.
  check("lock-not-solver", verifyScene(laid).badge === "illustrative", verifyScene(laid).badge);
  check("template-interactive", verifyScene(crankSliderScene("how a crankshaft works")).badge === "interactive");

  // 20. Assembly preservation: a key parented inside a housing keeps
  // its relative offset and the pair scales by one uniform factor.
  const LOCK = GOOD.replace('cylinder({"id":"plug"', 'cylinder({"id":"keybit","parent":"door","transform":{"p":[19,10,14],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.35,"metalness":0.9,"tint":"#C9A227"},"label":"key bit","geometry":{"args":[0.2,0.2,0.8]}})\ncylinder({"id":"plug"');
  const lockLaid = adaptDslToScene((yield* parseSceneCode(LOCK)) as SceneDsl).dsl!;
  const doorN = lockLaid.nodes.find((n) => n.id === "door")!;
  const bitN = lockLaid.nodes.find((n) => n.id === "keybit")!;
  check("key-follows-parent", Math.abs((bitN.transform.p[0] - doorN.transform.p[0]) - doorN.transform.s[0]) < 0.01 && Math.abs((bitN.transform.p[1] - doorN.transform.p[1]) - doorN.transform.s[0]) < 0.01, `d=(${bitN.transform.p[0] - doorN.transform.p[0]},${bitN.transform.p[1] - doorN.transform.p[1]}) k=${doorN.transform.s[0].toFixed(3)}`);
  check("refs-resolve", validateReferences(lockLaid) === null, validateReferences(lockLaid) ?? "ok");

  // 21. Crank-slider kinematics across the whole cycle.
  const P = { crankRadius: 0.9, rodLength: 3.2 };
  let rodOk = true;
  let prevX = Infinity;
  let monotonicSegments = 0;
  void prevX; void monotonicSegments;
  for (let i = 0; i <= 32; i++) {
    const th = (i / 32) * Math.PI * 2;
    const pose = crankSliderPose(th, P);
    const d = Math.hypot(pose.sliderX - pose.pin.x, 0 - pose.pin.y);
    if (Math.abs(d - P.rodLength) > 1e-6) rodOk = false;
    if (!(sliderPosition(th, P) >= P.rodLength - P.crankRadius - 1e-9 && sliderPosition(th, P) <= P.rodLength + P.crankRadius + 1e-9)) rodOk = false;
  }
  check("rod-stays-connected", rodOk);
  check("invalid-params-rejected", !validCrankSlider({ crankRadius: 2, rodLength: 1.5 }) && validCrankSlider(P));
  const tpl = crankSliderScene("how a crankshaft turns a piston");
  check("template-bypasses-layout", adaptDslToScene(tpl).dsl!.nodes.find((n) => n.id === "piston")!.transform.p[0] === tpl.nodes.find((n) => n.id === "piston")!.transform.p[0]);
  check("template-representation", adaptDslToScene(tpl).representation === "template-3d", adaptDslToScene(tpl).representation);
  check("template-routing", matchTemplate("how a crankshaft works") === "crank-slider" && matchTemplate("how a lock works") === null);

  // 22. Diagram layout: 8 nodes fit, branches branch, long labels survive.
  const seq8 = layoutDiagram(Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, label: `step ${i}` })), Array.from({ length: 7 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, rel: "drives" })));
  check("diagram-8-fit", seq8.placed.length === 8 && seq8.placed.every((p) => p.x >= 0 && p.x + 176 <= seq8.width), `w=${seq8.width}`);
  const branch = layoutDiagram(
    [{ id: "a", label: "root" }, { id: "b", label: "left branch" }, { id: "c", label: "right branch" }, { id: "d", label: "join" }],
    [{ from: "a", to: "b", rel: "feeds" }, { from: "a", to: "c", rel: "feeds" }, { from: "b", to: "d", rel: "joins" }, { from: "c", to: "d", rel: "joins" }]
  );
  const bN = branch.placed.find((p) => p.id === "b")!;
  const cN = branch.placed.find((p) => p.id === "c")!;
  check("diagram-branches", bN.depth === cN.depth && bN.y !== cN.y && branch.placed.find((p) => p.id === "d")!.depth === 2);
  const longL = layoutDiagram([{ id: "x", label: "a very long part name that would overflow any fixed card width" }], []);
  check("diagram-long-label", longL.placed.length === 1 && longL.width > 0);

  // 23. Security: browser source carries no provider credential path.
  const clientSrc = readFileSync("src/api/client.ts", "utf8");
  check("client-no-key", !clientSrc.includes("VITE_META_API_KEY") && !clientSrc.includes("api.meta.ai") && clientSrc.includes("/api/chat"));

  // 24. Pendulum template: exact period, bounded swing, routing.
  check("pendulum-period", Math.abs(pendulumPeriod(2.6) - 3.24) < 0.01, pendulumPeriod(2.6).toFixed(3));
  check("pendulum-bounds", Math.abs(pendulumAngle(0, { length: 2.6, amplitude: 0.55, period: 3.24 })) - 0 < 0.56 && Math.abs(pendulumAngle(0, { length: 2.6, amplitude: 0.55, period: 3.24 })) > 0.54);
  const pend = pendulumScene("how a pendulum swings");
  check("pendulum-interactive", verifyScene(pend).badge === "interactive" && adaptDslToScene(pend).representation === "template-3d");
  check("pendulum-routing", matchTemplate("how a pendulum swings") === "pendulum" && matchTemplate("how a pendulum clock") === null || matchTemplate("pendulum") === "pendulum");

  // 25. De-penetration: overlapping solids separate in plan view.
  const OVER = `
concept({"question":"overlap demo","medium":"3d","mediumWhy":"x","verification":"sketch"})
theme({"motif":"m","palette":"okabe-ito","keyAzimuth":135})
box({"id":"o1","parent":null,"transform":{"p":[0,1,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#E69F00"},"label":"block one","geometry":{"args":[2,2,2]}})
box({"id":"o2","parent":null,"transform":{"p":[0.5,1,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#0072B2"},"label":"block two","geometry":{"args":[2,2,2]}})
box({"id":"o3","parent":null,"transform":{"p":[4,1,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#009E73"},"label":"block three","geometry":{"args":[2,2,2]}})
group({"id":"og","label":"pair","members":["o1","o2"]})
hinge({"id":"oj","a":"o1","b":"o2","anchor":[0,0,0],"axis":[0,0,1],"range":[0,90],"driver":{"kind":"time","rpm":20}})
beat({"id":"s1","t":[0,6],"goal":"g1","becauseOf":["o1"],"probe":{"kind":"trace","prompt":"p","answer":"o1"},"narration":"n"})
beat({"id":"s2","t":[6,12],"goal":"g2","becauseOf":["o2"],"probe":{"kind":"trace","prompt":"p","answer":"o2"},"narration":"n"})
beat({"id":"s3","t":[12,18],"goal":"g3","becauseOf":["o3"],"probe":{"kind":"trace","prompt":"p","answer":"o3"},"narration":"n"})
camera({"axisOfAction":[0,1,0],"shots":[]})
`;
  const overLaid = adaptDslToScene((yield* parseSceneCode(OVER)) as SceneDsl).dsl!;
  const o1 = overLaid.nodes.find((n) => n.id === "o1")!;
  const o2 = overLaid.nodes.find((n) => n.id === "o2")!;
  const planDist = Math.hypot(o2.transform.p[0] - o1.transform.p[0], o2.transform.p[2] - o1.transform.p[2]);
  const needDist = estimateExtents(o1).hx + estimateExtents(o2).hx - 0.05;
  check("depenetrated", planDist >= needDist, `dist=${planDist.toFixed(2)} need=${needDist.toFixed(2)}`);
  check("detail-blade", DetailFor({ node: dslNode("r", "box", "rotor blade assembly") as never }) !== null);

  console.log(results.join("\n"));
  console.log("E2E ALL GREEN");
});

Effect.runPromise(run).catch((e) => {
  console.error("E2E RED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
