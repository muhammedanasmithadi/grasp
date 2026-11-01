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
}

export interface Concept {
  title: string;
  id: string;
  query: string;
}

export interface AppState {
  screen: 'ask' | 'scene';
  query: string;
  concept: Concept | null;
  sceneData: SceneData | null;
  currentBeat: number;
  rpm: number;
  gravity: number;
  sabotageMode: boolean;
  showMastery: boolean;
  masteryDelta: number | null;
  loading: boolean;
  apiError: string | null;
}

export type AppAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'ASK_START' }
  | { type: 'ASK_SUCCESS'; payload: SceneData }
  | { type: 'ASK_FAILURE'; payload: string }
  | { type: 'NEXT_BEAT' }
  | { type: 'FINISH' }
  | { type: 'SET_RPM'; payload: number }
  | { type: 'SET_GRAVITY'; payload: number }
  | { type: 'TOGGLE_SABOTAGE' }
  | { type: 'RESET' };
