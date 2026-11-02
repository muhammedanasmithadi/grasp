import { parseStrictScene, adaptDslToScene } from './parser';
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
    // Output budget per attempt. muse-spark burns ~3k hidden reasoning
    // tokens before writing, so 8000 fits today's scenes with headroom;
    // a truncation steps up once instead of retrying the same ceiling.
    const budgets = [8000, 16000, 16000];

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
                content: `You generate a strict Scene DSL v0 JSON object. Infer the mechanism from the user prompt. Output ONLY valid raw JSON. No prose. No markdown.

Schema:
{"dslVersion":"0.1","concept":{"question":"string","medium":"3d|2d|hybrid","mediumWhy":"string","verification":"solver|sourced|sketch"},"theme":{"motif":"string","palette":"okabe-ito","keyAzimuth":135},"nodes":[{"id":"string","type":"box|cylinder|tube|plane","parent":"string|null","transform":{"p":[0,0,0],"r":[0,0,0],"s":[1,1,1]},"material":{"roughness":0.5,"metalness":0.6,"tint":"#E69F00"},"label":"string"}],"joints":[{"id":"string","type":"hinge|slider|gear","a":"string","b":"string","anchor":[0,0,0],"axis":[0,0,1],"range":[0,360],"driver":{"kind":"time","rpm":30}}],"flows":[],"camera":{"axisOfAction":[0,1,0],"shots":[{"t":0,"size":"wide","target":"node-id","move":"orbit-in"}]},"beats":[{"id":"string","t":[0,6],"goal":"string","becauseOf":["node-id"],"probe":{"kind":"trace","prompt":"string","answer":"node-id"},"narration":"string"}],"audio":{"layers":["ambience","mech"]}}

Rules: flat arrays only. Every becauseOf references an existing node id. Every beat has exactly one probe whose answer is a node id. Use 3-8 beats. Choose medium by rule: spatial parts that occlude -> 3d with non-uniform scales; sequence/data/abstraction -> 2d; cutaway plus live trace -> hybrid. Set concept.verification honestly: "solver" only if motion matches a closed-form formula, else "sketch". Never claim "sourced". Output ONLY the JSON object.`,
              },
              {
                role: 'user',
                content: concept,
              },
            ],
            temperature: 0.0,
            max_tokens: budgets[Math.min(attempt - 1, budgets.length - 1)],
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

        const dsl = parseStrictScene(content);
        return adaptDslToScene(dsl);
      } catch (err) {
        const msg = (err as Error).message;
        // Truncation at the top budget is deterministic for a fixed prompt:
        // fail fast instead of burning a third identical call.
        if (msg.startsWith('E_TRUNCATED') && attempt >= maxRetries) throw err;
        lastError.push(`Attempt ${attempt}: ${msg}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(`E_API_RETRIES_EXCEEDED: API failed after ${maxRetries} attempts: ${lastError.join(' | ')}`);
  }
}

export const metaModelAPI = new MetaModelAPI();
