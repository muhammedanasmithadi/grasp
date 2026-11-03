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
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  grain = tex
  return tex
}

// Seamless stage disc: warm matter under the subject dissolving into
// the backdrop color at the rim. No visible edge, no horizon seam.
const stageCache = new Map<string, THREE.CanvasTexture>()

export function getStageTexture(bg: string): THREE.CanvasTexture {
  let tex = stageCache.get(bg)
  if (tex) return tex
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  // Match the sky's luminance: a warm disc under a space scene reads
  // as desert, not void. Dark backdrops get a dark stage.
  const m = /^#([0-9a-fA-F]{6})$/.exec(bg)
  const lum = m
    ? (0.299 * parseInt(m[1].slice(0, 2), 16) +
      0.587 * parseInt(m[1].slice(2, 4), 16) +
      0.114 * parseInt(m[1].slice(4, 6), 16)) / 255
    : 0.8
  const dark = lum < 0.35
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.5)
  if (dark) {
    g.addColorStop(0, '#2b303c')
    g.addColorStop(0.45, '#252a35')
    g.addColorStop(0.75, bg)
    g.addColorStop(1, bg)
  } else {
    g.addColorStop(0, '#e3d8bf')
    g.addColorStop(0.45, '#ddd2b8')
    g.addColorStop(0.75, bg)
    g.addColorStop(1, bg)
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // Faint tonal patches for matter.
  for (let i = 0; i < 90; i++) {
    const r = 8 + Math.random() * 34
    const v = 208 + Math.floor(Math.random() * 26)
    const p = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    p.addColorStop(0, `rgba(${v},${v - 8},${v - 30},0.22)`)
    p.addColorStop(1, 'rgba(221,210,184,0)')
    ctx.save()
    ctx.translate(size * 0.2 + Math.random() * size * 0.6, size * 0.2 + Math.random() * size * 0.6)
    ctx.fillStyle = p
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.restore()
  }
  tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  stageCache.set(bg, tex)
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
    tex.anisotropy = 8
    mapCache.set(url, tex)
  }
  return tex
}

// Linear (non-color) data textures: normal maps must not be sRGB
// decoded or the lighting math reads them wrong.
const linearCache = new Map<string, THREE.Texture>()

export function getLinearTexture(url: string): THREE.Texture {
  let tex = linearCache.get(url)
  if (!tex) {
    tex = new THREE.TextureLoader().load(url)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    linearCache.set(url, tex)
  }
  return tex
}

// Large-scale warm ground: fine grain over soft tonal patches so the
// stage reads as matter, not a void. Tiled with wrapping.
let ground: THREE.CanvasTexture | null = null

export function getGroundTexture(): THREE.CanvasTexture {
  if (ground) return ground
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ded4ba'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 220; i++) {
    const r = 20 + Math.random() * 70
    const v = 205 + Math.floor(Math.random() * 30)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    g.addColorStop(0, `rgba(${v},${v - 8},${v - 30},0.28)`)
    g.addColorStop(1, 'rgba(222,212,186,0)')
    ctx.save()
    ctx.translate(Math.random() * size, Math.random() * size)
    ctx.fillStyle = g
    ctx.fillRect(-r, -r, r * 2, r * 2)
    ctx.restore()
  }
  for (let i = 0; i < 26000; i++) {
    const v = 190 + Math.floor(Math.random() * 55)
    ctx.fillStyle = `rgba(${v},${v - 6},${v - 24},0.45)`
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(7, 7)
  ground = tex
  return tex
}
