// src/api/templates.ts
// Code-owned mechanism templates. Only mechanisms implemented here may
// be presented as interactive 3D; everything else routes to a diagram
// or an explicitly illustrative scene. The model never selects a
// template by assertion: routing matches the user's words in code, and
// parameters are validated before any geometry is built.

import type { SceneDsl } from "../types";
import {
  validCrankSlider,
  pendulumPeriod,
  type CrankSliderParams,
  type PendulumParams,
} from "./kinematics";

export const CRANK_SLIDER_PARAMS: CrankSliderParams = {
  crankRadius: 0.9,
  rodLength: 3.2,
};

export const PENDULUM_PARAMS: PendulumParams = {
  length: 2.6,
  amplitude: 0.55,
  period: pendulumPeriod(2.6),
};

/** Route a concept to a template, or null. Deliberately narrow:
 * a false negative costs an illustrative scene; a false positive
 * would cost correctness. */
export function matchTemplate(concept: string): "crank-slider" | "pendulum" | null {
  const q = ` ${concept.toLowerCase()} `;
  if (q.includes(" pendulum ")) return "pendulum";
  const hits = [
    " crank ",
    " crankshaft ",
    " crank-slider ",
    " slider crank ",
    " piston engine ",
    " steam engine ",
    " reciprocating engine ",
  ];
  return hits.some((h) => q.includes(h)) ? "crank-slider" : null;
}

const RPM = 24;

/** Crank-slider teaching scene. Geometry is authored once, here, with
 * explicit part identities; motion comes from kinematics.ts. The
 * renderer recognizes concept.template and drives parts from the same
 * functions the tests assert. Positions below are rest pose (theta=0):
 * crank center at origin, slider axis along +x, all parts seated. */
