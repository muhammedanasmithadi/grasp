import React, { useRef, useEffect, useMemo, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html, useGLTF, Environment, ContactShadows, SoftShadows, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, HueSaturation, BrightnessContrast, N8AO } from '@react-three/postprocessing'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { DslNode, DslJoint, DslGroup } from '../types'

const DEFAULT_BACKDROP = '#e9e4d6'

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#2c2418',
  background: '#fdfaf0',
  border: '1px solid #c9ba9e',
  padding: '2px 6px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

import { getGrainTexture, getMapTexture, getLinearTexture, getStageTexture } from './procedural'
import { estimateExtents } from '../api/layout'
import { DetailFor } from './details'

const PALETTE = ['#b8860b', '#e69f00', '#009e73', '#0072B2', '#D55E00', '#CC79A7']

function layoutPositions(count: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const spacing = 1.7
  const offset = ((count - 1) * spacing) / 2
  for (let i = 0; i < count; i++) {
    pts.push(new THREE.Vector3(i * spacing - offset, -0.3, 0))
  }
  return pts
}

/** Master clock inside the Canvas. Advances shared time; seeks when `time` changes. */
function ClockRig({
  clockRef,
  time,
  playing,
}: {
  clockRef: React.MutableRefObject<number>
  time: number
  playing: boolean
}) {
  useEffect(() => {
    clockRef.current = time
  }, [time, clockRef])
  useFrame((_, delta) => {
    if (playing) clockRef.current += delta
  })
  return null
}

/** Procedural image-based lighting. No HDR download needed. */
function EnvRig() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

function axisDominant(axis: [number, number, number]): 'x' | 'y' | 'z' {
  const ax = Math.abs(axis[0])
  const ay = Math.abs(axis[1])
  const az = Math.abs(axis[2])
  if (az >= ax && az >= ay) return 'z'
  if (ay >= ax) return 'y'
  return 'x'
}

function PartNode({
  position,
  label,
  color,
  active,
  isFault,
}: {
  position: THREE.Vector3
  label: string
  color: string
  active: boolean
  isFault: boolean
}) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    const s = active ? 1 + 0.08 * Math.sin(t * 3) : 1
    ref.current.scale.setScalar(s)
  })
  const base = isFault ? '#D55E00' : active ? color : '#8a8272'
  return (
    <group position={position}>
      <mesh ref={ref} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshPhysicalMaterial
          color={base}
          roughness={0.35}
          metalness={0.6}
          roughnessMap={getGrainTexture()}
          bumpMap={getGrainTexture()}
          bumpScale={0.02}
          clearcoat={0.6}
          clearcoatRoughness={0.25}
          emissive={active || isFault ? base : '#000000'}
          emissiveIntensity={active || isFault ? 0.35 : 0}
        />
      </mesh>
      <Html center occlude zIndexRange={[20, 0]}>
        <div style={LABEL_STYLE}>
          {label}
        </div>
      </Html>
    </group>
  )
}

/** Label-driven substance texturing. When the model omits material.map,
 * the part name usually still says what the matter is ("oak beam",
 * "steel shaft"). Map those words onto verified texture URLs so every
 * world gets real surfaces unconditionally. Explicit maps always win. */
const SUBSTANCE_MAPS: Array<{ words: string[]; slug: string }> = [
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
]

/** Non-PolyHaven albedo fallbacks (verified CORS-open hosts). */
const REMOTE_MAPS: Array<{ words: string[]; url: string }> = [
  {
    words: ['earth', 'globe', 'planet', 'continent', 'ocean planet'],
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg',
  },
  {
    words: ['moon', 'lunar', 'crater'],
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/moon_1024.jpg',
  },
]

export function substanceTexture(node: DslNode): string | null {
  if (node.type === 'tube' || node.type === 'points' || node.type === 'model') return null
  const hay = `${node.label} ${node.id}`.toLowerCase()
  for (const { words, slug } of SUBSTANCE_MAPS) {
    if (words.some((w) => hay.includes(w))) {
      return `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${slug}/${slug}_diff_1k.jpg`
    }
  }
  for (const { words, url } of REMOTE_MAPS) {
    if (words.some((w) => hay.includes(w))) return url
  }
  return null
}

function taperedRadius(t: number): number {
  // Hoses and winds swell mid-run and neck down where they meet ports.
  return 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * t), 0.5)
}

function makeTaperedTube(
  points: THREE.Vector3[],
  radius: number,
  tubularSegments = 48,
  radialSegments = 12
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points)
  const frames = curve.computeFrenetFrames(tubularSegments, false)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments
    const p = curve.getPointAt(t)
    const r = radius * taperedRadius(t)
    const N = frames.normals[Math.min(i, tubularSegments - 1)]
    const B = frames.binormals[Math.min(i, tubularSegments - 1)]
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2
      const sin = Math.sin(v)
      const cos = Math.cos(v)
      const nx = cos * N.x + sin * B.x
      const ny = cos * N.y + sin * B.y
      const nz = cos * N.z + sin * B.z
      positions.push(p.x + r * nx, p.y + r * ny, p.z + r * nz)
      normals.push(nx, ny, nz)
      uvs.push(t, j / radialSegments)
    }
  }
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j
      const b = a + radialSegments + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

/** Poly Haven gltfs point their textures at a sibling textures/ dir
 * that does not exist on the CDN; the real maps live under the jpg/
 * tree for the same asset and resolution. Rewrite relative URIs to
 * absolute ones (textures/ -> jpg tree, everything else -> gltf dir)
 * so the models arrive fully textured. Khronos assets are untouched. */
