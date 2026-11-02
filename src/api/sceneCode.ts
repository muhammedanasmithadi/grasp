// src/api/sceneCode.ts
// Constrained builder-code format for scenes. The model emits calls against
// a fixed function list; we parse with our own grammar (no eval) and execute
// them into a SceneDsl, which then goes through validateSceneDsl as usual.
//
// Grammar (one statement per line, `#` comments and blank lines ignored):
//   box | cylinder | sphere | cone | torus | torusKnot | tetrahedron |
//   octahedron | dodecahedron | icosahedron | capsule | circle | ring |
//   tube | plane | model | points  (each called as name({...}))
//   hinge({...}) | slider({...}) | gear({...})
//   beat({...}) | concept({...}) | theme({...}) | camera({...})
//   for NAME in range(A, B) {
//     ... nested statements ...
//   }
// Args are strict JSON objects. Inside a loop, "$NAME" in any string is
// replaced by the index, and {"$NAME": [base, step]} in any numeric slot
// becomes base + index * step.
//
// Anything else fails with a named E_CODE_* error. Never faked.

import { Effect } from "effect";
import type { SceneDsl } from "../types";
import { SceneCodeError, type ValidationError } from "./errors";
import { validateSceneDsl } from "./validateDsl";

type Stmt =
  | { kind: "call"; fn: string; arg: unknown; line: number }
  | { kind: "for"; varName: string; from: number; to: number; body: Stmt[]; line: number };

const NODE_CALLS = new Set([
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

const CALL_NAMES = new Set([
  "concept",
  "theme",
  ...NODE_CALLS,
  "hinge",
  "slider",
  "gear",
  "beat",
  "camera",
]);

const FOR_RE = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+range\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*\{\s*$/;
const CALL_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

const fail = (
  message: string
): Effect.Effect<never, SceneCodeError> =>
  Effect.fail(new SceneCodeError({ message }));

function parseBlock(
  lines: string[],
  start: number,
  inBrace: boolean
): Effect.Effect<{ stmts: Stmt[]; next: number }, SceneCodeError> {
  return Effect.gen(function* () {
    const stmts: Stmt[] = [];
    let i = start;
    while (i < lines.length) {
      const raw = lines[i];
      const line = raw.trim();
      const lineNo = i + 1;
      if (line === "" || line.startsWith("#")) {
        i++;
        continue;
      }
      if (line === "}") {
        if (!inBrace) {
          return yield* fail(
            `E_CODE_SYNTAX: stray closing brace on line ${lineNo}`
          );
        }
        return { stmts, next: i + 1 };
      }
      const forMatch = FOR_RE.exec(line);
      if (forMatch) {
        const [, varName, fromS, toS] = forMatch;
        const from = parseInt(fromS, 10);
        const to = parseInt(toS, 10);
        if (to - from > 500) {
          return yield* fail(
            `E_CODE_RANGE: range too large on line ${lineNo} (max 500 iterations)`
          );
        }
        const inner = yield* parseBlock(lines, i + 1, true);
        stmts.push({
          kind: "for",
          varName,
          from,
          to,
          body: inner.stmts,
          line: lineNo,
        });
        i = inner.next;
        continue;
      }
      const callMatch = CALL_RE.exec(line);
      if (callMatch) {
        const fn = callMatch[1];
        if (!CALL_NAMES.has(fn)) {
          return yield* fail(
            `E_CODE_UNKNOWN_FN: unknown function "${fn}" on line ${lineNo}`
          );
        }
        // Gather text from the opening paren until parens balance (string-aware).
        const text = lines.slice(i).join("\n");
        const openIdx = text.indexOf("(");
        let depth = 0;
        let inStr = false;
        let esc = false;
        let end = -1;
        for (let k = openIdx; k < text.length; k++) {
          const ch = text[k];
          if (inStr) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === '"') inStr = false;
            continue;
          }
          if (ch === '"') inStr = true;
          else if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              end = k;
              break;
            }
          }
        }
        if (end === -1) {
          return yield* fail(
            `E_CODE_SYNTAX: unbalanced call starting on line ${lineNo}`
          );
        }
        const argText = text.slice(openIdx + 1, end).trim();
        let arg: unknown;
        try {
          arg = JSON.parse(argText.length === 0 ? "null" : argText);
        } catch {
          return yield* fail(
            `E_CODE_BAD_ARG: argument is not valid JSON on line ${lineNo}`
          );
        }
        // Advance i past all lines consumed by this call.
        const consumed = text.slice(0, end + 1).split("\n").length;
        stmts.push({ kind: "call", fn, arg, line: lineNo });
        i += consumed;
        continue;
      }
      return yield* fail(
        `E_CODE_SYNTAX: cannot parse line ${lineNo}: "${line.slice(0, 60)}"`
      );
    }
    if (inBrace) {
      return yield* fail('E_CODE_SYNTAX: unclosed "{" block at end of input');
    }
    return { stmts, next: i };
  });
}

