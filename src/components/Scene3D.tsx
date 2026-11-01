import React, { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'

const COLORS = {
  crankshaft: '#b8860b',
  connectingRod: '#e69f00',
  piston: '#009e73',
  camshaft: '#009e73',
  valve: '#a04000',
}

/** Cached world positions so CausalLines can draw between parts. */
const positions = {
  crankPin: new THREE.Vector3(-1.92, -0.6, 0),
  pistonPin: new THREE.Vector3(1.0, -0.6, 0),
  valve: new THREE.Vector3(3.1, -0.6, 0),
}

/** Rotating crankshaft with a crank pin on its edge. */
function Crankshaft({ rpm, active, sabotage }: { rpm: number; active: boolean; sabotage: boolean }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.z += (delta * (rpm / 60)) * Math.PI * 2

    // Track crank pin world position
    const pinLocal = new THREE.Vector3(0.28, 0, 0)
    pinLocal.applyMatrix4(ref.current.matrixWorld)
    positions.crankPin.copy(pinLocal)
  })
  return (
    <group ref={ref} position={[-2.2, -0.6, 0]}>
      <mesh>
        <cylinderGeometry args={[0.22, 0.22, 1.2]} />
        <meshStandardMaterial
          color={active ? COLORS.crankshaft : '#1a150c'}
          emissive={active ? COLORS.crankshaft : '#000000'}
          emissiveIntensity={active ? 1 : 0}
        />
      </mesh>
      <mesh position={[0.28, 0, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={sabotage ? COLORS.valve : COLORS.crankshaft} />
      </mesh>
    </group>
  )
}

/** Connecting rod: pinned to crank pin on one end, piston pin on the other. */
function ConnectingRod({ active }: { active: boolean }) {
  const ref = useRef<THREE.Mesh>(null!)
  const rodLength = 1.2
  const crankRadius = 0.28

  useFrame((state, delta) => {
    if (!ref.current) return

    const pinX = positions.crankPin.x
    const pinY = positions.crankPin.y

    // Reconstruct crank angle from pin position
    const theta = Math.atan2(pinY, pinX)

    const sinTheta = Math.sin(theta)
    const underRoot = rodLength * rodLength - crankRadius * crankRadius * sinTheta * sinTheta
    const pistonX = crankRadius * Math.cos(theta) + Math.sqrt(Math.max(0, underRoot))

    positions.pistonPin.set(pistonX, 0, 0)

    const mx = (pinX + pistonX) / 2
    const my = (pinY + 0) / 2
    const dist = Math.hypot(pistonX - pinX, 0 - pinY)
    const angle = Math.atan2(0 - pinY, pistonX - pinX)

    ref.current.position.set(mx, my, 0)
    ref.current.rotation.z = angle
    ref.current.scale.set(1, dist / 1.6, 1)
  })

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.06, 1.6, 0.06]} />
      <meshStandardMaterial
        color={active ? COLORS.connectingRod : '#1a150c'}
        emissive={active ? COLORS.connectingRod : '#000000'}
      />
    </mesh>
  )
}

/** Piston: translates back and forth along the X axis. */
function Piston({ active }: { active: boolean }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    if (ref.current) {
      ref.current.position.copy(positions.pistonPin)
    }
  })
  return (
    <mesh ref={ref} position={positions.pistonPin}>
      <boxGeometry args={[0.9, 1.4, 0.6]} />
      <meshStandardMaterial
        color={active ? COLORS.piston : '#1a150c'}
        emissive={active ? COLORS.piston : '#000000'}
      />
    </mesh>
  )
}

/** Camshaft: rotating with an eccentric lobe at half crank speed. */
function Camshaft({ rpm, active }: { rpm: number; active: boolean }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.z += (delta * (rpm / 60)) * Math.PI * 2 * 0.5
  })
  return (
    <group ref={ref} position={[2.6, -0.6, 0]}>
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 0.9]} />
        <meshStandardMaterial color={active ? COLORS.camshaft : '#1a150c'} />
      </mesh>
      <mesh position={[0.22, 0, 0]}>
        <boxGeometry args={[0.5, 0.18, 0.5]} />
        <meshStandardMaterial color="#a04000" />
      </mesh>
    </group>
  )
}

/** Valve: lifts when the cam lobe pushes it. */
function Valve({ rpm, active, sabotage }: { rpm: number; active: boolean; sabotage: boolean }) {
  const ref = useRef<THREE.Mesh>(null!)
  const [lift, setLift] = useState(0)

  useFrame((state, delta) => {
    if (!ref.current) return

    // Track cam angle (half crank speed) for lobe timing
    // We approximate cam angle from time since we don't have access to crank angle here
    const camAngle = (state as any).elapsedTime * (rpm / 60) * Math.PI
    const lobePush = Math.max(0, Math.sin(camAngle))
    const push = sabotage ? -lobePush : lobePush
    const newLift = push * 0.5

    setLift(newLift)
    ref.current.position.y = newLift
    ref.current.scale.z = 1 + newLift * 0.3

    positions.valve.set(3.1, -0.6 + newLift, 0)
  })
  return (
    <group position={[3.1, -0.6, 0]}>
      <mesh ref={ref}>
        <boxGeometry args={[0.12, 0.6, 0.12]} />
        <meshStandardMaterial color={active ? COLORS.valve : '#1a150c'} />
      </mesh>
      <mesh position={[0, -0.45, 0]}>
        <boxGeometry args={[0.14, 0.1, 0.14]} />
        <meshStandardMaterial color="#1a150c" />
      </mesh>
    </group>
  )
}

/** Draws dashed causal connection line from crank → rod → piston → cam → valve. */
function CausalLines() {
  const points = [
    -2.2, -0.6, 0,
    -1.92, -0.6, 0,
    1.0, -0.6, 0,
    2.6, -0.6, 0,
    3.1, -0.6, 0,
  ]

  return <Line points={points} color="#c9ba9e" linewidth={2} dashed={true} dashScale={0.8} />
}

/** Ground plane + grid. */
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
}

export default function Scene3D({
  beats,
  currentBeat,
  rpm,
  gravity,
  sabotageBeatIndex,
  sabotageMode,
}: Scene3DProps) {
  const isSabotage = sabotageMode && currentBeat === sabotageBeatIndex
  const activeBeat = beats[currentBeat - 1]

  return (
    <Canvas camera={{ position: [5, 5, 5], fov: 45 }} shadows>
      <OrbitControls enableZoom={true} enablePan={false} />
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-3, 5, 3]} intensity={0.6} castShadow />
      <Ground />

      <Crankshaft rpm={rpm} active={currentBeat === 1} sabotage={isSabotage} />
      <ConnectingRod active={currentBeat === 2} />
      <Piston active={currentBeat >= 4} />
      <Camshaft rpm={rpm} active={currentBeat === 3} />
      <Valve rpm={rpm} active={currentBeat === 3} sabotage={isSabotage} />
      <CausalLines />
    </Canvas>
  )
}
