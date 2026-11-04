// src/api/substance.ts
// Label-driven substance matching, shared by the renderer (auto-texture)
// and the quality scorer (richness without downloads). One word list,
// two consumers: staging and scoring can never disagree about what
// counts as matter.

export const SUBSTANCE_MAPS: Array<{ words: string[]; slug: string }> = [
  { words: ['wood', 'oak', 'plank', 'beam', 'timber', 'log', 'tree', 'trunk', 'branch'], slug: 'dark_wooden_planks' },
  { words: ['metal', 'steel', 'iron', 'aluminum', 'aluminium', 'shaft', 'rod', 'pipe', 'barrel', 'engine', 'axle', 'spindle'], slug: 'metal_plate' },
  { words: ['brass', 'copper', 'bronze', 'key', 'gear', 'cog', 'spring', 'coil', 'pin', 'screw', 'bolt', 'dial', 'lock', 'hinge'], slug: 'blue_metal_plate' },
  { words: ['rock', 'stone', 'boulder', 'cliff', 'mountain', 'concrete', 'cement', 'brick'], slug: 'brown_mud_rocks_01' },
  { words: ['grass', 'lawn', 'meadow', 'field', 'ground', 'soil', 'dirt', 'earth', 'terrain'], slug: 'grass_ground' },
  { words: ['marble', 'statue'], slug: 'marble_01' },
  { words: ['fabric', 'cloth', 'canvas', 'denim', 'curtain', 'shirt', 'flag'], slug: 'denim_fabric' },
  { words: ['sand', 'desert', 'beach'], slug: 'aerial_sand' },
  { words: ['bark'], slug: 'bark_brown_01' },
  { words: ['snow', 'ice', 'frost'], slug: 'snow_01' },
  { words: ['plaster', 'wall', 'ceiling'], slug: 'grey_plaster' },
];

/** Non-PolyHaven albedo fallbacks (verified CORS-open hosts). */
export const REMOTE_MAPS: Array<{ words: string[]; url: string }> = [
  {
    words: ['earth', 'globe', 'planet', 'continent', 'ocean planet'],
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg',
  },
  {
    words: ['moon', 'lunar', 'crater'],
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/moon_1024.jpg',
  },
];

/** True when a part's words name a real substance (or carry matter). */
export function matchesSubstance(label: string, id: string, type: string): boolean {
  if (type === 'tube' || type === 'points' || type === 'model') return false;
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
