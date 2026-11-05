// src/api/substance.ts
// Label-driven substance matching, shared by the renderer (auto-texture)
// and the quality scorer (richness without downloads). One word list,
// two consumers: staging and scoring can never disagree about what
// counts as matter.

export const SUBSTANCE_MAPS: Array<{ words: string[]; slug: string; tint: string; metalness: number; roughness: number }> = [
  { words: ['wood', 'oak', 'plank', 'beam', 'timber', 'log', 'tree', 'trunk', 'branch'], slug: 'dark_wooden_planks', tint: '#8a5a2b', metalness: 0.05, roughness: 0.7 },
  { words: ['metal', 'steel', 'iron', 'aluminum', 'aluminium', 'shaft', 'rod', 'pipe', 'barrel', 'engine', 'axle', 'spindle'], slug: 'metal_plate', tint: '#9aa0a8', metalness: 0.9, roughness: 0.35 },
  { words: ['brass', 'copper', 'bronze', 'key', 'gear', 'cog', 'spring', 'coil', 'pin', 'screw', 'bolt', 'dial', 'lock', 'hinge'], slug: 'blue_metal_plate', tint: '#C9A227', metalness: 0.9, roughness: 0.3 },
  { words: ['rock', 'stone', 'boulder', 'cliff', 'mountain', 'concrete', 'cement', 'brick'], slug: 'brown_mud_rocks_01', tint: '#7a6f63', metalness: 0, roughness: 0.95 },
  { words: ['grass', 'lawn', 'meadow', 'field', 'ground', 'soil', 'dirt', 'earth', 'terrain'], slug: 'grass_ground', tint: '#6f9e5a', metalness: 0, roughness: 0.9 },
  { words: ['marble', 'statue'], slug: 'marble_01', tint: '#e8e4dc', metalness: 0, roughness: 0.25 },
  { words: ['fabric', 'cloth', 'canvas', 'denim', 'curtain', 'shirt', 'flag'], slug: 'denim_fabric', tint: '#3f5a7a', metalness: 0, roughness: 0.9 },
  { words: ['sand', 'desert', 'beach'], slug: 'aerial_sand', tint: '#d9c08a', metalness: 0, roughness: 0.95 },
  { words: ['bark'], slug: 'bark_brown_01', tint: '#5a4232', metalness: 0, roughness: 0.9 },
  { words: ['snow', 'ice', 'frost'], slug: 'snow_01', tint: '#eef2f5', metalness: 0, roughness: 0.4 },
  { words: ['plaster', 'wall', 'ceiling'], slug: 'grey_plaster', tint: '#ddd5c2', metalness: 0, roughness: 0.85 },
];

/** Non-PolyHaven albedo fallbacks (verified CORS-open hosts). */
export const REMOTE_MAPS: Array<{ words: string[]; url: string; tint: string; metalness: number; roughness: number }> = [
  {
    words: ['earth', 'globe', 'planet', 'continent', 'ocean planet'],
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg',
    tint: '#2f6f4f', metalness: 0.1, roughness: 0.6,
  },
  {
    words: ['moon', 'lunar', 'crater'],
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/moon_1024.jpg',
    tint: '#b8b4ac', metalness: 0, roughness: 0.95,
  },
];

export interface CanonicalStyle { tint: string; metalness: number; roughness: number }

/** Code-owned material for a named substance. When a part's words name
 * matter, the renderer uses this — never the model's tint. Tubes get
 * tint and finish but never maps (stretched textures on hoses read
 * worse than clean metal). Model values survive only for unnamed
 * parts and for functional fields (transmission, emissive, opacity),
 * which are behavior, not taste. */
export function substanceStyle(label: string, id: string, type: string): CanonicalStyle | null {
  if (type === 'points' || type === 'model') return null;
  const hay = `${label} ${id}`.toLowerCase();
  for (const { words, tint, metalness, roughness } of [...SUBSTANCE_MAPS, ...REMOTE_MAPS]) {
    if (words.some((w) => hay.includes(w))) return { tint, metalness, roughness };
  }
  return null;
}

/** True when a part's words name a real substance (or carry matter). */
export function matchesSubstance(label: string, id: string, type: string): boolean {
  if (type === 'points' || type === 'model') return false;
  const hay = `${label} ${id}`.toLowerCase();
  return (
    SUBSTANCE_MAPS.some(({ words }) => words.some((w) => hay.includes(w))) ||
    REMOTE_MAPS.some(({ words }) => words.some((w) => hay.includes(w)))
  );
}

/** Albedo URL for a part, or null when its words name nothing.
 * Poly Haven albedos load at 2k; relief always rides the matching 1k
 * normal map (verified pattern), so detail never depends on a 2k
 * normal existing. */
export function substanceUrl(label: string, id: string, type: string): string | null {
  if (type === 'tube' || type === 'points' || type === 'model') return null;
  const hay = `${label} ${id}`.toLowerCase();
  for (const { words, slug } of SUBSTANCE_MAPS) {
    if (words.some((w) => hay.includes(w))) {
      return `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/${slug}/${slug}_diff_2k.jpg`;
    }
  }
  for (const { words, url } of REMOTE_MAPS) {
    if (words.some((w) => hay.includes(w))) return url;
  }
  return null;
}

/** Relief companion for an albedo URL: same asset, 1k normal map. */
export function normalForAlbedo(albedo: string): string | null {
  if (!albedo.includes('_diff_')) return null;
  return albedo.replace(/\/\dk\//, '/1k/').replace(/_diff_\dk\.jpg$/, '_nor_dx_1k.jpg');
}