async function polyhavenBlobUrl(url: string): Promise<string> {
  const text = await (await fetch(url)).text()
  const dir = url.slice(0, url.lastIndexOf('/') + 1)
  const m = url.match(/\/Models\/gltf\/([^/]+)\/([^/]+)\//)
  const jpgBase = m
    ? `https://dl.polyhaven.org/file/ph-assets/Models/jpg/${m[1]}/${m[2]}/`
    : dir
  const patched = text
    .replace(/"uri"\s*:\s*"textures\//g, `"uri": "${jpgBase}`)
    .replace(/"uri"\s*:\s*"(?!https?:|data:|blob:)/g, `"uri": "${dir}`)
  return URL.createObjectURL(new Blob([patched], { type: 'model/gltf+json' }))
}

function ModelMesh({ url, scale }: { url: string; scale: [number, number, number] }) {
  const polyhaven = url.includes('polyhaven.org')
  const [src, setSrc] = useState<string | null>(polyhaven ? null : url)
  useEffect(() => {
    if (!polyhaven) return
    let live = true
    let blob = ''
    polyhavenBlobUrl(url).then((b) => {
      if (live) setSrc(b)
      else URL.revokeObjectURL(b)
      blob = b
    })
    return () => {
      live = false
      if (blob) URL.revokeObjectURL(blob)
    }
  }, [url, polyhaven])
  if (!src) return null
  return (
    <Suspense fallback={null}>
      <ModelInner src={src} scale={scale} />
    </Suspense>
  )
}

/** Sample-asset models are authored in meters and vary wildly in size.
 * Center each one and normalize its longest side to ~3 scene units so
 * a drill, a duck, and a helmet all read at hand scale. */
function ModelInner({ src, scale }: { src: string; scale: [number, number, number] }) {
  const gltf = useGLTF(src) as unknown as { scene: THREE.Object3D }
  const obj = useMemo(() => {
    const scene = gltf.scene.clone()
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const group = new THREE.Group()
    scene.position.sub(center)
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
      }
    })
    group.add(scene)
    // Node scale multiplies the normalization: R3F would overwrite
    // group.scale from the primitive's scale prop, so bake it in here.
    const k = 2.4 / maxDim
    group.scale.set(scale[0] * k, scale[1] * k, scale[2] * k)
    return group
  }, [gltf, scale])
  return <primitive object={obj} />
}

/** Tube paths are authored in world coordinates (absolute points the
 * hose passes through). The mesh lives inside a group already
 * positioned at the node origin, so feeding absolute points to the
 * geometry double-counts the transform and every tube renders ~2x away
 * from its staged slot — the chronic floating-hose read. Relativize. */
export function tubePointsRelative(
  path: [number, number, number][] | undefined,
  origin: [number, number, number]
): [number, number, number][] {
  if (!path) return []
  return path.map(([x, y, z]) => [x - origin[0], y - origin[1], z - origin[2]])
}

function useTubeGeometry(path: [number, number, number][] | undefined, radius: number, origin: [number, number, number]) {
  return useMemo(() => {
    const rel = tubePointsRelative(path, origin)
    if (rel.length < 2) return null
    const pts = rel.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    return makeTaperedTube(pts, radius)
  }, [path ? JSON.stringify(path) : '', radius, JSON.stringify(origin)])
}

function PointsCloud({ count, size, color }: { count: number; size: number; color: string }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 2
      arr[i * 3 + 1] = (Math.random() - 0.5) * 2
      arr[i * 3 + 2] = (Math.random() - 0.5) * 2
    }
    return arr
  }, [count])
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} color={color} sizeAttenuation transparent opacity={0.9} />
    </points>
  )
}

function BoxGeometry({ node }: { node: import('../types').DslNode }) {
  const geo = useMemo(() => {
    const a = (node.geometry?.args as number[] | undefined) ?? [1, 1, 1]
    const w = Number(a[0]) || 1
    const h = Number(a[1]) || 1
    const d = Number(a[2]) || 1
    // Soft edges kill the harsh CG-box read on every housing and block.
    const r = Math.min(w, h, d) * 0.12
    return new RoundedBoxGeometry(w, h, d, 4, r)
  }, [node])
  return <primitive object={geo} attach="geometry" />
}

function GeometryFor({ node }: { node: import('../types').DslNode }) {
  const g = node.geometry ?? {}
  const args = g.args
  switch (node.type) {
    case 'box':
      return <BoxGeometry node={node} />
    case 'cylinder':
      return <cylinderGeometry args={(args as [number, number, number, number]) ?? [0.5, 0.5, 1, 24]} />
    case 'sphere':
      return <sphereGeometry args={(args as [number, number, number]) ?? [0.5, 32, 32]} />
    case 'cone':
      return <coneGeometry args={(args as [number, number, number]) ?? [0.5, 1, 24]} />
    case 'torus':
      return <torusGeometry args={(args as [number, number, number, number]) ?? [0.5, 0.2, 16, 32]} />
    case 'torusKnot':
      return <torusKnotGeometry args={(args as [number, number, number, number]) ?? [0.5, 0.15, 64, 16]} />
    case 'tetrahedron':
      return <tetrahedronGeometry args={(args as [number]) ?? [0.7]} />
    case 'octahedron':
      return <octahedronGeometry args={(args as [number]) ?? [0.7]} />
    case 'dodecahedron':
      return <dodecahedronGeometry args={(args as [number]) ?? [0.7]} />
    case 'icosahedron':
      return <icosahedronGeometry args={(args as [number]) ?? [0.7]} />
    case 'capsule':
      return <capsuleGeometry args={(args as [number, number, number, number]) ?? [0.3, 1, 8, 16]} />
    case 'circle':
      return <circleGeometry args={(args as [number, number]) ?? [0.5, 32]} />
    case 'ring':
      return <ringGeometry args={(args as [number, number, number]) ?? [0.3, 0.5, 32]} />
    case 'plane':
      return <planeGeometry args={(args as [number, number]) ?? [1, 1]} />
    case 'tube':
      // Plain tube without a path renders as an open cylinder; pathed
      // tubes are handled by TubeMesh below.
      return <cylinderGeometry args={[0.5, 0.5, 1, 24, 1, true]} />
    default:
      return <boxGeometry args={(args as [number, number, number]) ?? [1, 1, 1]} />
  }
}

