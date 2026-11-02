import React, { useRef, useEffect, useMemo, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html, Gltf } from '@react-three/drei'
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

function useTubeGeometry(path: [number, number, number][] | undefined, radius: number) {
  return useMemo(() => {
    if (!path || path.length < 2) return null
    const pts = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
    const curve = new THREE.CatmullRomCurve3(pts)
    return new THREE.TubeGeometry(curve, 32, radius, 12, false)
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
}: {
  node: DslNode
  active: boolean
  isFault: boolean
  color: string
  joints: DslJoint[]
  clockRef: React.MutableRefObject<number>
  showLabel: boolean
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
  const base = isFault ? '#D55E00' : node.material.tint || color
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
        <Suspense fallback={null}>
          <Gltf src={node.geometry!.url!} scale={node.transform.s} castShadow />
        </Suspense>
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
            roughness={node.material.roughness ?? 0.5}
            metalness={node.material.metalness ?? 0.6}
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
          roughness={node.material.roughness ?? 0.5}
          metalness={node.material.metalness ?? 0.6}
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
  useEffect(() => {
    if (flat) return
    const dir = new THREE.Vector3(1, 0.62, 1.25).normalize()
    const dist = Math.max(radius * 2.6, 7)
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
      <fog attach="fog" args={[bg, near, far]} />
    </>
  )
}

/** Key with fitted shadows, cool fill, warm hemisphere bounce. */
function LightRig({ center, radius }: { center: THREE.Vector3; radius: number }) {
  const r = Math.max(radius, 4)
  const keyPos = useMemo(
    () => center.clone().add(new THREE.Vector3(r * 0.9, r * 1.4, r * 0.7)),
    [center, radius]
  )
  const fillPos = useMemo(
    () => center.clone().add(new THREE.Vector3(-r * 1.2, r * 0.5, -r * 0.9)),
    [center, radius]
  )
  return (
    <>
      <hemisphereLight args={['#fffaf0', '#9a8f78', 0.55]} />
      <directionalLight
        position={keyPos}
        intensity={1.7}
        color="#fff1dc"
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

/** Invisible plane that catches soft shadows so parts sit in space. */
function ShadowCatcher({
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
  const s = Math.max(size * 8, 24)
  return (
    <mesh rotation-x={-Math.PI / 2} position={[cx, y, cz]} receiveShadow>
      <planeGeometry args={[s, s]} />
      <shadowMaterial opacity={0.22} color="#1a150c" />
    </mesh>
  )
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
  const box = useMemo(() => {
    const b = new THREE.Box3()
    positions.forEach((p) => b.expandByPoint(p))
    if (b.isEmpty()) b.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 2, 4))
    return b
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(positions.map((p) => p.toArray()))])
  const center = useMemo(() => box.getCenter(new THREE.Vector3()), [box])
  const size = useMemo(() => box.getSize(new THREE.Vector3()), [box])
  const radius = Math.max(size.x, size.y, size.z) / 2
  const bg = backdrop ?? DEFAULT_BACKDROP
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
        gl.toneMappingExposure = 1.15
      }}
    >
      <OrbitControls enableZoom={true} enablePan={!isFlat} enableRotate={!isFlat} makeDefault />
      <StageRig center={center} radius={radius} sceneKey={sceneKey} bg={bg} flat={isFlat} />
      <LightRig center={center} radius={radius} />
      <ShadowCatcher y={box.min.y - 0.02} size={radius} cx={center.x} cz={center.z} />
      <EnvRig />
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
    </Canvas>
  )
}
