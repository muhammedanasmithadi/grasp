// src/components/diagramLayout.ts
// Pure layered layout for the 2D diagram. Nodes are parts, edges are
// explicit relationships (from the DSL) — teaching order never invents
// edges. With no edges, callers pass sequential "next in lesson" edges
// and the diagram is a line, honestly labelled as sequence.
//
// Layout: depth = longest path from a root (a node with no incoming
// edge). Nodes sharing a depth stack vertically. Branches therefore
// stay branches. The viewBox is computed from the placed nodes, so
// 3, 8, or 30 nodes all fit; nothing is clipped by a fixed canvas.

export interface DiagramNode {
  id: string;
  label: string;
  sub?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  rel: string;
}

export interface PlacedNode extends DiagramNode {
  x: number;
  y: number;
  depth: number;
}

export const CARD_W = 176;
export const CARD_H = 64;
const GAP_X = 84;
const GAP_Y = 30;
const PAD = 48;

export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[]
): { placed: PlacedNode[]; width: number; height: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    incoming.get(e.to)!.push(e.from);
    outgoing.get(e.from)!.push(e.to);
  }
  // Longest-path depth, with a cycle guard (visited set per walk).
  const depthOf = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    if (depthOf.has(id)) return depthOf.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const preds = incoming.get(id) ?? [];
    const d = preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => compute(p, seen)));
    depthOf.set(id, d);
    return d;
  };
  for (const n of nodes) compute(n.id, new Set());
  // No edges at all: a teaching sequence, one depth per node.
  if (edges.length === 0) {
    nodes.forEach((n, i) => depthOf.set(n.id, i));
  }
  const columns = new Map<number, DiagramNode[]>();
  for (const n of nodes) {
    const d = depthOf.get(n.id) ?? 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(n);
  }
  const maxCol = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const height = Math.max(360, PAD * 2 + maxCol * CARD_H + (maxCol - 1) * GAP_Y);
  const maxDepth = Math.max(0, ...[...columns.keys()]);
  const width = PAD * 2 + (maxDepth + 1) * CARD_W + maxDepth * GAP_X;
  const placed: PlacedNode[] = [];
  for (const [depth, col] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    const colHeight = col.length * CARD_H + (col.length - 1) * GAP_Y;
    const y0 = (height - colHeight) / 2;
    col.forEach((n, i) => {
      placed.push({
        ...n,
        depth,
        x: PAD + depth * (CARD_W + GAP_X),
        y: y0 + i * (CARD_H + GAP_Y),
      });
    });
  }
  return { placed, width, height };
}

/** Truncate for card display; full text rides in a <title> for hover. */
export function cardLabel(label: string, max = 24): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