function DslNodeMesh({
  node,
  active,
  isFault,
  color,
  joints,
  clockRef,
  showLabel,
  floorY,
}: {
  node: DslNode
  active: boolean
  isFault: boolean
  color: string
  joints: DslJoint[]
  clockRef: React.MutableRefObject<number>
  showLabel: boolean
  floorY: number
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRef = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    if (!groupRef.current) return
    const t = clockRef.current
    let rx = node.transform.r[0]
    let ry = node.transform.r[1]
    let rz = node.transform.r[2]
    let ox = 0
    let oy = 0
    let oz = 0
    for (const j of joints) {
      const rpm = j.driver?.rpm ?? 30
      const omega = ((rpm / 60) * Math.PI * 2 * t) % (Math.PI * 2)
      if (j.type === 'slider') {
        // Sliders shuttle along their axis. Amplitude is clamped: the
        // model often passes degree-like ranges (e.g. [0, 360]) that
        // would fling seated parts across the stage. Oscillation must
        // read as motion, never as displacement.
        const span = j.range[1] - j.range[0]
        const amp = Math.min(span / 2, 0.45)
        const off = amp * Math.sin(omega)
        const len = Math.hypot(j.axis[0], j.axis[1], j.axis[2]) || 1
        ox += (j.axis[0] / len) * off
        oy += (j.axis[1] / len) * off
        oz += (j.axis[2] / len) * off
      } else {
        // hinge + gear: rotate around dominant axis within range
        const spanDeg = j.range[1] - j.range[0]
        const span = (spanDeg * Math.PI) / 180
        const a = j.range[0] * (Math.PI / 180) + ((omega / (Math.PI * 2)) % 1) * (span === 0 ? Math.PI * 2 : span)
        const dom = axisDominant(j.anchor && j.axis ? j.axis : [0, 0, 1])
        if (dom === 'x') rx += a
        else if (dom === 'y') ry += a
        else rz += a
      }
    }
    groupRef.current.position.set(
      node.transform.p[0] + ox,
      node.transform.p[1] + oy,
      node.transform.p[2] + oz
    )
    groupRef.current.rotation.set(rx, ry, rz)
    const pulse = active ? 1 + 0.08 * Math.sin(state.clock.elapsedTime * 3) : 1
    if (meshRef.current) {
      meshRef.current.scale.set(
        node.transform.s[0] * pulse,
        node.transform.s[1] * pulse,
        node.transform.s[2] * pulse
      )
    }
  })
/** Largest face dimension in world units: boxes use all three axes,
 * planes and circles their width. Anything 10+ units across is stage,
 * not subject, whatever way it faces. */
