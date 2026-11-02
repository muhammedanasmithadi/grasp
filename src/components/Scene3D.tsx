import React, { useRef, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { DslNode, DslJoint } from '../types'

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
  const base = isFault ? '#D55E00' : active ? color : '#1a150c'
  return (
    <group position={position}>
      <mesh ref={ref}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial
          color={base}
          emissive={active || isFault ? base : '#000000'}
          emissiveIntensity={active || isFault ? 0.9 : 0}
        />
      </mesh>
      <Html center distanceFactor={8}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#2c2418',
            background: '#fdfaf0',
            border: '1px solid #c9ba9e',
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  )
}

function DslNodeMesh({
  node,
  active,
  isFault,
  color,
  joints,
  clockRef,
}: {
  node: DslNode
  active: boolean
  isFault: boolean
  color: string
  joints: DslJoint[]
  clockRef: React.MutableRefObject<number>
}) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRef = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    if (!groupRef.current || !meshRef.current) return
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
    meshRef.current.scale.set(
      node.transform.s[0] * pulse,
      node.transform.s[1] * pulse,
      node.transform.s[2] * pulse
    )
  })
  const base = isFault ? '#D55E00' : active ? (node.material.tint || color) : '#1a150c'
  return (
    <group
      ref={groupRef}
      position={[node.transform.p[0], node.transform.p[1], node.transform.p[2]]}
      rotation={[node.transform.r[0], node.transform.r[1], node.transform.r[2]]}
    >
      <mesh ref={meshRef} scale={node.transform.s}>
        {node.type === 'cylinder' ? (
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
        ) : node.type === 'plane' ? (
          <planeGeometry args={[1, 1]} />
        ) : (
          <boxGeometry args={[1, 1, 1]} />
        )}
        <meshStandardMaterial
          color={base}
          roughness={node.material.roughness ?? 0.5}
          metalness={node.material.metalness ?? 0.6}
          emissive={active || isFault ? base : '#000000'}
          emissiveIntensity={active || isFault ? 0.9 : 0}
        />
      </mesh>
      <Html center distanceFactor={8}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#2c2418',
            background: '#fdfaf0',
            border: '1px solid #c9ba9e',
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}
        >
          {node.label}
        </div>
      </Html>
    </group>
  )
}

function CausalLines({ points }: { points: THREE.Vector3[] }) {
  if (points.length < 2) return null
  const flat: number[] = []
  points.forEach((p) => flat.push(p.x, p.y, p.z))
  return <Line points={flat} color="#c9ba9e" linewidth={2} dashed={true} dashScale={0.8} />
}

function Ground() {
  return (
    <>
      <gridHelper args={[12, 12, 0x2c2418, 0x2c2418]} position={[0, -1.2, 0]} />
      <mesh>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#1a150c" transparent opacity={0.3} />
      </mesh>
    </>
  )
}

interface Scene3DProps {
  beats: { id: string | number; title: string; part: string }[]
  currentBeat: number
  rpm: number
  gravity: number
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
}

export default function Scene3D({
  beats,
  currentBeat,
  rpm,
  gravity,
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

  return (
    <Canvas
      orthographic={isFlat}
      camera={isFlat ? { position: [0, 0, 10], zoom: 60 } : { position: [5, 5, 5], fov: 45 }}
      shadows
    >
      <OrbitControls enableZoom={true} enablePan={false} enableRotate={!isFlat} />
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-3, 5, 3]} intensity={0.6} castShadow />
      <Ground />
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
