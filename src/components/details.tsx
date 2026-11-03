// src/components/details.tsx
// Parametric detail pass. Lone primitives read as programmer art; real
// objects have handles, rims, teeth, stems, and trim. These builders
// match on part words and add small compound geometry in the node's
// local frame, so every organ arrives designed, not extruded.
// Sizes derive from estimateExtents: details fit the part by construction.

import { useMemo } from 'react'
import * as THREE from 'three'
import type { DslNode } from '../types'
import { estimateExtents } from '../api/layout'

function shade(tint: string, k: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(tint)
  if (!m) return tint
  const v = (i: number): string =>
    Math.round(Math.min(255, Math.max(0, parseInt(m[1].slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')
  return `#${v(0)}${v(2)}${v(4)}`
}

function P({
  color,
  metalness,
  roughness,
  emissive,
  emissiveIntensity,
  geo,
}: {
  color: string
  metalness?: number
  roughness?: number
  emissive?: string
  emissiveIntensity?: number
  geo: React.ReactNode
}) {
  return (
    <mesh castShadow>
      {geo}
      <meshStandardMaterial
        color={color}
        metalness={metalness ?? 0.6}
        roughness={roughness ?? 0.45}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity ?? 0}
      />
    </mesh>
  )
}

// Lathe profile for turned parts (cups, bells, mouthpieces).
function latheGeo(profile: Array<[number, number]>, segments = 32): THREE.LatheGeometry {
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(x, 0.001), y))
  return new THREE.LatheGeometry(pts, segments)
}

function Helix({ r, h, turns, tube, color, metalness }: { r: number; h: number; turns: number; tube: number; color: string; metalness: number }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = []
    const n = turns * 16
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const a = t * turns * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r, t * h, Math.sin(a) * r))
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, tube, 6, false)
  }, [r, h, turns, tube])
  return (
    <mesh castShadow geometry={geo} position={[0, -h / 2, 0]}>
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.35} />
    </mesh>
  )
}

