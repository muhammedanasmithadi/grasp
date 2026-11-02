// src/api/parser.ts
// Extracts and validates JSON from the Meta Model API response.
// The model may return natural language with embedded JSON, or JSON with
// different field names. We try multiple strategies to find valid scene data.

import type { SceneData, SceneDsl } from "../types";
import { validateSceneDsl } from "./validateDsl";

export function findSceneJSON(text: string): string {
  if (!text || typeof text !== "string") {
    throw new Error("E_EMPTY_INPUT: scene response has no text content");
  }

  // Strategy 1: Try the entire text as JSON
  try {
    const parsed = JSON.parse(text.trim());
    if (isValidScene(parsed)) {
      return text.trim();
    }
  } catch {}

  // Strategy 2: JSON inside markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (isValidScene(parsed)) {
        return codeBlockMatch[1].trim();
      }
    } catch {}
  }

  // Strategy 3: Scan all { } objects, return any that looks like a scene
  const bracePositions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") bracePositions.push(i);
  }

  for (const openIdx of bracePositions) {
    let depth = 0;
    for (let j = openIdx; j < text.length; j++) {
      if (text[j] === "{") depth++;
      if (text[j] === "}") {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(openIdx, j + 1).trim();
          try {
            const parsed = JSON.parse(candidate);
            if (isValidScene(parsed)) {
              return candidate;
            }
          } catch {}
          break;
        }
      }
    }
  }

  throw new Error("E_NO_SCENE_JSON: no valid scene JSON found in response");
}

function isValidScene(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const concept = d.concept as Record<string, unknown> | unknown;
  const hasTitle =
    typeof d.title === "string" ||
    typeof d.name === "string" ||
    typeof d.topic === "string" ||
    typeof d.concept === "string" ||
    (typeof concept === "object" &&
      concept !== null &&
      typeof (concept as Record<string, unknown>).question === "string") ||
    d.dslVersion === "0.1";
  const hasBeats =
    Array.isArray(d.beats) ||
    Array.isArray(d.main_components) ||
    Array.isArray(d.parts) ||
    Array.isArray(d.key_components) ||
    Array.isArray(d.components);
  return hasTitle && hasBeats;
}

function normalizeBeat(beat: Record<string, unknown>, index: number) {
  return {
    id: String(beat.id ?? `beat-${index}`),
    title: String(beat.title ?? beat.name ?? beat.topic ?? `Beat ${index + 1}`),
    goal: String(beat.goal ?? beat.title ?? beat.name ?? ""),
    narration: String(beat.narration ?? beat.description ?? beat.goal ?? ""),
    part: String(beat.part ?? beat.category ?? "Unknown"),
  };
}

function normalizeScene(data: Record<string, unknown>) {
  const beats = Array.isArray(data.beats)
    ? data.beats
    : Array.isArray(data.main_components)
      ? data.main_components.map((c, i) => ({
          id: `comp-${i}`,
          title: c,
          goal: "",
          narration: "",
          part: c,
        }))
      : Array.isArray(data.parts)
        ? data.parts.map((p, i) => ({
            id: `part-${i}`,
            title: p,
            goal: "",
            narration: "",
            part: p,
          }))
        : Array.isArray(data.key_components)
          ? data.key_components.map((c, i) => ({
              id: `comp-${i}`,
              title: c,
              goal: "",
              narration: "",
              part: c,
            }))
          : Array.isArray(data.components)
            ? data.components.map((c, i) => ({
                id: `comp-${i}`,
                title: c,
                goal: "",
                narration: "",
                part: c,
              }))
            : [];

  return {
    title: (data.title ??
      data.name ??
      data.topic ??
      data.concept ??
      "Concept Scene") as string,
    beats: beats.map(normalizeBeat),
    sabotageBeat:
      typeof data.sabotageBeat === "object" && data.sabotageBeat !== null
        ? (data.sabotageBeat as { id: string }).id
        : (data.sabotageBeat ??
          (beats.length > 0
            ? beats[Math.floor(beats.length / 2)].id
            : "beat-1")),
    causalSpine: Array.isArray(data.causalSpine)
      ? data.causalSpine.map((link: Record<string, unknown>, i) => ({
          part: (link.part ?? "") as string,
          action: (link.action ?? "drives") as string,
          nextPart: (link.nextPart ?? beats[i + 1]?.part ?? "end") as string,
        }))
      : beats.map((b, i) => ({
          part: b.part,
          action: i < beats.length - 1 ? "drives" : "completes",
          nextPart: beats[i + 1]?.part ?? "end",
        })),
  };
}

function validateScene(data: unknown): SceneData {
  if (!data || typeof data !== "object") {
    throw new Error("E_SCENE_NOT_OBJECT: scene response is not an object");
  }
  const d = data as Record<string, unknown>;
  if (!d.title && !d.name && !d.topic && !d.concept) {
    throw new Error("E_SCENE_NO_TITLE: scene response is missing title");
  }
  if (
    !Array.isArray(d.beats) &&
    !Array.isArray(d.main_components) &&
    !Array.isArray(d.parts) &&
    !Array.isArray(d.key_components) &&
    !Array.isArray(d.components)
  ) {
    throw new Error("E_SCENE_NO_BEATS: scene response is missing beats array");
  }

  return normalizeScene(d) as SceneData;
}

export function parseSceneResponse(text: string): SceneData {
  console.log("[MetaModelAPI] parseSceneResponse input:", text?.slice(0, 500));
  const jsonText = findSceneJSON(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`E_JSON_PARSE: ${(err as Error).message}`);
  }

  console.log(
    "[MetaModelAPI] parsed JSON:",
    JSON.stringify(parsed).slice(0, 500),
  );

  return validateScene(parsed);
}

export function parseStrictScene(text: string): SceneDsl {
  const jsonText = findSceneJSON(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`E_JSON_PARSE: ${(err as Error).message}`);
  }
  return validateSceneDsl(parsed);
}

export function adaptDslToScene(dsl: SceneDsl): SceneData {
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
