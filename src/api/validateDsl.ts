import type { SceneDsl } from '../types';

const PRIMITIVES = new Set(['box', 'cylinder', 'tube', 'plane']);
const JOINTS = new Set(['hinge', 'slider', 'gear']);
const MEDIUMS = new Set(['3d', '2d', 'hybrid']);

export function validateSceneDsl(data: unknown): SceneDsl {
  if (!data || typeof data !== 'object') throw new Error('E_DSL_NOT_OBJECT: scene must be an object');
  const d = data as Record<string, unknown>;
  if (d.dslVersion !== '0.1') throw new Error('E_DSL_VERSION: dslVersion must be "0.1"');
  if (!d.concept || typeof d.concept !== 'object') throw new Error('E_CONCEPT_MISSING: concept is required');
  const concept = d.concept as Record<string, unknown>;
  if (typeof concept.question !== 'string' || !concept.question) throw new Error('E_CONCEPT_QUESTION: concept.question must be a non-empty string');
  if (!MEDIUMS.has(concept.medium as string)) throw new Error('E_MEDIUM_UNKNOWN: concept.medium must be 3d|2d|hybrid');
  if (!Array.isArray(d.nodes)) throw new Error('E_NODES_MISSING: nodes[] is required');
  if (!Array.isArray(d.joints)) throw new Error('E_JOINTS_MISSING: joints[] is required');
  if (!Array.isArray(d.beats)) throw new Error('E_BEATS_MISSING: beats[] is required');
  if ((d.nodes as unknown[]).length === 0) throw new Error('E_NODES_EMPTY: nodes[] must not be empty');

  const nodeIds = new Set<string>();
  for (const n of d.nodes as Record<string, unknown>[]) {
    if (typeof n.id !== 'string' || !n.id) throw new Error('E_NODE_ID: every node needs a string id');
    if (nodeIds.has(n.id)) throw new Error(`E_NODE_DUP: duplicate node id "${n.id}"`);
    nodeIds.add(n.id);
    if (!PRIMITIVES.has(n.type as string)) throw new Error(`E_NODE_TYPE: unknown primitive "${String(n.type)}" on node "${n.id}"`);
  }

  for (const j of d.joints as Record<string, unknown>[]) {
    if (!JOINTS.has(j.type as string)) throw new Error(`E_JOINT_TYPE: unknown joint "${String(j.type)}"`);
    if (typeof j.a !== 'string' || !nodeIds.has(j.a)) throw new Error(`E_JOINT_REF: joint "${String(j.id)}" references unknown node "${String(j.a)}"`);
    if (typeof j.b !== 'string' || !nodeIds.has(j.b)) throw new Error(`E_JOINT_REF: joint "${String(j.id)}" references unknown node "${String(j.b)}"`);
  }

  for (const b of d.beats as Record<string, unknown>[]) {
    if (typeof b.id !== 'string' || !b.id) throw new Error('E_BEAT_ID: every beat needs a string id');
    const refs = b.becauseOf as unknown;
    if (!Array.isArray(refs) || refs.length === 0) throw new Error(`E_BEAT_CAUSE: beat "${b.id}" needs non-empty becauseOf[]`);
    for (const r of refs) {
      if (typeof r !== 'string' || !nodeIds.has(r)) throw new Error(`E_ORPHAN_BEAT: beat "${b.id}" references unknown node "${String(r)}"`);
    }
    const probe = b.probe as Record<string, unknown> | undefined;
    if (!probe || typeof probe.prompt !== 'string' || typeof probe.answer !== 'string') {
      throw new Error(`E_BEAT_PROBE: beat "${b.id}" needs probe{prompt,answer}`);
    }
  }

  // Medium lint: flat uniform boxes with no joints carry no spatial information — reject 3d.
  const medium = (concept.medium as string) || '3d';
  if (medium === '3d') {
    const nodes = d.nodes as Record<string, unknown>[];
    const joints = d.joints as unknown[];
    const anyNonUniform = nodes.some((n) => {
      const t = n.transform as { s?: unknown } | undefined;
      const s = (t?.s ?? null) as unknown;
      return (
        Array.isArray(s) &&
        typeof s[0] === 'number' &&
        typeof s[1] === 'number' &&
        typeof s[2] === 'number' &&
        (s[0] !== s[1] || s[1] !== s[2])
      );
    });
    if (!anyNonUniform && joints.length === 0) {
      throw new Error('E_MEDIUM_MISMATCH: 3d rejected for flat uniform nodes with no joints; use 2d');
    }
  }

  return data as SceneDsl;
}
