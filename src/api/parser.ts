// src/api/parser.ts
// Adapts a validated SceneDsl to the UI-facing SceneData.
// Parsing lives in sceneCode.ts (builder code) and validateDsl.ts (schema).
// Anything unparsable is refused with a named E_ error. Never faked.

import type { Representation, SceneData, SceneDsl } from "../types";
import { layoutScene } from "./layout";
import { validateReferences } from "./validateDsl";

export function representationOf(dsl: SceneDsl): Representation {
  if (dsl.concept.template) return "template-3d";
  if (dsl.concept.medium === "2d") return "diagram-2d";
  if (dsl.concept.medium === "hybrid") return "illustrative-2d";
  return "illustrative-3d";
}

export function adaptDslToScene(input: SceneDsl): SceneData {
  // No keyword hero injection: stock assets enter a scene only when
  // the model explicitly authored a model node for a part (hero.ts is
  // retained for explicit future use, not automatic insertion).
  // Layout re-seats illustrative scenes; template scenes pass through.
  const dsl = layoutScene(input);
  // References are re-validated after every transform. A broken scene
  // is rejected loudly instead of rendering with dangling references.
  const refError = validateReferences(dsl);
  if (refError) {
    throw new Error(refError);
  }
  const labelOf = (id: string): string => {
    const n = dsl.nodes.find((x) => x.id === id);
    return n ? n.label : id;
  };
  const beats = dsl.beats.map((b, i) => ({
    id: String(b.id ?? `b${i + 1}`),
    title: String(b.goal ?? `Beat ${i + 1}`),
    goal: String(b.goal ?? ""),
    narration: String(b.narration ?? ""),
    part: labelOf(b.becauseOf[0] ?? dsl.nodes[0]?.id ?? `part-${i}`),
  }));
  return {
    title: dsl.concept.question,
    beats,
    sabotageBeat: "",
    // Teaching order, honestly labelled. Causality lives in dsl.edges
    // and is drawn from those explicit relationships only.
    causalSpine: beats.map((b, i) => ({
      part: b.part,
      action: i < beats.length - 1 ? "then" : "ends",
      nextPart: beats[i + 1]?.part ?? "end",
    })),
    dsl,
    representation: representationOf(dsl),
  };
}
