// src/api/parser.ts
// Adapts a validated SceneDsl to the UI-facing SceneData.
// Parsing lives in sceneCode.ts (builder code) and validateDsl.ts (schema).
// Anything unparsable is refused with a named E_ error. Never faked.

import type { SceneData, SceneDsl } from "../types";
import { layoutScene } from "./layout";

export function adaptDslToScene(input: SceneDsl): SceneData {
  // Code owns the stage: re-seat every part in causal order before
  // the UI ever sees it. Model positions are hints, not placements.
  const dsl = layoutScene(input);
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
    causalSpine: beats.map((b, i) => ({
      part: b.part,
      action: i < beats.length - 1 ? "drives" : "completes",
      nextPart: beats[i + 1]?.part ?? "end",
    })),
    dsl,
  };
}
