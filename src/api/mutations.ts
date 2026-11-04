import type { SceneDsl, SceneMutation } from '../types';

export type MutationKind = SceneMutation['kind'];
export type MutationProbe = SceneMutation['probe'];
export type Mutation = SceneMutation;

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function otherNodeId(dsl: SceneDsl, exclude: string[], seed: number): string | null {
  const candidates = dsl.nodes.map((n) => n.id).filter((id) => !exclude.includes(id));
  if (candidates.length === 0) return null;
  return candidates[seed % candidates.length];
}

/**
 * Deterministic mutation builder. No model calls. Only two kinds, both
 * honestly rendered: edge_inversion (the true driver is hidden on the
 * drill beat while a wrong part is spotlighted) and node_deletion (a
 * part is missing). Timing/gear faults are not offered: the renderer
 * does not implement phase or ratio changes, so claiming them would
 * be a lie. shiftedJointIds is always empty and unused by the UI.
 */
export function createMutation(dsl: SceneDsl, seedStr?: string): Mutation | null {
  const seed = hashSeed(seedStr ?? dsl.concept.question);
  const beats = dsl.beats;
  if (!beats || beats.length === 0) return null;

  // 1. Edge inversion: rewrite one beat's becauseOf target.
  const beatIdx = seed % beats.length;
  const beatOrder = [beats[beatIdx], ...beats.slice(0, beatIdx), ...beats.slice(beatIdx + 1)];
  for (const b of beatOrder) {
    if (!b.becauseOf || b.becauseOf.length === 0) continue;
    const original = b.becauseOf[0];
    const wrong = otherNodeId(dsl, b.becauseOf, seed + b.id.length);
    if (!wrong) continue;
    const labelOf = (id: string): string =>
      dsl.nodes.find((n) => n.id === id)?.label ?? id;
    // Visible breakage: the true driver vanishes from the drill beat
    // while the wrong part glows as the claimed driver. The learner
    // sees a hole where the cause should be.
    return {
      mutationId: `mut_${(seed % 900) + 100}`,
      kind: 'edge_inversion',
      beatId: b.id,
      mutatedBecauseOf: { [b.id]: [wrong, ...b.becauseOf.slice(1)] },
      hiddenNodeIds: [original],
      shiftedJointIds: [],
      probe: {
        prompt: `This step claims ${labelOf(wrong)} drives it, but a part is missing from the scene. Which missing part is the true driver?`,
        answer: original,
      },
      repair: { control: `hotspot:${b.id}`, expected: original },
    };
  }

  // 2. Node deletion: remove a non-critical node and its joints.
  if (dsl.nodes.length > 1) {
    const victim = dsl.nodes[seed % dsl.nodes.length];
    const stillReferenced = dsl.beats.some((b) => b.becauseOf.length > 1 && b.becauseOf.includes(victim.id));
    const removedId = stillReferenced
      ? dsl.nodes[(seed + 1) % dsl.nodes.length].id
      : victim.id;
    return {
      mutationId: `mut_${(seed % 900) + 100}`,
      kind: 'node_deletion',
      beatId: dsl.beats[seed % dsl.beats.length].id,
      mutatedBecauseOf: {},
      hiddenNodeIds: [removedId],
      shiftedJointIds: [],
      probe: { prompt: 'A part is missing from the scene. Which one?', answer: removedId },
      repair: { control: 'hotspot:missing', expected: removedId },
    };
  }

  return null;
}