export function DetailFor({ node }: { node: DslNode }): React.ReactElement | null {
  const hay = `${node.label} ${node.id}`.toLowerCase()
  const has = (...words: string[]): boolean => words.some((w) => hay.includes(w))
  const tint = node.material.tint || '#b8860b'
  const metal = node.material.metalness ?? 0.6
  const { hx, hy, hz } = estimateExtents(node)
  const dark = shade(tint, 0.62)
  const darker = shade(tint, 0.4)

  if (has('valve', 'tap', 'faucet', 'spigot')) {
    const stemH = hy * 0.9
    return (
      <group>
        <P color={dark} metalness={metal} geo={<cylinderGeometry args={[hx * 0.22, hx * 0.3, stemH, 16]} />} />
        <group position={[0, hy + stemH * 0.45, 0]}>
          <P color={darker} metalness={metal} geo={<boxGeometry args={[hx * 1.7, hy * 0.28, hy * 0.34]} />} />
          <P color={darker} metalness={metal} geo={<sphereGeometry args={[hx * 0.85, 10, 10]} />} />
        </group>
        <P color={darker} metalness={metal} geo={<sphereGeometry args={[hy * 0.22, 10, 10]} />} />
      </group>
    )
  }
  if (has('spring', 'coil')) {
    return <Helix r={hx * 0.55} h={hy * 1.6} turns={6} tube={Math.max(hx * 0.09, 0.03)} color={tint} metalness={Math.max(metal, 0.7)} />
  }
  if (has('lens', 'glass', 'eye', 'window', 'screen')) {
    return (
      <group>
        <P color={dark} metalness={Math.max(metal, 0.7)} geo={<torusGeometry args={[hx * 0.8, Math.max(hx * 0.12, 0.04), 12, 32]} />} />
        <mesh>
          <circleGeometry args={[hx * 0.78, 32]} />
          <meshPhysicalMaterial color="#cfe4ef" roughness={0.05} metalness={0} transmission={0.85} ior={1.5} transparent opacity={0.5} />
        </mesh>
      </group>
    )
  }
  if (has('bulb', 'bead', 'lamp', 'light', 'led', 'glow', 'filament')) {
    return (
      <group>
        <P color={tint} metalness={0.1} roughness={0.3} emissive={tint} emissiveIntensity={1.6} geo={<sphereGeometry args={[hx * 0.55, 20, 20]} />} />
        <P color={darker} metalness={metal} geo={<cylinderGeometry args={[hx * 0.35, hx * 0.45, hy * 0.4, 16]} />} />
      </group>
    )
  }
  if (has('gear', 'cog', 'pinion', 'sprocket')) {
    const teeth = 8
    return (
      <group>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[hx * 0.8, hx * 0.8, hy * 0.5, 24]} />
          <meshStandardMaterial color={tint} metalness={metal} roughness={0.4} />
        </mesh>
        {Array.from({ length: teeth }).map((_, i) => {
          const a = (i / teeth) * Math.PI * 2
          return (
            <mesh key={i} castShadow position={[Math.cos(a) * hx * 0.9, Math.sin(a) * hx * 0.9, 0]} rotation={[0, 0, a]}>
              <boxGeometry args={[hx * 0.3, hx * 0.22, hy * 0.5]} />
              <meshStandardMaterial color={tint} metalness={metal} roughness={0.4} />
            </mesh>
          )
        })}
        <P color={dark} metalness={metal} geo={<cylinderGeometry args={[hx * 0.28, hx * 0.28, hy * 0.7, 14]} />} />
      </group>
    )
  }
  if (has('mouthpiece', 'cup', 'funnel', 'nozzle', 'horn', 'bell', 'trumpet', 'trombone')) {
    const flared = has('bell', 'horn', 'trumpet', 'trombone')
    const geo = useMemo(
      () =>
        flared
          ? latheGeo([[hx * 0.25, -hy], [hx * 0.3, -hy * 0.3], [hx * 0.5, hy * 0.4], [hx * 1.1, hy]])
          : latheGeo([[hx * 0.3, -hy], [hx * 0.55, -hy * 0.2], [hx * 0.7, hy * 0.6], [hx * 0.62, hy]]),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [hx, hy]
    )
    void flared
    return (
      <mesh castShadow geometry={geo}>
        <meshStandardMaterial color={tint} metalness={Math.max(metal, 0.65)} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
    )
  }
  if (has('wheel', 'tire', 'tyre', 'rotor', 'pulley')) {
    const spokes = 5
    return (
      <group>
        <P color={dark} metalness={metal} geo={<cylinderGeometry args={[hx * 0.25, hx * 0.25, hz * 1.2, 16]} />} />
        {Array.from({ length: spokes }).map((_, i) => {
          const a = (i / spokes) * Math.PI * 2
          return (
            <mesh key={i} castShadow position={[Math.cos(a) * hx * 0.55, Math.sin(a) * hx * 0.55, 0]} rotation={[0, 0, a + Math.PI / 2]}>
              <boxGeometry args={[hx * 0.16, hx * 0.85, hz * 0.5]} />
              <meshStandardMaterial color={tint} metalness={metal} roughness={0.4} />
            </mesh>
          )
        })}
      </group>
    )
  }
  if (has('grille', 'grill', 'vent', 'speaker', 'radiator')) {
    return (
      <group>
        {[-0.45, -0.15, 0.15, 0.45].map((f, i) => (
          <mesh key={i} castShadow position={[0, f * hy, hz * 0.5]}>
            <boxGeometry args={[hx * 1.5, hy * 0.14, hy * 0.1]} />
            <meshStandardMaterial color={i % 2 ? dark : darker} metalness={metal} roughness={0.5} />
          </mesh>
        ))}
      </group>
    )
  }
  if (has('switch', 'slider', 'lever', 'trigger', 'handle')) {
    return (
      <group>
        <P color={darker} metalness={metal} geo={<sphereGeometry args={[hx * 0.3, 12, 12]} />} />
        <group rotation={[0, 0, -0.5]}>
          <mesh castShadow position={[0, hy * 0.7, 0]}>
            <cylinderGeometry args={[hx * 0.12, hx * 0.16, hy * 1.3, 10]} />
            <meshStandardMaterial color={tint} metalness={metal} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0, hy * 1.35, 0]}>
            <sphereGeometry args={[hx * 0.22, 12, 12]} />
            <meshStandardMaterial color={tint} metalness={0.2} roughness={0.35} />
          </mesh>
        </group>
      </group>
    )
  }
  if (has('key') && !has('keyboard')) {
    return (
      <group position={[0, hy * 0.9, 0]}>
        <P color={dark} metalness={Math.max(metal, 0.75)} geo={<torusGeometry args={[hx * 0.45, Math.max(hx * 0.13, 0.03), 10, 24]} />} />
      </group>
    )
  }
  if (has('pin') && !has('lightning') && !has('spin')) {
    return (
      <group position={[0, hy * 0.9, 0]}>
        <P color={shade(tint, 1.15)} metalness={Math.max(metal, 0.7)} geo={<sphereGeometry args={[hx * 0.5, 12, 12]} />} />
      </group>
    )
  }
  if (has('knob', 'dial', 'button', 'cap', 'lid', 'cover', 'plug', 'stopper')) {
    return (
      <group>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[hx * 0.85, Math.max(hy * 0.12, 0.03), 10, 28]} />
          <meshStandardMaterial color={dark} metalness={metal} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[hx * 0.45, hy * 0.9, 0]}>
          <boxGeometry args={[hx * 0.18, hy * 0.22, hy * 0.2]} />
          <meshStandardMaterial color={darker} metalness={metal} roughness={0.5} />
        </mesh>
      </group>
    )
  }

  // Generic trim: every plain housing gets a kick plate, every plain
  // shaft gets collar rings. Cheap, universal, kills the extruded look.
  if (node.type === 'box') {
    return (
      <group position={[0, -hy * 0.94, 0]}>
        <mesh castShadow>
          <boxGeometry args={[hx * 2.04, Math.max(hy * 0.12, 0.04), hz * 2.04]} />
          <meshStandardMaterial color={darker} metalness={metal} roughness={0.55} />
        </mesh>
      </group>
    )
  }
  if (node.type === 'cylinder' || node.type === 'capsule') {
    const rim = Math.max(hx * 0.07, 0.02)
    return (
      <group>
        <mesh castShadow position={[0, hy * 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[hx * 0.92, rim, 8, 24]} />
          <meshStandardMaterial color={dark} metalness={metal} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[0, -hy * 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[hx * 0.92, rim, 8, 24]} />
          <meshStandardMaterial color={dark} metalness={metal} roughness={0.4} />
        </mesh>
      </group>
    )
  }
  return null
}
