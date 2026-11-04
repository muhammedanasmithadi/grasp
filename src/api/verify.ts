import type { SceneDsl } from '../types';

export type Badge = 'interactive' | 'illustrative';

export interface Verification {
  badge: Badge;
  detail: string;
}

/**
 * Honest verification gate. There is no solver here: no code in this
 * repository checks rendered motion against a physical model for
 * arbitrary scenes, so nothing may claim to be solver-verified.
 *
 * - "interactive" is awarded only to code-owned mechanism templates
 *   (concept.template set by routing code, never by the model), whose
 *   motion functions are unit-tested in kinematics.ts.
 * - Everything else is "illustrative": a schematic that may be useful
 *   for learning but has not been mechanically validated.
 *
 * Model-generated verification claims are stripped in sceneCode.ts and
 * can never reach this function.
 */
export function verifyScene(dsl: SceneDsl): Verification {
  if (dsl.concept.template === 'crank-slider') {
    return {
      badge: 'interactive',
      detail: 'Implemented crank-slider template; idealized kinematics (rigid parts, no friction), motion functions unit-tested.',
    };
  }
  if (dsl.concept.template === 'pendulum') {
    return {
      badge: 'interactive',
      detail: 'Implemented pendulum template; idealized small-angle kinematics (no friction), motion functions unit-tested.',
    };
  }
  return {
    badge: 'illustrative',
    detail: 'Illustrative schematic; parts and motion are model-proposed and have not been mechanically validated.',
  };
}