function faceSizeOf(node: DslNode): number {
  const a = node.geometry?.args
  const num = (i: number): number =>
    (Array.isArray(a) ? Math.abs(Number(a[i]) || 0) : 0) *
    Math.abs(node.transform.s[i])
  if (node.type === 'box') return Math.max(num(0), num(1), num(2))
  if (node.type === 'plane' || node.type === 'circle') return num(0)
  return 0
}
  const bigBright = (() => {
    const face = faceSizeOf(node)
    if (face < 10) return false
    const hex = expandHex(node.material.tint || color)
    if (!hex) return false
    const lum =
      (0.299 * parseInt(hex.slice(1, 3), 16) +
        0.587 * parseInt(hex.slice(3, 5), 16) +
        0.114 * parseInt(hex.slice(5, 7), 16)) /
      255
    return lum > 0.85
  })()
  const base = isFault
    ? '#D55E00'
    : liftBlackTint(
        brightFaceTint(
          groundSafeTint(node.material.tint || color, bigBright),
          faceSizeOf(node)
        )
      )
  const autoMap = node.material.map ?? substanceTexture(node)
  const mapTex = autoMap ? getMapTexture(autoMap) : undefined
  // Normal detail rides along: polyhaven albedo URLs have a matching
  // normal map under the same slug, loaded linear (never sRGB).
  const autoNormal =
    node.material.normalMap ??
    (autoMap && autoMap.includes('_diff_1k.jpg')
      ? autoMap.replace('_diff_1k.jpg', '_nor_dx_1k.jpg')
      : null)
  const normalTex = autoNormal ? getLinearTexture(autoNormal) : undefined
  const isTube = node.type === 'tube'
  const tubeGeo = useTubeGeometry(
    node.type === 'tube' ? (node.geometry?.path as [number, number, number][] | undefined) : undefined,
    node.geometry?.radius ?? 0.15,
    node.transform.p
  )
  const isModel = node.type === 'model' && !!node.geometry?.url
  const isPoints = node.type === 'points'
  return (
    <group
      ref={groupRef}
      position={[node.transform.p[0], node.transform.p[1], node.transform.p[2]]}
      rotation={[node.transform.r[0], node.transform.r[1], node.transform.r[2]]}
    >
      {isModel ? (
        <ModelMesh url={node.geometry!.url!} scale={node.transform.s} />
      ) : isPoints ? (
        <group scale={node.transform.s}>
          <PointsCloud
            count={Math.min(node.geometry?.count ?? 300, 5000)}
            size={node.geometry?.size ?? 0.08}
            color={base}
          />
        </group>
      ) : isTube && tubeGeo ? (
        <mesh ref={meshRef} scale={node.transform.s} castShadow geometry={tubeGeo}>
          <meshPhysicalMaterial
            color={base}
            map={mapTex}
            normalMap={normalTex}
            roughness={node.material.roughness ?? 0.5}
            metalness={node.material.metalness ?? 0.6}
            roughnessMap={getGrainTexture()}
            bumpMap={getGrainTexture()}
            bumpScale={0.02}
            clearcoat={node.material.clearcoat ?? 0.6}
            clearcoatRoughness={node.material.clearcoatRoughness ?? 0.25}
            transmission={node.material.transmission ?? 0}
            ior={node.material.ior ?? 1.5}
            transparent={node.material.transparent ?? (node.material.opacity ?? 1) < 1}
            opacity={node.material.opacity ?? 1}
            side={THREE.DoubleSide}
            emissive={active || isFault ? (node.material.emissive ?? base) : '#000000'}
            emissiveIntensity={active || isFault ? 0.35 : 0}
          />
        </mesh>
      ) : (
      <mesh ref={meshRef} scale={node.transform.s} castShadow>
        <GeometryFor node={node} />
        <meshPhysicalMaterial
          color={base}
          map={mapTex}
          normalMap={normalTex}
          roughness={node.material.roughness ?? 0.5}
          metalness={node.material.metalness ?? 0.6}
          roughnessMap={getGrainTexture()}
          bumpMap={getGrainTexture()}
          bumpScale={0.02}
          clearcoat={node.material.clearcoat ?? 0.6}
          clearcoatRoughness={node.material.clearcoatRoughness ?? 0.25}
          transmission={node.material.transmission ?? 0}
          ior={node.material.ior ?? 1.5}
          transparent={node.material.transparent ?? (node.material.opacity ?? 1) < 1}
          opacity={node.material.opacity ?? 1}
          side={isTube || node.type === 'plane' || node.type === 'circle' || node.type === 'ring' ? THREE.DoubleSide : THREE.FrontSide}
          emissive={active || isFault ? (node.material.emissive ?? base) : '#000000'}
          emissiveIntensity={active || isFault ? 0.35 : 0}
        />
      </mesh>
      )}
      {showLabel && (
      /* Lifted above the solid: a tag centered inside its own part is
      occluded by that part and never seen. Constant screen size: tags
      are UI, not scenery — distance-scaled tags shrink to illegibility
      exactly when the camera pulls back to establish context. */
      <group position={[0, estimateExtents(node).hy + 0.7, 0]}>
      <Html center occlude zIndexRange={[20, 0]}>
        <div style={LABEL_STYLE}>
          {node.label}
        </div>
      </Html>
      </group>
      )}
      {!isModel && !isPoints && node.type !== 'tube' && <DetailFor node={node} />}
    </group>
  )
}

/** One label per compound group, pinned above its centroid. Lifted
 * like part labels: a tag at the centroid sits inside the solid. */
function GroupLabels({
  groups,
  positions,
  focusNodeIds,
  showAll,
  faultNodeIds,
}: {
  groups: DslGroup[]
  positions: Map<string, THREE.Vector3>
  focusNodeIds: string[]
  showAll: boolean
  faultNodeIds: string[]
}) {
  return (
    <>
      {groups.map((g) => {
        const pts = g.members
          .map((m) => positions.get(m))
          .filter((p): p is THREE.Vector3 => !!p)
        if (pts.length === 0) return null
        if (!showAll && !g.members.some((m) => focusNodeIds.includes(m))) return null
        const c = pts
          .reduce((acc, p) => acc.add(p), new THREE.Vector3())
          .multiplyScalar(1 / pts.length)
        const isFault = g.members.some((m) => faultNodeIds.includes(m))
        return (
          <group key={g.id} position={[c.x, c.y + 1.4, c.z]}>
            <Html center occlude zIndexRange={[20, 0]}>
              <div
                style={{
                  ...LABEL_STYLE,
                  ...(isFault
                    ? { color: '#D55E00', border: '1px solid #D55E00' }
                    : {}),
                }}
              >
                {g.label}
              </div>
            </Html>
          </group>
        )
      })}
    </>
  )
}
function CausalLines({ points }: { points: THREE.Vector3[] }) {
  if (points.length < 2) return null
  const flat: number[] = []
  points.forEach((p) => flat.push(p.x, p.y, p.z))
  return <Line points={flat} color="#c9ba9e" linewidth={2} dashed={true} dashScale={0.8} transparent opacity={0.45} />
}