function substitute(
  value: unknown,
  scope: Record<string, number>
): Effect.Effect<unknown, SceneCodeError> {
  return Effect.gen(function* () {
    if (typeof value === "string") {
      let out = value;
      for (const [name, idx] of Object.entries(scope)) {
        out = out.split(`$${name}`).join(String(idx));
      }
      const leftover = out.match(/\$[A-Za-z_][A-Za-z0-9_]*/);
      if (leftover) {
        return yield* fail(
          `E_CODE_UNKNOWN_VAR: unknown variable "${leftover[0]}"`
        );
      }
      return out;
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return yield* Effect.forEach(value, (v) => substitute(v, scope));
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 1 && keys[0].startsWith("$")) {
        const varName = keys[0].slice(1);
        if (!(varName in scope)) {
          return yield* fail(
            `E_CODE_UNKNOWN_VAR: unknown variable "${keys[0]}"`
          );
        }
        const spec = obj[keys[0]];
        if (
          !Array.isArray(spec) ||
          spec.length !== 2 ||
          typeof spec[0] !== "number" ||
          typeof spec[1] !== "number"
        ) {
          return yield* fail(
            'E_CODE_BAD_ARG: {"$var": [base, step]} needs two numbers'
          );
        }
        return spec[0] + scope[varName] * spec[1];
      }
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        out[k] = yield* substitute(obj[k], scope);
      }
      return out;
    }
    return yield* fail("E_CODE_BAD_ARG: unsupported argument value");
  });
}

interface Builder {
  concept?: Record<string, unknown>;
  theme?: Record<string, unknown>;
  nodes: Record<string, unknown>[];
  joints: Record<string, unknown>[];
  beats: Record<string, unknown>[];
  camera?: Record<string, unknown>;
}

const DEFAULT_TRANSFORM = { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] };
const DEFAULT_MATERIAL = { roughness: 0.5, metalness: 0.6, tint: "#E69F00" };

const STAGE_LIMIT = 60;
const PART_LIMIT = 16;

// Clamp absurd extents into the stage so one giant slab cannot swallow the
// scene. Defensive rendering, not validation: the model output still parses.
function clampNum(v: unknown, fallback: number, limit = STAGE_LIMIT): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(-limit, Math.min(limit, n));
}

function sanitizeNode(
  a: Record<string, unknown>,
  fn: string
): Record<string, unknown> {
  const t =
    a.transform && typeof a.transform === "object"
      ? (a.transform as Record<string, unknown>)
      : {};
  const p = Array.isArray(t.p) ? t.p : [0, 0, 0];
  const s = Array.isArray(t.s) ? t.s : [1, 1, 1];
  const g =
    a.geometry && typeof a.geometry === "object"
      ? (a.geometry as Record<string, unknown>)
      : undefined;
  const args = Array.isArray(g?.args)
    ? (g.args as unknown[]).map((v) => clampNum(v, 1, PART_LIMIT))
    : undefined;
  return {
    ...a,
    type: fn,
    parent: a.parent ?? null,
    transform: {
      p: [clampNum(p[0], 0), clampNum(p[1], 0), clampNum(p[2], 0)],
      r: Array.isArray(t.r) ? t.r : [0, 0, 0],
      s: [clampNum(s[0], 1, 8), clampNum(s[1], 1, 8), clampNum(s[2], 1, 8)],
    },
    material: a.material ?? DEFAULT_MATERIAL,
    ...(g ? { geometry: { ...g, ...(args ? { args } : {}) } } : {}),
  };
}