export function crankSliderScene(question: string): SceneDsl {
  const p = CRANK_SLIDER_PARAMS;
  if (!validCrankSlider(p)) {
    // Unreachable with the constants above; kept as a hard guard so a
    // future parameter edit fails loudly instead of drawing nonsense.
    throw new Error("E_TEMPLATE_PARAM: crank-slider requires rodLength > crankRadius");
  }
  const mat = (tint: string, metalness = 0.75, roughness = 0.35) => ({
    roughness,
    metalness,
    tint,
  });
  // Slider rest position (theta=0): x = r + L. Piston block is centered
  // half a unit past the slider pin.
  const restX = p.crankRadius + p.rodLength;
  return {
    dslVersion: "0.1",
    concept: {
      question,
      medium: "3d",
      mediumWhy: "Implemented crank-slider template with real pivots and a solved slider position.",
      verification: "sketch",
      template: "crank-slider",
      templateParams: { crankRadius: p.crankRadius, rodLength: p.rodLength },
    },
    theme: { motif: "crank-slider bench model", palette: "okabe-ito", keyAzimuth: 135 },
    nodes: [
      {
        id: "frame",
        type: "box",
        parent: null,
        transform: { p: [1.6, 0.25, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#5b5344", 0.2, 0.7),
        label: "engine frame",
        geometry: { args: [7.4, 0.5, 1.6] },
      },
      {
        id: "crank-wheel",
        type: "cylinder",
        parent: null,
        transform: { p: [0, 1.35, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1] },
        material: mat("#8a6d1f"),
        label: "crank wheel",
        geometry: { args: [1.15, 1.15, 0.28, 32] },
      },
      {
        id: "crank-pin",
        type: "cylinder",
        parent: null,
        transform: { p: [p.crankRadius, 1.35, 0.3], r: [Math.PI / 2, 0, 0], s: [1, 1, 1] },
        material: mat("#c9a227"),
        label: "crank pin",
        geometry: { args: [0.14, 0.14, 0.5, 16] },
      },
      {
        id: "rod",
        type: "box",
        parent: null,
        transform: { p: [(p.crankRadius + restX) / 2, 1.35, 0.3], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#0072B2"),
        label: "connecting rod",
        geometry: { args: [p.rodLength, 0.22, 0.16] },
      },
      {
        id: "piston",
        type: "box",
        parent: null,
        transform: { p: [restX + 0.45, 1.35, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#b03a2e"),
        label: "piston",
        geometry: { args: [0.9, 1.1, 1.1] },
      },
      {
        id: "guide",
        type: "box",
        parent: null,
        transform: { p: [restX + 0.45, 1.35, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: { ...mat("#3f4a56", 0.4, 0.5), transparent: true, opacity: 0.28 },
        label: "cylinder guide",
        geometry: { args: [2.2, 1.5, 1.5] },
      },
    ],
    joints: [
      {
        id: "j-crank",
        type: "hinge",
        a: "frame",
        b: "crank-wheel",
        anchor: [0, 1.35, 0],
        axis: [0, 0, 1],
        range: [0, 360],
        driver: { kind: "time", rpm: RPM },
      },
      {
        id: "j-pin",
        type: "hinge",
        a: "crank-wheel",
        b: "crank-pin",
        anchor: [0, 1.35, 0],
        axis: [0, 0, 1],
        range: [0, 360],
        driver: { kind: "time", rpm: RPM },
      },
      {
        id: "j-slider",
        type: "slider",
        a: "rod",
        b: "piston",
        anchor: [restX, 1.35, 0],
        axis: [1, 0, 0],
        range: [0, 1],
        driver: { kind: "time", rpm: RPM },
      },
    ],
    groups: [
      { id: "g-drive", label: "crank drive", members: ["crank-wheel", "crank-pin", "rod"] },
      { id: "g-output", label: "piston output", members: ["piston", "guide"] },
    ],
    edges: [
      { from: "crank-wheel", to: "crank-pin", rel: "carries" },
      { from: "crank-pin", to: "rod", rel: "pushes and pulls" },
      { from: "rod", to: "piston", rel: "drives" },
      { from: "guide", to: "piston", rel: "constrains" },
    ],
    flows: [],
    camera: { axisOfAction: [0, 0, 1], shots: [] },
    beats: [
      {
        id: "b1",
        t: [0, 6],
        goal: "The crank wheel turns at a steady rate",
        becauseOf: ["crank-wheel"],
        probe: { kind: "trace", prompt: "Which part turns in a full circle?", answer: "crank-wheel" },
        narration: "The crank wheel rotates about its fixed axle, one revolution every 2.5 seconds.",
      },
      {
        id: "b2",
        t: [6, 12],
        goal: "The crank pin circles off-center",
        becauseOf: ["crank-pin"],
        probe: { kind: "trace", prompt: "Which part rides in a circle around the axle?", answer: "crank-pin" },
        narration: "The crank pin sits off-center, so it travels in a circle and carries the rod with it.",
      },
      {
        id: "b3",
        t: [12, 18],
        goal: "The rod swings and pushes the piston",
        becauseOf: ["rod"],
        probe: { kind: "trace", prompt: "Which part connects the pin to the piston?", answer: "rod" },
        narration: "The connecting rod stays pinned at both ends; it swings as it pushes and pulls.",
      },
      {
        id: "b4",
        t: [18, 24],
        goal: "The piston slides back and forth",
        becauseOf: ["piston"],
        probe: { kind: "trace", prompt: "Which part moves in a straight line?", answer: "piston" },
        narration: "Guided by the cylinder, the piston turns rotation into straight-line motion. Idealized: rigid parts, no friction.",
      },
    ],
    audio: { layers: ["ambience", "mech"] },
  };
}

/** Pendulum teaching scene. Pivot at (0, 3.6, 0); rod hangs along -y;
 * bob at the rod end. Swing comes from pendulumAngle in kinematics.ts.
 * Idealized: rigid rod, no friction, small-angle period. */
export function pendulumScene(question: string): SceneDsl {
  const p = PENDULUM_PARAMS;
  const pivotY = 3.6;
  const mat = (tint: string, metalness = 0.6, roughness = 0.4) => ({
    roughness,
    metalness,
    tint,
  });
  return {
    dslVersion: "0.1",
    concept: {
      question,
      medium: "3d",
      mediumWhy: "Implemented pendulum template with an exact pivot and solved swing angle.",
      verification: "sketch",
      template: "pendulum",
      templateParams: { length: p.length, amplitude: p.amplitude, period: p.period },
    },
    theme: { motif: "pendulum bench model", palette: "okabe-ito", keyAzimuth: 135 },
    nodes: [
      {
        id: "base",
        type: "box",
        parent: null,
        transform: { p: [0, 0.2, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#5b5344", 0.2, 0.7),
        label: "stand base",
        geometry: { args: [3.4, 0.4, 1.4] },
      },
      {
        id: "post",
        type: "box",
        parent: null,
        transform: { p: [-1.3, 1.95, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#5b5344", 0.2, 0.7),
        label: "stand post",
        geometry: { args: [0.35, 3.5, 0.8] },
      },
      {
        id: "arm",
        type: "box",
        parent: null,
        transform: { p: [-0.55, 3.7, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#5b5344", 0.2, 0.7),
        label: "top arm",
        geometry: { args: [1.9, 0.3, 0.8] },
      },
      {
        id: "pivot",
        type: "cylinder",
        parent: null,
        transform: { p: [0, pivotY, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1] },
        material: mat("#c9a227", 0.85, 0.3),
        label: "pivot axle",
        geometry: { args: [0.12, 0.12, 0.7, 16] },
      },
      {
        id: "rod",
        type: "box",
        parent: null,
        transform: { p: [0, pivotY - p.length / 2, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#8a6d1f", 0.8, 0.3),
        label: "pendulum rod",
        geometry: { args: [0.09, p.length, 0.09] },
      },
      {
        id: "bob",
        type: "sphere",
        parent: null,
        transform: { p: [0, pivotY - p.length, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: mat("#b03a2e", 0.7, 0.3),
        label: "pendulum bob",
        geometry: { args: [0.42, 32, 32] },
      },
    ],
    joints: [
      {
        id: "j-rod",
        type: "hinge",
        a: "post",
        b: "rod",
        anchor: [0, pivotY, 0],
        axis: [0, 0, 1],
        range: [-32, 32],
        driver: { kind: "time", rpm: 12 },
      },
      {
        id: "j-bob",
        type: "hinge",
        a: "rod",
        b: "bob",
        anchor: [0, pivotY, 0],
        axis: [0, 0, 1],
        range: [-32, 32],
        driver: { kind: "time", rpm: 12 },
      },
    ],
    groups: [
      { id: "g-stand", label: "stand", members: ["base", "post", "arm"] },
      { id: "g-swing", label: "swing arm", members: ["rod", "bob", "pivot"] },
    ],
    edges: [
      { from: "arm", to: "pivot", rel: "holds" },
      { from: "pivot", to: "rod", rel: "carries" },
      { from: "rod", to: "bob", rel: "carries" },
    ],
    flows: [],
    camera: { axisOfAction: [0, 0, 1], shots: [] },
    beats: [
      {
        id: "b1",
        t: [0, 6],
        goal: "The bob swings from its highest point",
        becauseOf: ["bob"],
        probe: { kind: "trace", prompt: "Which part swings lowest through the middle?", answer: "bob" },
        narration: "Released from one side, the bob falls through the bottom of the arc and climbs the other side.",
      },
      {
        id: "b2",
        t: [6, 12],
        goal: "The rod pivots on a fixed axle",
        becauseOf: ["rod"],
        probe: { kind: "trace", prompt: "Which part rotates about the fixed axle?", answer: "rod" },
        narration: "The rod turns about the pivot axle; the axle itself never moves.",
      },
      {
        id: "b3",
        t: [12, 18],
        goal: "One full swing takes a steady period",
        becauseOf: ["pivot"],
        probe: { kind: "trace", prompt: "What stays fixed while everything swings?", answer: "pivot" },
        narration: `Each full swing takes about ${p.period.toFixed(1)} seconds, set by the rod length alone. Idealized: no friction, so the swing never decays.`,
      },
      {
        id: "b4",
        t: [18, 24],
        goal: "Speed peaks at the bottom",
        becauseOf: ["bob"],
        probe: { kind: "trace", prompt: "Where is the bob moving fastest?", answer: "bob" },
        narration: "The bob is fastest at the bottom of the arc and momentarily still at each end.",
      },
    ],
    audio: { layers: ["ambience", "mech"] },
  };
}