/** Backdrop, fog, and auto-framing. Reframes only when the scene changes. */
function StageRig({
  center,
  radius,
  sceneKey,
  bg,
  flat,
}: {
  center: THREE.Vector3
  radius: number
  sceneKey: string
  bg: string
  flat: boolean
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3
    update: () => void
  } | null
  const near = Math.max(radius * 3, 14)
  const far = Math.max(radius * 8, 40)
  const domeR = far * 0.45
  const fogColor = useMemo(() => new THREE.Color(bg).multiplyScalar(0.88), [bg])
  const sky = useMemo(() => {
    const top = new THREE.Color(bg).multiplyScalar(0.6)
    // The lower hemisphere fills everything past the ground's edge: keep
    // it below the backdrop so the horizon reads as haze, never white.
    const bottom = new THREE.Color(bg).multiplyScalar(0.86)
    const geo = new THREE.SphereGeometry(1, 32, 16)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: top },
        bottom: { value: bottom },
      },
      vertexShader:
        'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vP;' +
        'void main() { float h = normalize(vP).y * 0.5 + 0.5;' +
        ' gl_FragColor = vec4(mix(bottom, top, smoothstep(0.02, 0.65, h)), 1.0); }',
    })
    return { geo, mat }
  }, [bg])
  useEffect(() => {
    if (flat) return
    // The row runs along X with alternating z. Photograph it from the
    // front-side, never down its length: a diagonal view foreshortens
    // the street and drags edge-neighbors into the frame.
    const dir = new THREE.Vector3(0.35, 0.6, 1).normalize()
    const dist = Math.max(radius * 2.4, 6.5)
    camera.position.copy(center).addScaledVector(dir, dist)
    const persp = camera as THREE.PerspectiveCamera
    persp.near = Math.max(dist / 100, 0.1)
    persp.far = dist * 20
    persp.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(center)
      controls.update()
    }
  }, [sceneKey, flat, camera, controls, center.x, center.y, center.z, radius])
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[fogColor, near, far]} />
      {!flat && (
        <mesh geometry={sky.geo} material={sky.mat} scale={domeR} renderOrder={-1} />
      )}
    </>
  )
}

/** Per-beat focus: each beat is a chapter with a canonical 3/4 view.
 * On beat or scene change the camera cuts to target + canonical
 * direction at the focus distance. Damped glides preserved user orbit
 * vectors straight into occluders (e.g. behind the stage board), so
 * beats cut instead of glide. Users orbit freely between cuts. */
