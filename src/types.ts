export interface Beat {
  id: string;
  title: string;
  goal: string;
  narration: string;
  part: string;
}

export interface CausalSpineLink {
  part: string;
  action: string;
  nextPart: string;
}

export interface SceneData {
  title: string;
  beats: Beat[];
  sabotageBeat: string | { id: string } | number;
  causalSpine: CausalSpineLink[];
  dsl?: SceneDsl;
}

export interface Concept {
  title: string;
  id: string;
  query: string;
}

// --- Scene DSL v0 (strict, flat) ---

export type Vec3 = [number, number, number];

export type PrimitiveType = 'box' | 'cylinder' | 'tube' | 'plane';

export type JointType = 'hinge' | 'slider' | 'gear';

export interface DslTransform {
  p: Vec3;
  r: Vec3;
  s: Vec3;
}

export interface DslMaterial {
  roughness: number;
  metalness: number;
  tint: string;
}

export interface DslNode {
  id: string;
  type: PrimitiveType;
  parent: string | null;
  anchor?: Vec3;
  transform: DslTransform;
  material: DslMaterial;
  label: string;
}

export interface DslDriver {
  kind: 'time';
  rpm: number;
}

export interface DslJoint {
  id: string;
  type: JointType;
  a: string;
  b: string;
  anchor: Vec3;
  axis: Vec3;
  range: [number, number];
  driver: DslDriver;
}

export interface DslBeatProbe {
  kind: 'trace';
  prompt: string;
  answer: string;
}

export interface DslBeat {
  id: string;
  t: [number, number];
  goal: string;
  becauseOf: string[];
  probe: DslBeatProbe;
  narration: string;
}

export interface DslCameraShot {
  t: number;
  size: 'wide' | 'medium' | 'close' | 'detail';
  target: string;
  move: 'orbit-in' | 'none';
}

export interface DslCamera {
  axisOfAction: Vec3;
  shots: DslCameraShot[];
}

export interface DslConcept {
  question: string;
  medium: '3d' | '2d' | 'hybrid';
  mediumWhy: string;
  verification: 'solver' | 'sourced' | 'sketch';
}

export interface DslTheme {
  motif: string;
  palette: 'okabe-ito';
  keyAzimuth: number;
}

export interface SceneDsl {
  dslVersion: '0.1';
  concept: DslConcept;
  theme: DslTheme;
  nodes: DslNode[];
  joints: DslJoint[];
  flows: unknown[];
  camera: DslCamera;
  beats: DslBeat[];
  audio: { layers: string[] };
}

export interface MutationProbe {
  prompt: string;
  answer: string;
}

export interface SceneMutation {
  mutationId: string;
  kind: 'edge_inversion' | 'phase_offset' | 'ratio_reversal' | 'node_deletion';
  beatId: string;
  mutatedBecauseOf: Record<string, string[]>;
  hiddenNodeIds: string[];
  shiftedJointIds: string[];
  probe: MutationProbe;
  repair: { control: string; expected: string };
}

export interface AppState {
  screen: 'ask' | 'scene';
  query: string;
  concept: Concept | null;
  sceneData: SceneData | null;
  currentBeat: number;
  sabotageMode: boolean;
  showMastery: boolean;
  masteryDelta: number | null;
  loading: boolean;
  apiError: string | null;
  mutation: SceneMutation | null;
  mutatedBecauseOf: Record<string, string[]>;
  hiddenNodeIds: string[];
  repairStatus: 'idle' | 'correct' | 'wrong';
}

export type AppAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'ASK_START' }
  | { type: 'ASK_SUCCESS'; payload: SceneData }
  | { type: 'ASK_FAILURE'; payload: string }
  | { type: 'NEXT_BEAT' }
  | { type: 'SET_BEAT'; payload: number }
  | { type: 'FINISH' }
  | { type: 'TOGGLE_SABOTAGE' }
  | { type: 'INTRODUCE_FAULT' }
  | { type: 'REPAIR_ATTEMPT'; payload: { nodeId: string } }
  | { type: 'RESOLVE_FAULT' }
  | { type: 'RESET' };