function execCall(
  builder: Builder,
  fn: string,
  arg: unknown,
  line: number
): Effect.Effect<void, SceneCodeError> {
  return Effect.gen(function* () {
    if (typeof arg !== "object" || arg === null || Array.isArray(arg)) {
      return yield* fail(
        `E_CODE_BAD_ARG: ${fn} expects a JSON object on line ${line}`
      );
    }
    const a = arg as Record<string, unknown>;
    switch (fn) {
      case "concept":
        builder.concept = a;
        break;
      case "theme":
        builder.theme = a;
        break;
      case "box":
      case "cylinder":
      case "sphere":
      case "cone":
      case "torus":
      case "torusKnot":
      case "tetrahedron":
      case "octahedron":
      case "dodecahedron":
      case "icosahedron":
      case "capsule":
      case "circle":
      case "ring":
      case "tube":
      case "plane":
      case "model":
      case "points":
        builder.nodes.push(sanitizeNode(a, fn));
        break;
      case "hinge":
      case "slider":
      case "gear":
        builder.joints.push({
          anchor: a.anchor ?? [0, 0, 0],
          axis: a.axis ?? [0, 0, 1],
          range: a.range ?? [0, 360],
          driver: a.driver ?? { kind: "time", rpm: 30 },
          ...a,
          type: fn,
        });
        break;
      case "beat":
        builder.beats.push(a);
        break;
      case "camera":
        builder.camera = a;
        break;
      default:
        return yield* fail(
          `E_CODE_UNKNOWN_FN: unknown function "${fn}" on line ${line}`
        );
    }
  });
}

function execStmts(
  builder: Builder,
  stmts: Stmt[],
  scope: Record<string, number>
): Effect.Effect<void, SceneCodeError> {
  return Effect.gen(function* () {
    for (const s of stmts) {
      if (s.kind === "for") {
        for (let i = s.from; i < s.to; i++) {
          yield* execStmts(builder, s.body, { ...scope, [s.varName]: i });
        }
      } else {
        const arg = yield* substitute(s.arg, scope);
        yield* execCall(builder, s.fn, arg, s.line);
      }
    }
  });
}

export function parseSceneCode(
  text: string
): Effect.Effect<SceneDsl, SceneCodeError | ValidationError> {
  return Effect.gen(function* () {
    const t = (text ?? "").trim();
    if (!t) {
      return yield* fail("E_EMPTY_INPUT: scene response has no text content");
    }
    if (t.startsWith("{") || t.startsWith("```")) {
      return yield* fail(
        "E_CODE_NOT_CODE: expected builder calls, got raw JSON"
      );
    }
    const { stmts } = yield* parseBlock(
      t.split("\n").map((l) => (l.trimStart().startsWith("#") ? "" : l)),
      0,
      false
    );
    if (stmts.length === 0) {
      return yield* fail("E_CODE_EMPTY: no statements found");
    }
    const builder: Builder = { nodes: [], joints: [], beats: [] };
    yield* execStmts(builder, stmts, {});
    if (!builder.concept) {
      return yield* fail(
        "E_CODE_MISSING: scene needs one concept({...}) call"
      );
    }
    if (builder.nodes.length === 0) {
      return yield* fail(
        "E_CODE_MISSING: scene needs at least one node call"
      );
    }
    if (builder.beats.length === 0) {
      return yield* fail(
        "E_CODE_MISSING: scene needs at least one beat({...}) call"
      );
    }
    const dsl = {
      dslVersion: "0.1",
      concept: builder.concept,
      theme: builder.theme ?? {
        motif: "blueprint",
        palette: "okabe-ito",
        keyAzimuth: 135,
      },
      nodes: builder.nodes,
      joints: builder.joints,
      flows: [],
      camera: builder.camera ?? { axisOfAction: [0, 1, 0], shots: [] },
      beats: builder.beats,
      audio: { layers: ["ambience", "mech"] },
    };
    return yield* validateSceneDsl(dsl);
  });
}
