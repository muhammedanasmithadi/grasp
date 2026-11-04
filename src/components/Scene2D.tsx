import React from 'react'
import {
  layoutDiagram,
  cardLabel,
  CARD_W,
  CARD_H,
  type DiagramNode,
  type DiagramEdge,
} from './diagramLayout'

interface Scene2DProps {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  activeNodeId?: string | null
  faultNodeId?: string | null
  /** True when edges are teaching sequence, not claimed causality. */
  sequential?: boolean
  onSelect?: (nodeId: string) => void
}

/**
 * Structured 2D diagram. Draws exactly the edges it is given — no
 * invented relationships — with a layered layout that supports
 * branches. The viewBox grows with the graph, so any supported beat
 * count fits without clipping; labels truncate with full text on hover.
 */
export default function Scene2D({
  nodes,
  edges,
  activeNodeId = null,
  faultNodeId = null,
  sequential = false,
  onSelect,
}: Scene2DProps) {
  if (nodes.length === 0) return null
  const { placed, width, height } = layoutDiagram(nodes, edges)
  const byId = new Map(placed.map((p) => [p.id, p]))
  const cy = (p: { y: number }): number => p.y + CARD_H / 2
  return (
    <div className="w-full h-full overflow-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        style={{ minWidth: 560 }}
        role="img"
        aria-label={sequential ? '2D teaching sequence' : '2D causal diagram'}
      >
        <defs>
          <marker id="arr2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8" fill="none" stroke="#c9ba9e" strokeWidth="1.5" />
          </marker>
          <marker id="arr2-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8" fill="none" stroke="#b8860b" strokeWidth="2" />
          </marker>
          <filter id="card-shadow2" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#2c2418" floodOpacity="0.25" />
          </filter>
        </defs>
        {Array.from({ length: Math.ceil(height / 34) }).map((_, r) =>
          Array.from({ length: Math.ceil(width / 36) }).map((_, c) => (
            <circle key={`${r}-${c}`} cx={20 + c * 36} cy={20 + r * 34} r="1.2" fill="#2c2418" opacity="0.10" />
          ))
        )}
        <style>{`.flow2 { stroke-dasharray: 6 4; animation: flowdash2 1s linear infinite; } @keyframes flowdash2 { to { stroke-dashoffset: -10; } }`}</style>
        {edges.map((e, i) => {
          const a = byId.get(e.from)
          const b = byId.get(e.to)
          if (!a || !b) return null
          const active = e.from === activeNodeId || e.to === activeNodeId
          const x1 = a.x + CARD_W
          const x2 = b.x
          const y1 = cy(a)
          const y2 = cy(b)
          const mx = (x1 + x2) / 2
          return (
            <g key={`e-${i}`}>
              <path
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={active ? '#b8860b' : '#c9ba9e'}
                strokeWidth={active ? 2.5 : 1.5}
                className={active ? 'flow2' : undefined}
                strokeDasharray={active ? undefined : '6 4'}
                markerEnd={active ? 'url(#arr2-active)' : 'url(#arr2)'}
              />
              <text
                x={mx}
                y={(y1 + y2) / 2 - 6}
                textAnchor="middle"
                fontSize="10"
                fontStyle="italic"
                fill="#6b5e4a"
              >
                {e.rel}
              </text>
            </g>
          )
        })}
        {placed.map((p) => {
          const active = p.id === activeNodeId
          const isFault = p.id === faultNodeId
          const stroke = isFault ? '#a04000' : active ? '#b8860b' : '#c9ba9e'
          return (
            <g
              key={p.id}
              filter={active || isFault ? 'url(#card-shadow2)' : undefined}
              onClick={onSelect ? () => onSelect(p.id) : undefined}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <title>{p.label}</title>
              <rect
                x={p.x}
                y={p.y}
                width={CARD_W}
                height={CARD_H}
                fill={isFault ? '#fdeee2' : active ? '#fdf6e7' : '#fdfaf0'}
                stroke={stroke}
                strokeWidth={active || isFault ? 3 : 2}
              />
              {active && !isFault && <rect x={p.x} y={p.y} width={CARD_W} height={4} fill="#b8860b" />}
              <text
                x={p.x + CARD_W / 2}
                y={p.y + 24}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12.5"
                fontWeight="700"
                fill={isFault ? '#a04000' : '#2c2418'}
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {cardLabel(p.label)}
              </text>
              {p.sub && (
                <text x={p.x + CARD_W / 2} y={p.y + 42} textAnchor="middle" fontSize="9.5" fontStyle="italic" fill="#6b5e4a">
                  {cardLabel(p.sub, 30)}
                </text>
              )}
              {isFault && (
                <text x={p.x + CARD_W / 2} y={p.y - 10} textAnchor="middle" fontSize="10" fontWeight="900" fill="#a04000">
                  FAULT
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