function FocusRig({
  currentBeat,
  sceneKey,
  target,
  radius,
  flat,
}: {
  currentBeat: number
  sceneKey: string
  target: THREE.Vector3
  radius: number
  flat: boolean
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3
    update: () => void
  } | null
  useEffect(() => {
    if (flat || !controls) return
    // The row runs along X with alternating z. Photograph it from the
    // front-side, never down its length: a diagonal view foreshortens
    // the street and drags edge-neighbors into the frame.
    const dir = new THREE.Vector3(0.35, 0.6, 1).normalize()
    const dist = Math.max(radius * 3.2, 6)
    controls.target.copy(target)
    camera.position.copy(target).addScaledVector(dir, dist)
    const persp = camera as THREE.PerspectiveCamera
    persp.near = Math.max(dist / 100, 0.05)
    persp.far = dist * 30
    persp.updateProjectionMatrix()
    controls.update()
    console.info(
      `[FocusRig] beat ${currentBeat} target=(${target.x.toFixed(1)},${target.y.toFixed(1)},${target.z.toFixed(1)}) focusR=${radius.toFixed(1)} dist=${dist.toFixed(1)}`
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBeat, sceneKey])
  return null
}
/** Slow drifting dust motes. Cinematic air: the light needs
 * something to live in. Additive, faint, always moving. */
function DustMotes({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const ref = useRef<THREE.Points>(null!)
  const positions = useMemo(() => {
    const count = 140
    const arr = new Float32Array(count * 3)
    const r = Math.max(radius * 1.6, 4)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = center.x + (Math.random() - 0.5) * 2 * r
      arr[i * 3 + 1] = center.y + (Math.random() - 0.5) * 2 * r
      arr[i * 3 + 2] = center.z + (Math.random() - 0.5) * 2 * r
    }
    return arr
  }, [center, radius])
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.014
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        color="#ffe9c4"
        transparent
        opacity={0.32}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/** Golden-hour key with fitted shadows, cool fill, warm hemisphere bounce. */
function LightRig({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const r = Math.max(radius, 4)
  const keyPos = useMemo(
    () => center.clone().add(new THREE.Vector3(r * 1.25, r * 0.62, r * 0.95)),
    [center, radius]
  )
  const fillPos = useMemo(
    () => center.clone().add(new THREE.Vector3(-r * 1.2, r * 0.5, -r * 0.9)),
    [center, radius]
  )
  return (
    <>
      <hemisphereLight args={['#fffaf0', '#9a8f78', 0.4]} />
      <directionalLight
        position={keyPos}
        intensity={1.9}
        color="#ffcf9e"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
        shadow-camera-near={0.5}
        shadow-camera-far={r * 6}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      />
      <directionalLight position={fillPos} intensity={0.4} color="#dfe8ff" />
      {/* rim: cool edge from back-left, separates subject from backdrop */}
      <directionalLight
        position={[center.x - r * 1.4, center.y + r * 1.1, center.z - r * 1.6]}
        intensity={1.1}
        color="#f4f8ff"
      />
    </>
  )
}

/** Grounds must never be near-white: one blown-out disc plus a
 * strong key reads as a void, not a stage. Any flat thing sitting on
 * the world floor gets its bright tints pulled toward warm gray at
 * render time (the prompt already forbids them, but clamping always
 * works while rejection just fails the world). Clouds stay white:
 * only floor-dwellers are touched. */
function expandHex(tint: string): string | null {
  const short = /^#([0-9a-fA-F]{3})$/.exec(tint)
  if (short) {
    const c = short[1]
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`
  }
  return /^#[0-9a-fA-F]{6}$/.test(tint) ? tint : null
}

function mixToward(r: number, g: number, b: number, keep: number, t: [number, number, number]): string {
  const mix = (c: number, x: number): string =>
    Math.round((c * keep + x * (1 - keep)) * 255).toString(16).padStart(2, '0')
  return `#${mix(r, t[0])}${mix(g, t[1])}${mix(b, t[2])}`
}

function groundSafeTint(tint: string, isGround: boolean): string {
  const hex = expandHex(tint)
  if (!isGround || !hex) return tint
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum <= 0.8) return tint
  return mixToward(r, g, b, 0.35, [0.72, 0.67, 0.55])
}

/** Large bright subject faces (glass trays, white housings) blow out
 * under the key + spot stack. A gentle pull toward warm paper keeps
 * them bright but holds detail. Small parts are untouched. */
export function brightFaceTint(tint: string, face: number): string {
  const hex = expandHex(tint)
  if (!hex || face < 4) return tint
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum <= 0.92) return tint
  return mixToward(r, g, b, 0.6, [0.85, 0.79, 0.66])
}

/** Near-black parts read as holes in a warm diorama. Lift them toward
 * warm charcoal. Pure black is never prompt-legal outside space scenes,
 * so this only ever repairs model overreach, never authorial intent. */
export function liftBlackTint(tint: string): string {
  const hex = expandHex(tint)
  if (!hex) return tint
  const lum =
    (0.299 * parseInt(hex.slice(1, 3), 16) +
      0.587 * parseInt(hex.slice(3, 5), 16) +
      0.114 * parseInt(hex.slice(5, 7), 16)) /
    255
  if (lum >= 0.12) return tint
  return '#4a4238'
}

/** Museum plinth: the row stands on a low rounded platform, which
 * sits on a seamless disc that dissolves into the backdrop. One stage,
 * no seams, no competing slabs. */
function Stage({
  topY,
  subjectR,
  bg,
  cx,
  cz,
}: {
  topY: number
  subjectR: number
  bg: string
  cx: number
  cz: number
}) {
  const plinthR = Math.max(subjectR * 1.35 + 0.8, 3)
  const discR = Math.max(subjectR * 5, 16)
  return (
    <group>
      {/* seamless ground disc */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, topY - 0.34, cz]} receiveShadow>
        <circleGeometry args={[discR, 64]} />
        <meshStandardMaterial map={getStageTexture(bg)} roughness={0.96} metalness={0} envMapIntensity={0.3} />
      </mesh>
      {/* plinth: satin product-shot sweep, catches a soft key reflection */}
      <mesh position={[cx, topY - 0.17, cz]} receiveShadow castShadow>
        <cylinderGeometry args={[plinthR, plinthR + 0.18, 0.34, 64]} />
        <meshPhysicalMaterial color="#e6dcc4" roughness={0.5} metalness={0} clearcoat={0.2} clearcoatRoughness={0.4} envMapIntensity={0.5} />
      </mesh>
      {/* plinth shadow gap: thin dark reveal under the rim */}
      <mesh position={[cx, topY - 0.335, cz]}>
        <cylinderGeometry args={[plinthR + 0.18, plinthR + 0.18, 0.02, 64]} />
        <meshBasicMaterial color="#4a4136" />
      </mesh>
    </group>
  )
}

/** HDRI with a procedural fallback. A failed download must never blank
 * the canvas, so the boundary swaps back to image-based lighting. */
class EnvBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface Scene3DProps {
  beats: { id: string | number; title: string; part: string }[]
  currentBeat: number
  sabotageBeatIndex: number
  sabotageMode: boolean
  nodes?: DslNode[]
  activeNodeIds?: string[]
  faultNodeIds?: string[]
  hiddenNodeIds?: string[]
  joints?: DslJoint[]
  groups?: DslGroup[]
  time?: number
  playing?: boolean
  medium?: '3d' | '2d' | 'hybrid'
  backdrop?: string
  focusNodeIds?: string[]
  sceneKey?: string
}

export default function Scene3D({
  beats,
  currentBeat,
  sabotageBeatIndex,
  sabotageMode,
  nodes,
  activeNodeIds = [],
  faultNodeIds = [],
  hiddenNodeIds = [],
  joints = [],
  groups = [],
  time = 0,
  playing = true,
  medium = '3d',
  backdrop,
  focusNodeIds = [],
  sceneKey = 'scene',
}: Scene3DProps) {
  const clockRef = useRef<number>(time)
  if (beats.length === 0) return null
  const hasNodes = !!nodes && nodes.length > 0
  const isFlat = medium === '2d'
  const visibleNodes = hasNodes ? nodes!.filter((n) => !hiddenNodeIds.includes(n.id)) : []
  const positions = hasNodes
    ? visibleNodes.map((n) => new THREE.Vector3(n.transform.p[0], n.transform.p[1], n.transform.p[2]))
    : layoutPositions(beats.length)
  const jointsByNode = (id: string): DslJoint[] => joints.filter((j) => j.b === id)
  const frameKey = JSON.stringify({
    nodes: visibleNodes.map((n) => [n.transform.p, n.transform.s, n.geometry?.args, n.geometry?.path]),
    fallback: positions.map((p) => p.toArray()),
  })
  // Frame on geometry extents, not node centers: a radius-6 sphere
  // centered in a centers-only box gets its top cropped off.
  const box = useMemo(() => {
    const b = new THREE.Box3()
    const tmp = new THREE.Vector3()
    // Frame on subjects, not the stage: a big flat ground plane would
    // shrink everything else to a speck. Ground routinely extends
    // past the frame edge in photography; subjects must not.
    const yHalf = (n: (typeof visibleNodes)[number]): number => {
      const args = n.geometry?.args
      const ay = Array.isArray(args) && args.length > 1 ? Math.abs(Number(args[1]) || 0) : 1.5
      return (ay * Math.abs(n.transform.s[1])) / 2
    }
    const globalFloor = Math.min(
      ...visibleNodes.map((n) => n.transform.p[1] - yHalf(n))
    )
    // Stage grounds are excluded from framing so subjects fill the
    // frame. Dimensions are scaled: an args-8 plane at scale 3 is a
    // 24-unit ground, not an 8-unit one. Vertical boxes (walls, doors)
    // are never grounds; only thin-Y slabs sitting on the floor are.
    const scaledDims = (n: (typeof visibleNodes)[number]): number[] => {
      const args = n.geometry?.args
      const a = (i: number): number =>
        Array.isArray(args) ? Math.abs(Number(args[i]) || 0) : 0
      const s = n.transform.s
      if (n.type === 'box') return [a(0) * Math.abs(s[0]), a(1) * Math.abs(s[1]), a(2) * Math.abs(s[2])]
      if (n.type === 'plane' || n.type === 'circle')
        return [a(0) * Math.abs(s[0]), a(1) * Math.abs(s[1]), 0.1]
      return [0, 0, 0]
    }
    const isBackdrop = (n: (typeof visibleNodes)[number]): boolean => {
      const dims = scaledDims(n)
      if (Math.max(dims[0], dims[2]) < 10) return false
      if (n.type === 'plane' || n.type === 'circle') {
        return Math.abs(n.transform.r[0] + Math.PI / 2) < 0.15
      }
      if (n.type === 'box') {
        const thinY = dims[1] <= 1.5
        const onFloor = n.transform.p[1] - dims[1] / 2 <= globalFloor + 1.0
        return thinY && onFloor
      }
      return false
    }
    const subjects =
      visibleNodes.some((n) => !isBackdrop(n)) || !hasNodes
        ? visibleNodes.filter((n) => !isBackdrop(n))
        : visibleNodes
    if (hasNodes) {
      for (const n of subjects) {
        const p = n.transform.p
        const s = n.transform.s
        const sMax = Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]), 1)
        let bound = 1.5 * sMax
        const args = n.geometry?.args
        if (Array.isArray(args) && args.length > 0) {
          bound =
            Math.max(...args.map((v) => Math.abs(Number(v) || 0)), 0.5) * sMax
        }
        const path = n.geometry?.path as unknown
        if (Array.isArray(path) && path.length > 0) {
          let reach = 0
          for (const pt of path) {
            if (Array.isArray(pt)) {
              reach = Math.max(
                reach,
                Math.abs((Number(pt[0]) || 0) - p[0]),
                Math.abs((Number(pt[1]) || 0) - p[1]),
                Math.abs((Number(pt[2]) || 0) - p[2])
              )
            }
          }
          bound = Math.max(bound, reach)
        }
        bound = Math.max(bound, 0.5)
        tmp.set(p[0] - bound, p[1] - bound, p[2] - bound)
        b.expandByPoint(tmp)
        tmp.set(p[0] + bound, p[1] + bound, p[2] + bound)
        b.expandByPoint(tmp)
      }
    } else {
      positions.forEach((p) => b.expandByPoint(p))
    }
    if (b.isEmpty()) b.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 2, 4))
    return b
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey])
  const center = useMemo(() => box.getCenter(new THREE.Vector3()), [box])
  const size = useMemo(() => box.getSize(new THREE.Vector3()), [box])
  const radius = Math.max(size.x, size.y, size.z) / 2
  const bg = backdrop ?? DEFAULT_BACKDROP
  const [spin, setSpin] = useState(true)
  // A near-white backdrop whites out fog, dome, and grade with it.
  // Pull bright backdrops down to warm paper; night scenes unaffected.
  const safeBg = useMemo(() => {
    const hex = expandHex(bg)
    if (!hex) return bg
    const lum =
      (0.299 * parseInt(hex.slice(1, 3), 16) +
        0.587 * parseInt(hex.slice(3, 5), 16) +
        0.114 * parseInt(hex.slice(5, 7), 16)) /
      255
    if (lum <= 0.9) return bg
    return '#e4d9bd'
  }, [bg])
  const memberToGroup = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) for (const id of g.members) m.set(id, g.id)
    return m
  }, [groups])
  const showAllLabels = focusNodeIds.length === 0
  const nodePositions = useMemo(() => {
    const m = new Map<string, THREE.Vector3>()
    visibleNodes.forEach((n) =>
      m.set(n.id, new THREE.Vector3(n.transform.p[0], n.transform.p[1], n.transform.p[2]))
    )
    return m
  }, [JSON.stringify(visibleNodes.map((n) => [n.id, n.transform.p]))])
  const labelVisible = (id: string) =>
    (showAllLabels || focusNodeIds.includes(id)) && !memberToGroup.has(id)
  // Beat focus: centroid and radius of the currently active parts.
  // Falls back to the whole-scene frame when nothing is active. The
  // group-mates of active parts count too: a beat spotlights an
  // assembly, and cropping its siblings reads as a bug, not a close-up.
  // The distance respects the biggest member, not just the spread: a
  // lone 3-unit lever at min distance fills the frame and reads as an
  // accident, not a close-up.
  const focus = useMemo(() => {
    // Seed from the primary assembly only: the first group containing a
    // beat node, plus any ungrouped beat nodes. Seeding from every
    // becauseOf id at once reverted dense rows to establishing shots on
    // every beat and the close-ups never happened. Row-neighbors are
    // deliberately NOT included: a ±window around the seed reverted
    // every beat to wide for the same reason (measured twice). A beat
    // frames its organ; the street stays visible around it.
    const seedIds = new Set<string>()
    const primary = groups.find((g) => g.members.some((m) => focusNodeIds.includes(m)))
    if (primary) {
      for (const m of primary.members) seedIds.add(m)
    }
    for (const id of focusNodeIds) {
      if (!memberToGroup.has(id)) seedIds.add(id)
    }
    if (seedIds.size === 0) {
      for (const id of focusNodeIds) seedIds.add(id)
    }
    const mateIds = new Set(seedIds)
    for (const g of groups) {
      if (g.members.some((m) => mateIds.has(m))) {
        for (const m of g.members) mateIds.add(m)
      }
    }
    const pts = [...mateIds]
      .map((id) => nodePositions.get(id))
      .filter((p): p is THREE.Vector3 => !!p)
    if (pts.length === 0) return { target: center, radius }
    const c = pts
      .reduce((acc, p) => acc.add(p.clone()), new THREE.Vector3())
      .multiplyScalar(1 / pts.length)
    // Lean toward the beat's own node: two beats sharing one assembly
    // otherwise frame identically. The assembly stays in frame; the
    // emphasis moves with the lesson.
    const first = nodePositions.get(focusNodeIds[0])
    if (first) c.lerp(first, 0.45)
    let r = 1.2
    for (const p of pts) r = Math.max(r, c.distanceTo(p) + 1.2)
    // Swept-volume margin: joints animate parts ±0.45 and detail
    // builders overhang node bounds, so the rest-pose frame always
    // crops motion and trim. +20% and half a unit covers both without
    // reverting to wide shots.
    r = r * 1.2 + 0.5
    let member = 0.6
    for (const id of mateIds) {
      const n = visibleNodes.find((v) => v.id === id)
      if (n) {
        const e = estimateExtents(n)
        member = Math.max(member, e.hx, e.hy, e.hz)
      }
    }
    return { target: c, radius: Math.min(Math.max(r, member * 2.6), radius) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(focusNodeIds), center, radius])

  return (
    <Canvas
      orthographic={isFlat}
      camera={isFlat ? { position: [0, 0, 10], zoom: 60 } : { position: [5, 5, 5], fov: 42 }}
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
      }}
    >
      <OrbitControls enableZoom={true} enablePan={!isFlat} enableRotate={!isFlat} makeDefault autoRotate={!isFlat && spin} autoRotateSpeed={0.5} enableDamping onStart={() => setSpin(false)} />
      {!isFlat && <SoftShadows size={12} samples={12} focus={0} />}
      <StageRig center={center} radius={radius} sceneKey={sceneKey} bg={safeBg} flat={isFlat} />
      <FocusRig currentBeat={currentBeat} sceneKey={sceneKey} target={focus.target} radius={focus.radius} flat={isFlat} />
      <Stage topY={box.min.y - 0.02} subjectR={radius} bg={safeBg} cx={center.x} cz={center.z} />
      <LightRig center={center} radius={radius} />
      {/* Follow-spot on the active beat: the taught part reads as lit. */}
      {!isFlat && (
        <spotLight
          position={[focus.target.x + 4, focus.target.y + 7, focus.target.z + 5]}
          angle={0.5}
          penumbra={0.8}
          intensity={0.5}
          color="#ffe9c4"
        />
      )}
      <ContactShadows position={[center.x, box.min.y + 0.01, center.z]} scale={Math.max(radius * 5, 12)} far={radius * 2 + 4} resolution={512} blur={2.4} opacity={0.5} color="#2c2418" />
      {!isFlat && <DustMotes center={center} radius={radius} />}
      <Suspense fallback={null}>
        <EnvBoundary fallback={<EnvRig />}>
          {/* Studio reflections, generated locally: three area strips
          over a warm room. No downloads, no flake, product-shot metal. */}
          <Environment resolution={256} frames={1}>
            <color attach="background" args={['#efe6d2']} />
            <Lightformer form="rect" intensity={5} position={[0, 5, -9]} scale={[10, 3, 1]} color="#fff4e0" />
            <Lightformer form="rect" intensity={1.2} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[12, 2, 1]} color="#ffe3c2" />
            <Lightformer form="rect" intensity={0.9} position={[5, 1, 0]} rotation-y={-Math.PI / 2} scale={[12, 2, 1]} color="#dfe8ff" />
            <Lightformer form="circle" intensity={0.6} position={[0, -2, 2]} scale={[6, 3, 1]} color="#c9b896" />
          </Environment>
        </EnvBoundary>
      </Suspense>
      <ClockRig clockRef={clockRef} time={time} playing={playing} />
      {hasNodes
        ? visibleNodes.map((n, i) => (
            <DslNodeMesh
              key={n.id}
              node={n}
              color={PALETTE[i % PALETTE.length]}
              active={activeNodeIds.includes(n.id)}
              isFault={sabotageMode && faultNodeIds.includes(n.id)}
              joints={jointsByNode(n.id)}
              clockRef={clockRef}
              showLabel={labelVisible(n.id)}
              floorY={box.min.y}
            />
          ))
        : beats.map((b, i) => (
            <PartNode
              key={String(b.id)}
              position={positions[i]}
              label={b.part || b.title}
              color={PALETTE[i % PALETTE.length]}
              active={i + 1 === currentBeat}
              isFault={sabotageMode && i + 1 === sabotageBeatIndex}
            />
          ))}
      <CausalLines points={positions} />
      <GroupLabels
        groups={groups}
        positions={nodePositions}
        focusNodeIds={focusNodeIds}
        showAll={showAllLabels}
        faultNodeIds={sabotageMode ? faultNodeIds : []}
      />
      {!isFlat && (
        <EffectComposer multisampling={4}>
          <N8AO halfRes aoRadius={2} intensity={1.2} quality="performance" />
          <Bloom mipmapBlur intensity={0.45} luminanceThreshold={1.0} luminanceSmoothing={0.25} />
          <HueSaturation saturation={0.14} />
          <BrightnessContrast contrast={0.08} />
          <Vignette eskil={false} offset={0.32} darkness={0.35} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
