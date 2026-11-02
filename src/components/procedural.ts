import * as THREE from 'three'

// Shared procedural micro-surface. Breaks the flat CG look on primitives
// without any downloads: light grain perturbs roughness and adds a faint
// bump. Mean stays near white so the model's roughness value keeps its
// meaning and only variation is added.
let grain: THREE.CanvasTexture | null = null
export function getGrainTexture(): THREE.CanvasTexture {
  if (grain) return grain
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ececec'
  ctx.fillRect(0, 0, size, size)
  // Fine speckle.
  for (let i = 0; i < 9000; i++) {
    const v = 200 + Math.floor(Math.random() * 55)
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4)
  }
  // Broad soft blotches for large-scale variation.
  for (let i = 0; i < 60; i++) {
    const r = 12 + Math.random() * 30
    const v = 215 + Math.floor(Math.random() * 40)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`)
    g.addColorStop(1, 'rgba(236,236,236,0)')
    ctx.save()
    ctx.translate(Math.random() * size, Math.random() * size)
    ctx.fillStyle = g
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.restore()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  grain = tex
  return tex
}

// Remote albedo cache. URLs are validator-allowlisted, CORS-open, and
// immutable, so one Texture per URL for the session is correct.
const mapCache = new Map<string, THREE.Texture>()

export function getMapTexture(url: string): THREE.Texture {
  let tex = mapCache.get(url)
  if (!tex) {
    tex = new THREE.TextureLoader().load(url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    mapCache.set(url, tex)
  }
  return tex
}
