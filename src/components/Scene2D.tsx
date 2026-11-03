import React from 'react'

interface Scene2DProps {
  items: { id: string | number; title: string; part: string }[]
  currentBeat: number
  sabotageBeatIndex: number
  sabotageMode: boolean
  faultPart?: string | null
}

const W = 880
const H = 420
const CARD_W = 150
const CARD_H = 64

export default function Scene2D({
  items,
  currentBeat,
  sabotageBeatIndex,
  sabotageMode,
  faultPart = null,
}: Scene2DProps) {
  if (items.length === 0) return null
  const gap = items.length > 1 ? (W - 80 - items.length * CARD_W) / (items.length - 1) : 0
  const y = H / 2 - CARD_H / 2
  const xs = items.map((_, i) => 40 + i * (CARD_W + Math.max(gap, 24)))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      role="img"
      aria-label="2D causal diagram"
    >
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke="#c9ba9e" strokeWidth="1.5" />
        </marker>
        <marker id="arr-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke="#b8860b" strokeWidth="2" />
        </marker>
        <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#2c2418" floodOpacity="0.25" />
        </filter>
      </defs>
      {/* blueprint dot grid */}
      {Array.from({ length: 12 }).map((_, r) =>
        Array.from({ length: 24 }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={20 + c * 36} cy={20 + r * 34} r="1.2" fill="#2c2418" opacity="0.10" />
        ))
      )}
      <style>{`.flow-active { stroke-dasharray: 6 4; animation: flowdash 1s linear infinite; } @keyframes flowdash { to { stroke-dashoffset: -10; } }`}</style>
      {[60, 140, 220, 300, 360].map((gy) => (
        <line key={gy} x1="0" y1={gy} x2={W} y2={gy} stroke="#2c2418" strokeOpacity="0.06" strokeWidth="1" />
      ))}
      {items.slice(0, -1).map((_, i) => {
        const active = i + 1 === currentBeat || i + 2 === currentBeat
        return (
          <line
            key={`e-${i}`}
            x1={xs[i] + CARD_W}
            y1={H / 2}
            x2={xs[i + 1]}
            y2={H / 2}
            stroke={active ? '#b8860b' : '#c9ba9e'}
            strokeWidth={active ? 2.5 : 1.5}
            className={active ? 'flow-active' : undefined}
            strokeDasharray={active ? undefined : '6 4'}
            markerEnd={active ? 'url(#arr-active)' : 'url(#arr)'}
          />
        )
      })}
      {items.map((b, i) => {
        const active = i + 1 === currentBeat
        const done = i + 1 < currentBeat
        const isFault = sabotageMode && (faultPart ? b.part === faultPart : i + 1 === sabotageBeatIndex)
        const stroke = isFault ? '#a04000' : active ? '#b8860b' : done ? '#009e73' : '#c9ba9e'
        return (
          <g key={String(b.id)} filter={active || isFault ? 'url(#card-shadow)' : undefined}>
            <rect
              x={xs[i]}
              y={y}
              width={CARD_W}
              height={CARD_H}
              fill={isFault ? '#fdeee2' : active ? '#fdf6e7' : '#fdfaf0'}
              stroke={stroke}
              strokeWidth={active || isFault ? 3 : 2}
            />
            {active && !isFault && (
              <rect x={xs[i]} y={y} width={CARD_W} height={4} fill="#b8860b" />
            )}
            {done && !isFault && (
              <rect x={xs[i]} y={y} width={CARD_W} height={4} fill="#009e73" />
            )}
            <text
              x={xs[i] + CARD_W / 2}
              y={y + 22}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="13"
              fontWeight="700"
              fill={isFault ? '#a04000' : '#2c2418'}
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {(b.part || b.title).slice(0, 18)}
            </text>
            <text
              x={xs[i] + CARD_W / 2}
              y={y + 40}
              textAnchor="middle"
              fontSize="9.5"
              fontStyle="italic"
              fill="#6b5e4a"
            >
              {(b.title || '').slice(0, 26)}
            </text>
            <text
              x={xs[i] + CARD_W / 2}
              y={y + CARD_H + 16}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill={done ? '#009e73' : '#6b5e4a'}
            >
              {done ? '✓ ' : ''}{String(i + 1).padStart(2, '0')}
            </text>
            {isFault && (
              <text
                x={xs[i] + CARD_W / 2}
                y={y - 10}
                textAnchor="middle"
                fontSize="10"
                fontWeight="900"
                fill="#a04000"
              >
                FAULT
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
