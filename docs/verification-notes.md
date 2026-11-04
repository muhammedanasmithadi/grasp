# Verification notes (checked against 6687768, Nov 2026)

| # | Finding | Status |
|---|---------|--------|
| 1 | Layout rows/resizes parts independently; parent metadata unused by renderer | Confirmed (`layout.ts` row + per-part band; `Scene3D` maps siblings) |
| 2 | Joints decorative; anchors not pivots; gears/sliders unlinked | Confirmed (`Scene3D` DslNodeMesh rotates node centers, slider `sin(omega)` on own node) |
| 3 | Quality scores proxies; best-below-threshold returned silently | Confirmed (`quality.ts`; `client.ts` returns best) |
| 4 | Solver badge from fixed formula, not rendered dims | Confirmed (`verify.ts` unit r/L constants) |
| 5 | Layout silently deletes wide "stage" nodes | Confirmed (`layout.ts` isAuthoredStage + filter) |
| 6 | All geometry args capped alike (sphere segments 32->6); cylinder 2-arg ambiguity | Confirmed (`sceneCode.ts:299-323`) |
| 7 | Causal lines = node array order; adapter invents "drives" chain | Confirmed (`Scene3D` CausalLines; `parser.ts`) |
| 8 | 2D fixed viewBox clips 8 cards; sequential only | Confirmed (`Scene2D.tsx` W=880) |
| 9 | Research brief called "verified facts", ungrounded | Confirmed (`client.ts:170`) |
| 10 | Keyword hero injection into first group | Confirmed (`hero.ts`, `parser.ts`) |
| 11 | HDRI/camera accepted, unused | Partially changed: HDRI dropped earlier for local studio env; camera shots still unused |
| 12 | Mutation kinds unreachable; shiftedJointIds unconsumed | Confirmed (`mutations.ts` first-match return; no renderer consumer) |
| 13 | VITE_ key shipped to browsers | Confirmed (`client.ts`) |
| 14 | verify.sh tests implementation, not correctness | Confirmed (`scripts/pipeline-check.ts`) |

Fix strategy per AGENTS.md (types -> validator -> UI): honest labels,
no silent deletion, normalized geometry, assembly-preserving layout,
explicit edges, one real crank-slider template, server-side API proxy.
