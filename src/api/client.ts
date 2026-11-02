import { parseSceneCode } from './sceneCode';
import { adaptDslToScene } from './parser';
import type { SceneData } from '../types';

const API_BASE = (import.meta as unknown as Record<string, { VITE_META_API_BASE?: string; VITE_META_API_KEY?: string }>).env?.VITE_META_API_BASE || 'https://api.meta.ai/v1';
const API_KEY = (import.meta as unknown as Record<string, { VITE_META_API_BASE?: string; VITE_META_API_KEY?: string }>).env?.VITE_META_API_KEY || '';

export class MetaModelAPI {
  constructor() {
    if (!API_KEY) {
      console.warn('[MetaModelAPI] No VITE_META_API_KEY set — API calls will fail');
    }
  }

  async generateScene(concept: string): Promise<SceneData> {
    if (!API_KEY) {
      throw new Error('E_NO_API_KEY: no API key configured; set VITE_META_API_KEY in .env');
    }

    const lastError: string[] = [];
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: 'muse-spark-1.3',
            messages: [
              {
                role: 'system',
                content: `You generate a 3D teaching scene by writing calls to a fixed builder API. Infer the mechanism from the user prompt. Output ONLY code, one call per line. No prose. No markdown. No JSON.

Available calls (args are strict JSON objects):
concept({"question":"...","medium":"3d|2d|hybrid","mediumWhy":"...","verification":"solver|sketch"})
theme({"motif":"...","palette":"okabe-ito","keyAzimuth":135})
box|cylinder|tube|plane({"id":"...","parent":null,"transform":{"p":[0,0,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#E69F00"},"label":"..."})
hinge|slider|gear({"id":"...","a":"node-id","b":"node-id","anchor":[0,0,0],"axis":[0,0,1],"range":[0,360],"driver":{"kind":"time","rpm":30}})
beat({"id":"...","t":[0,6],"goal":"...","becauseOf":["node-id"],"probe":{"kind":"trace","prompt":"...","answer":"node-id"},"narration":"..."})
camera({"axisOfAction":[0,1,0],"shots":[{"t":0,"size":"wide","target":"node-id","move":"orbit-in"}]})

Loops for repeated parts:
for i in range(0, 12) {
box({"id":"bar-$i","parent":null,"transform":{"p":[{"$i":[-8,1.5]},-0.3,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.1,"tint":"#0072B2"},"label":"bar"})
}

Rules: "$i" in a string becomes the index. {"$i":[base,step]} in a numeric slot becomes base+i*step. Every becauseOf references an existing node id. Every beat has exactly one probe whose answer is a node id. Use 3-8 beats. Vary primitives: cylinders for shafts, pistons, rods, wheels and bars; boxes for housings and blocks; planes for ground or backdrops; tubes for pipes and coils. Never use boxes for everything. Set verification honestly: "solver" only if motion matches a closed-form formula, else "sketch". Never claim "sourced". Output ONLY the code.`,
              },
              {
                role: 'user',
                content: concept,
              },
            ],
            temperature: 0.0,
            max_tokens: 50000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`E_API_HTTP: API error (${response.status}): ${errorText.slice(0, 200)}`);
        }

        const data = await response.json();

        if (data.choices?.[0]?.finish_reason === 'length') {
          throw new Error('E_TRUNCATED: model hit the token ceiling mid-response; simplify the concept or shorten the prompt');
        }

        let content: string;
        if (data.choices && data.choices[0] && data.choices[0].message) {
          content = data.choices[0].message.content ?? '';
        } else if (typeof data === 'string') {
          content = data;
        } else {
          content = JSON.stringify(data);
        }

        if (!content) {
          throw new Error('E_EMPTY_RESPONSE: empty response from API');
        }

        console.log('[MetaModelAPI] raw content:', content?.slice(0, 500));

        const dsl = parseSceneCode(content);
        return adaptDslToScene(dsl);
      } catch (err) {
        // Truncation is deterministic for a fixed prompt: retrying wastes
        // credits, so fail fast instead of burning all three attempts.
        if ((err as Error).message.startsWith('E_TRUNCATED')) throw err;
        lastError.push(`Attempt ${attempt}: ${(err as Error).message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(`E_API_RETRIES_EXCEEDED: API failed after ${maxRetries} attempts: ${lastError.join(' | ')}`);
  }
}

export const metaModelAPI = new MetaModelAPI();
