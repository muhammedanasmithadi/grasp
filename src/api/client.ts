import { parseSceneResponse } from './parser';
import type { SceneData } from '../types';

const API_BASE = (import.meta as unknown as Record<string, { VITE_META_API_BASE?: string; VITE_META_API_KEY?: string }>).env?.VITE_META_API_BASE || '/api';
const API_KEY = (import.meta as unknown as Record<string, { VITE_META_API_BASE?: string; VITE_META_API_KEY?: string }>).env?.VITE_META_API_KEY || '';

export class MetaModelAPI {
  constructor() {
    if (!API_KEY) {
      console.warn('[MetaModelAPI] No VITE_META_API_KEY set — API calls will fail');
    }
  }

  async generateScene(concept: string): Promise<SceneData> {
    if (!API_KEY) {
      throw new Error('No API key configured. Set VITE_META_API_KEY in .env');
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
            model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
            messages: [
              {
                role: 'system',
                content: `You are a JSON generator. Output ONLY valid raw JSON. NO prose. No markdown. No explanation. NO text before or after the JSON. Just a single JSON object.

Schema:
{
  "title": "string - human-readable concept title",
  "beats": [
    { "id": "string", "title": "string", "goal": "string", "narration": "string", "part": "string" }
  ],
  "sabotageBeat": "string",
  "causalSpine": [ { "part": "string", "action": "string", "nextPart": "string" } ]
}

Include exactly 4-6 beats. One beat has a subtle causal fault. Output ONLY the JSON object - nothing else.`,
              },
              {
                role: 'user',
                content: concept,
              },
            ],
            temperature: 0.0,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error (${response.status}): ${errorText.slice(0, 200)}`);
        }

        const data = await response.json();

        let content: string;
        if (data.choices && data.choices[0] && data.choices[0].message) {
          content =
            data.choices[0].message.content ??
            data.choices[0].message.reasoning_content ??
            '';
        } else if (typeof data === 'string') {
          content = data;
        } else {
          content = JSON.stringify(data);
        }

        if (!content) {
          throw new Error('Empty response from API');
        }

        console.log('[MetaModelAPI] raw content:', content?.slice(0, 500));

        return parseSceneResponse(content);
      } catch (err) {
        lastError.push(`Attempt ${attempt}: ${(err as Error).message}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    throw new Error(`API failed after ${maxRetries} attempts: ${lastError.join(' | ')}`);
  }
}

export const metaModelAPI = new MetaModelAPI();
