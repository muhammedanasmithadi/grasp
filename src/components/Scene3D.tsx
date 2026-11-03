import React, { useRef, useEffect, useMemo, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html, useGLTF, Environment } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, HueSaturation, BrightnessContrast } from '@react-three/postprocessing'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { DslNode, DslJoint } from '../types'

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

import { getGrainTexture, getMapTexture, getGroundTexture } from './procedural'

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
          emissiveIntensity={active || isFault ? 0.9 : 0}
        />
      </mesh>
      <Html center distanceFactor={8} occlude zIndexRange={[20, 0]}>
        <div style={LABEL_STYLE}>
          {label}
        </div>
      </Html>
    </group>
  )
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
    const k = 3 / maxDim
    group.scale.set(scale[0] * k, scale[1] * k, scale[2] * k)
    return group
  }, [gltf, scale])
  return <primitive object={obj} />
}

function useTubeGeometry(path: [number, number, number][] | undefined, radius: number) {
  return useMemo(() => {
    if (!path || path.length < 2) return null
    const pts = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    return makeTaperedTube(pts, radius)
  }, [path ? JSON.stringify(path) : '', radius])
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

function GeometryFor({ node }: { node: import('../types').DslNode }) {
  const g = node.geometry ?? {}
  const args = g.args
  switch (node.type) {
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
        const span = j.range[1] - j.range[0]
        const amp = span / 2
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
  const bigBright = (() => {
    const a = node.geometry?.args
    const num = (i: number): number =>
      (Array.isArray(a) ? Math.abs(Number(a[i]) || 0) : 0) *
      Math.abs(node.transform.s[i])
    // Largest face dimension: boxes use all three axes, planes and
    // circles their width. Anything 10+ units across is stage, not
    // subject, whatever way it faces (floors and backdrop walls alike).
    const face =
      node.type === 'box'
        ? Math.max(num(0), num(1), num(2))
        : node.type === 'plane' || node.type === 'circle'
          ? num(0)
          : 0
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
    : groundSafeTint(node.material.tint || color, bigBright)
  const isTube = node.type === 'tube'
  const tubeGeo = useTubeGeometry(
    node.type === 'tube' ? (node.geometry?.path as [number, number, number][] | undefined) : undefined,
    node.geometry?.radius ?? 0.15
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
            map={node.material.map ? getMapTexture(node.material.map) : undefined}
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
            emissiveIntensity={active || isFault ? 0.9 : 0}
          />
        </mesh>
      ) : (
      <mesh ref={meshRef} scale={node.transform.s} castShadow>
        <GeometryFor node={node} />
        <meshPhysicalMaterial
          color={base}
          map={node.material.map ? getMapTexture(node.material.map) : undefined}
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
          emissiveIntensity={active || isFault ? 0.9 : 0}
        />
      </mesh>
      )}
      {showLabel && (
      <Html center distanceFactor={10} occlude zIndexRange={[20, 0]}>
        <div style={LABEL_STYLE}>
          {node.label}
        </div>
      </Html>
      )}
    </group>
  )
}

function CausalLines({ points }: { points: THREE.Vector3[] }) {
  if (points.length < 2) return null
  const flat: number[] = []
  points.forEach((p) => flat.push(p.x, p.y, p.z))
  return <Line points={flat} color="#c9ba9e" linewidth={2} dashed={true} dashScale={0.8} />
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
    const dir = new THREE.Vector3(1, 0.62, 1.25).normalize()
    const dist = Math.max(radius * 3.0, 8)
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

function groundSafeTint(tint: string, isGround: boolean): string {
  const hex = expandHex(tint)
  if (!isGround || !hex) return tint
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum <= 0.8) return tint
  const mix = (c: number, t: number): number =>
    Math.round((c * 0.35 + t * 0.65) * 255)
  const toHex = (v: number): string => v.toString(16).padStart(2, '0')
  return `#${toHex(mix(r, 0.72))}${toHex(mix(g, 0.67))}${toHex(mix(b, 0.55))}`
}

/** Textured stage floor that receives real shadows. The model may lay
 * its own planes on top; this guarantees the world never floats in a void. */
function Ground({
  y,
  size,
  cx,
  cz,
}: {
  y: number
  size: number
  cx: number
  cz: number
}) {
  const s = Math.max(size * 16, 44)
  return (
    <mesh rotation-x={-Math.PI / 2} position={[cx, y, cz]} receiveShadow>
      <planeGeometry args={[s, s]} />
      <meshStandardMaterial map={getGroundTexture()} roughness={0.95} metalness={0} envMapIntensity={0.35} />
    </mesh>
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

const DEFAULT_HDRI =
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/lythwood_room_1k.hdr'

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
  time?: number
  playing?: boolean
  medium?: '3d' | '2d' | 'hybrid'
  backdrop?: string
  hdri?: string
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
  time = 0,
  playing = true,
  medium = '3d',
  backdrop,
  hdri,
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
  const showAllLabels = focusNodeIds.length === 0
  const labelVisible = (id: string) => showAllLabels || focusNodeIds.includes(id)

  return (
    <Canvas
      orthographic={isFlat}
      camera={isFlat ? { position: [0, 0, 10], zoom: 60 } : { position: [5, 5, 5], fov: 42 }}
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.9
      }}
    >
      <OrbitControls enableZoom={true} enablePan={!isFlat} enableRotate={!isFlat} makeDefault autoRotate={!isFlat && spin} autoRotateSpeed={0.5} enableDamping onStart={() => setSpin(false)} />
      <StageRig center={center} radius={radius} sceneKey={sceneKey} bg={safeBg} flat={isFlat} />
      <LightRig center={center} radius={radius} />
      <Ground y={box.min.y - 0.02} size={radius} cx={center.x} cz={center.z} />
      {!isFlat && <DustMotes center={center} radius={radius} />}
      <Suspense fallback={null}>
        <EnvBoundary fallback={<EnvRig />}>
          <Environment files={hdri ?? DEFAULT_HDRI} />
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
      {!isFlat && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
          <HueSaturation saturation={0.14} />
          <BrightnessContrast contrast={0.08} />
          <Vignette eskil={false} offset={0.3} darkness={0.5} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
