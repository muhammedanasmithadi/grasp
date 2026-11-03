import React, { useReducer, useState, useCallback, useMemo } from 'react'
import { Effect } from 'effect'
import { metaModelAPI } from './api/client'
import { createMutation } from './api/mutations'
import { verifyScene } from './api/verify'
import Scene3D from './components/Scene3D'
import Scene2D from './components/Scene2D'
import type { AppState, AppAction, SceneData, Beat } from './types'

const initialState: AppState = {
  screen: 'ask',
  query: '',
  concept: null,
  sceneData: null,
  currentBeat: 1,
  sabotageMode: false,
  showMastery: false,
  masteryDelta: null,
  loading: false,
  apiError: null,
  mutation: null,
  mutatedBecauseOf: {},
  hiddenNodeIds: [],
  repairStatus: 'idle',
  stage: null,
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload }
    case 'ASK_START':
      return { ...state, loading: true, apiError: null, stage: 'research' as const }
    case 'SET_STAGE':
      return { ...state, stage: action.payload }
    case 'ASK_SUCCESS':
      return {
        ...state,
        loading: false,
        stage: null,
        concept: {
          title: action.payload.title,
          id: Date.now().toString(),
          query: state.query,
        },
        sceneData: action.payload,
        screen: 'scene',
        currentBeat: 1,
        sabotageMode: false,
        showMastery: false,
        masteryDelta: null,
        mutation: null,
        mutatedBecauseOf: {},
        hiddenNodeIds: [],
        repairStatus: 'idle',
      }
    case 'ASK_FAILURE':
      return {
        ...state,
        loading: false,
        stage: null,
        apiError: action.payload,
        screen: 'ask',
      }
    case 'DISMISS_ERROR':
      return { ...state, apiError: null }
    case 'NEXT_BEAT':
      return { ...state, currentBeat: Math.min(state.currentBeat + 1, state.sceneData?.beats?.length ?? state.currentBeat + 1) }
    case 'SET_BEAT':
      return { ...state, currentBeat: action.payload }
    case 'FINISH':
      return { ...state, showMastery: true }
    case 'TOGGLE_SABOTAGE':
      return { ...state, sabotageMode: !state.sabotageMode }
    case 'INTRODUCE_FAULT': {
      if (!state.sceneData?.dsl) return state
      const mutation = createMutation(
        state.sceneData.dsl,
        state.sceneData.dsl.concept.question
      )
      if (!mutation) return state
      // Jump to the sabotaged beat: breakage appears only in drill
      // context, never over a beat the student is still learning.
      const drillIdx =
        state.sceneData.dsl.beats.findIndex((b) => b.id === mutation.beatId) + 1
      return {
        ...state,
        sabotageMode: true,
        mutation,
        mutatedBecauseOf: mutation.mutatedBecauseOf,
        hiddenNodeIds: mutation.hiddenNodeIds,
        repairStatus: 'idle',
        currentBeat: drillIdx > 0 ? drillIdx : state.currentBeat,
      }
    }
    case 'REPAIR_ATTEMPT': {
      if (!state.mutation) return state
      const correct = action.payload.nodeId === state.mutation.probe.answer
      return {
        ...state,
        repairStatus: correct ? 'correct' : 'wrong',
        masteryDelta: correct ? (state.masteryDelta ?? 0) + 10 : (state.masteryDelta ?? 0),
      }
    }
    case 'RESOLVE_FAULT':
      return {
        ...state,
        sabotageMode: false,
        mutatedBecauseOf: {},
        hiddenNodeIds: [],
        repairStatus: 'idle',
      }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

function BeatQuiz({ prompt, answer }: { prompt: string; answer: string }) {
  const [open, setOpen] = useState(false)
  if (!prompt) return null
  return (
    <div className="mt-6 border-t-2 border-c9ba9e pt-4">
      <div className="text-[11px] font-bold text-slate uppercase tracking-widest mb-2">Check yourself</div>
      <div className="text-sm font-bold text-2c2418 mb-3">{prompt}</div>
      {!open ? (
        <button className="btn-text" onClick={() => setOpen(true)}>
          Reveal the driver
        </button>
      ) : (
        <div className="text-sm font-bold text-deepGreen uppercase tracking-wider">{answer}</div>
      )}
    </div>
  )
}

/** Guided fault drill: 4 focused choices (answer + 3 distractors),
 * not a dump of every node. Distractors prefer other spotlighted parts. */
function DrillPanel({
  dslNodes,
  probeAnswer,
  prompt,
  kind,
  mutationId,
  repairStatus,
  onPick,
  onRestore,
}: {
  dslNodes: { id: string; label: string }[]
  probeAnswer: string
  prompt: string
  kind: string
  mutationId: string
  repairStatus: 'idle' | 'correct' | 'wrong'
  onPick: (nodeId: string) => void
  onRestore: () => void
}) {
  const options = useMemo(() => {
    const answer = dslNodes.find((n) => n.id === probeAnswer)
    // Distinct labels only: two nodes can share a word, but the four
    // choices must read differently or the drill is unfair.
    const rest = dslNodes.filter((n) => n.id !== probeAnswer && n.label.toLowerCase() !== answer?.label.toLowerCase())
    // Deterministic order: answer first, then others; rotate by answer
    // length so the correct choice is not always on top.
    const ordered = answer ? [answer, ...rest.slice(0, 3)] : rest.slice(0, 4)
    const shift = probeAnswer.length % Math.max(ordered.length, 1)
    return [...ordered.slice(shift), ...ordered.slice(0, shift)]
  }, [dslNodes, probeAnswer])
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <div className="craft-panel p-6 border-a04000 bg-fdeee2">
      <div className="text-[10px] font-bold text-a04000 uppercase tracking-widest mb-2">
        {mutationId} · {kind.replace('_', ' ')} · step 1 of 2: find it
      </div>
      <div className="text-lg font-bold text-2c2418 mb-1">Something is missing from the scene.</div>
      <div className="text-sm text-2c2418 mb-4">{prompt}</div>
      <div className="space-y-2">
        {options.map((n) => {
          const isRight = repairStatus === 'correct' && n.id === probeAnswer
          const isWrongPick = repairStatus === 'wrong' && picked === n.id
          return (
            <button
              key={n.id}
              className={`w-full text-left px-4 py-3 border-2 bg-white text-[11px] font-bold uppercase tracking-widest transition-all ${isRight ? 'border-009e73 text-009e73' : isWrongPick ? 'border-a04000 text-a04000' : 'border-c9ba9e text-2c2418 hover:border-b8860b'}`}
              onClick={() => { setPicked(n.id); onPick(n.id) }}
            >
              {isRight ? '✓ ' : ''}{n.label}
            </button>
          )
        })}
      </div>
      {repairStatus === 'correct' && (
        <div className="mt-4">
          <div className="text-[11px] font-bold text-deepGreen uppercase tracking-widest mb-1">Fault located — step 2 of 2</div>
          <div className="text-sm text-2c2418 mb-3">You found the missing driver. Restore the correct scene to lock in +10%.</div>
          <button className="btn-text w-full" onClick={onRestore}>
            Restore correct scene
          </button>
        </div>
      )}
      {repairStatus === 'wrong' && (
        <div className="mt-4 text-[11px] font-bold text-a04000 uppercase tracking-widest">Not that part — look for the hole in the chain, try again</div>
      )}
    </div>
  )
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [railTab, setRailTab] = useState<'spine' | 'read' | 'repair'>('spine')

  const {
    screen,
    query,
    concept,
    sceneData,
    currentBeat,
    sabotageMode,
    showMastery,
    masteryDelta,
    loading,
    stage,
    apiError,
    mutation,
    mutatedBecauseOf,
    hiddenNodeIds,
    repairStatus,
  } = state

  const beats: Beat[] = sceneData?.beats?.length ? sceneData.beats : []
  const beat = beats[currentBeat - 1] || beats[0]

  const lastBeatId = beats.length
  const dslNodes = sceneData?.dsl?.nodes ?? []
  const dslBeats = sceneData?.dsl?.beats
  const currentBeatId = dslBeats?.[currentBeat - 1]?.id
  // The drilled beat comes from the live mutation, not the stored
  // sabotageBeat slot.
  const sabotageBeatIndex =
    (dslBeats?.findIndex((b) => b.id === mutation?.beatId) ?? -1) + 1
  const isSabotage = sabotageMode && !!mutation && currentBeatId === mutation.beatId
  // Fault visuals apply only on the drilled beat. Every other beat
  // renders the correct scene even mid-drill: broken is for testing,
  // never for teaching.
  const onDrillBeat = isSabotage
  const shownHiddenNodeIds = onDrillBeat ? hiddenNodeIds : []
  const displayedBecauseOf =
    (sabotageMode &&
      currentBeatId &&
      mutatedBecauseOf[currentBeatId]) ||
    dslBeats?.[currentBeat - 1]?.becauseOf ||
    []
  const activeNodeIds = displayedBecauseOf
  const faultBeatId = mutation?.beatId
  const faultNodeIds =
    sabotageMode && faultBeatId && mutatedBecauseOf[faultBeatId]
      ? mutatedBecauseOf[faultBeatId]
      : sabotageMode && mutation
        ? [mutation.probe.answer]
        : sabotageMode && dslBeats?.[sabotageBeatIndex - 1]?.becauseOf
          ? dslBeats[sabotageBeatIndex - 1].becauseOf
          : []
  const shownFaultNodeIds = onDrillBeat ? faultNodeIds : []
  const dslJoints = sceneData?.dsl?.joints ?? []
  const beatTime = dslBeats?.[currentBeat - 1]?.t?.[0] ?? (currentBeat - 1) * 6
  const totalDuration = dslBeats?.length
    ? dslBeats[dslBeats.length - 1]?.t?.[1] ?? dslBeats.length * 6
    : beats.length * 6
  const seekToTime = useCallback(
    (t: number) => {
      if (!dslBeats?.length) {
        return
      }
      let idx = dslBeats.findIndex((b) => t >= b.t[0] && t < b.t[1])
      if (idx === -1) idx = t >= totalDuration ? dslBeats.length - 1 : 0
      dispatch({ type: 'SET_BEAT', payload: idx + 1 })
    },
    [dslBeats, totalDuration]
  )
  const medium = sceneData?.dsl?.concept?.medium ?? '3d'
  const verification = useMemo(
    () => (sceneData?.dsl ? verifyScene(sceneData.dsl) : null),
    [sceneData]
  )
  const badgeLabel = onDrillBeat
    ? 'Fault'
    : verification?.badge === 'solver'
      ? 'Solver-verified'
      : 'Sketch'

  const handleAsk = useCallback(async () => {
    if (!query.trim()) return
    dispatch({ type: 'ASK_START' })

    try {
      const data = await Effect.runPromise(
        metaModelAPI.generateScene(query.trim(), (s) =>
          dispatch({ type: 'SET_STAGE', payload: s })
        )
      )
      dispatch({ type: 'ASK_SUCCESS', payload: data })
    } catch (err) {
      const msg = (err as Error).message
      // Flat dead-ends become diagrams: one guided second attempt that
      // instructs medium 2d. The original error stands if it fails too.
      if (/E_MEDIUM_MISMATCH|E_HERO_DULL/.test(msg)) {
        try {
          const data2 = await Effect.runPromise(
            metaModelAPI.generateScene(
              `${query.trim()} (present this as a flat 2D diagram: medium 2d, labeled cards joined by arrows, no 3D parts or joints)`,
              (s) => dispatch({ type: 'SET_STAGE', payload: s })
            )
          )
          dispatch({ type: 'ASK_SUCCESS', payload: data2 })
          return
        } catch {
          // fall through to the original error below
        }
      }
      console.error('[Grasp] API failed:', msg)
      dispatch({ type: 'ASK_FAILURE', payload: msg })
    }
  }, [query])

  const nextBeat = useCallback(() => {
    if (currentBeat < lastBeatId) {
      dispatch({ type: 'NEXT_BEAT' })
    } else {
      dispatch({ type: 'FINISH' })
    }
  }, [currentBeat, lastBeatId])

  return (
    <>
      <div className="fixed inset-0 z-0" style={{ background: '#f3efe1' }}>
        <div className="paper-grain" />
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(184,134,11,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 70%, rgba(47,74,61,0.06) 0%, transparent 50%)' }} />
      </div>

      <div className="relative z-10 flex flex-col h-screen w-screen overflow-hidden">
        <header className="h-20 w-full border-b-2 border-c9ba9e bg-f3efe1 flex items-center justify-between px-10 z-30 shrink-0">
          <div className="text-3xl font-black text-2c2418 tracking-wider leading-none">GRASP</div>
          {screen === 'scene' && (
            <button className="flex items-center gap-3 px-6 py-3 border-2 border-c9ba9e bg-white text-sm font-bold text-2c2418 uppercase tracking-widest hover:bg-b8860b hover:text-white transition-all" onClick={() => dispatch({ type: 'RESET' })}>
              <span className="w-3 h-3 bg-b8860b"></span> New world
            </button>
          )}
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          <main className={`flex-1 min-w-0 bg-f3efe1 flex p-6 lg:p-8 overflow-y-auto ${screen === 'ask' ? 'items-center justify-center' : 'flex-col gap-4'}`}>
            {screen === 'ask' && (
              <div className="flex flex-col items-center justify-center h-full w-full max-w-xl text-slate">
                <div className="text-6xl font-black text-2c2418 mb-4">Ask</div>
                <p className="text-xl font-light mb-10 text-center">Type any concept and watch it become a moving world.</p>
                <form onSubmit={(e) => { e.preventDefault(); handleAsk() }} className="w-full mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-[10px] font-bold text-slate tracking-widest">Query</label>
                    {loading ? (
                      <div className="text-[10px] font-bold text-b8860b animate-pulse">{stage === 'research' ? 'Researching mechanism…' : 'Building world…'}</div>
                    ) : (
                      <div className="text-[10px] font-bold text-slate">Type · Enter</div>
                    )}
                  </div>
                  <div className="flex gap-2 items-stretch">
                    <textarea
                      rows={3}
                      placeholder="What would you like to understand?"
                      className="input-type flex-1 min-w-0 py-3 text-lg font-light text-2c2418 resize-none"
                      value={query}
                      onChange={(e) => dispatch({ type: 'SET_QUERY', payload: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleAsk()
                        }
                      }}
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      className="px-5 border-2 border-b8860b bg-b8860b text-xs font-bold text-white uppercase tracking-widest hover:bg-2c2418 hover:border-2c2418 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={loading || !query.trim()}
                    >
                      {loading ? (stage === 'research' ? 'Researching…' : 'Building…') : 'Go'}
                    </button>
                  </div>
                </form>
                {apiError && (
                  <div className="mt-3 p-3 border-2 border-a04000 bg-fdeee2 text-[10px] font-bold text-a04000 rounded w-full flex items-center gap-3">
                    <span className="flex-1">API unavailable — {apiError}{/E_MEDIUM_MISMATCH|E_HERO_DULL|E_TRUNCATED|E_BEAT_COUNT|E_SPINE_DUP|E_GROUP_REQUIRED|E_TUBE_SPRAWL/.test(apiError) ? ' Try rephrasing with moving 3D parts.' : ''}</span>
                    {/E_MEDIUM_MISMATCH|E_HERO_DULL|E_TRUNCATED|E_BEAT_COUNT|E_SPINE_DUP|E_GROUP_REQUIRED|E_TUBE_SPRAWL/.test(apiError) ? (
                      <button
                        className="shrink-0 px-4 py-2 border-2 border-a04000 bg-white text-a04000 uppercase tracking-widest hover:bg-a04000 hover:text-white transition-all"
                        onClick={() => {
                          dispatch({ type: 'DISMISS_ERROR' })
                          document.querySelector('textarea')?.focus()
                        }}
                      >
                        Edit query
                      </button>
                    ) : (
                      <button
                        className="shrink-0 px-4 py-2 border-2 border-a04000 bg-white text-a04000 uppercase tracking-widest hover:bg-a04000 hover:text-white transition-all disabled:opacity-50"
                        onClick={handleAsk}
                        disabled={loading || !query.trim()}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}
                <p className="text-sm text-slate leading-relaxed mt-4 italic text-center">Any mechanism, any concept. Agents reconstruct the causal chain; you learn by repairing what they break.</p>
              </div>
            )}
            {screen === 'scene' && (
              <>
                <div className="flex items-center gap-4 shrink-0 flex-wrap">
                  <div className="beat-badge">{currentBeat}</div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate uppercase tracking-widest">Beat {currentBeat} of {beats.length}</div>
                    <div className="text-lg font-bold text-2c2418 truncate">{beat?.goal || beat?.title}</div>
                  </div>
                  <div className={`ml-auto inline-flex items-center gap-3 px-4 py-2 border-2 border-a04000 bg-fdeee2 text-[11px] font-bold text-a04000 uppercase tracking-tighter ${onDrillBeat ? '' : 'hidden'}`}>
                    <span className="w-3 h-3 bg-a04000 animate-pulse"></span>
                    Fault detected
                  </div>
                </div>

                <div className="relative w-full flex-1 min-h-[50vh] craft-panel overflow-hidden">
                  <div className="absolute inset-0 border-2 border-white/40 pointer-events-none" />
                  {medium === '2d' ? (
                    <Scene2D
                      items={beats}
                      currentBeat={currentBeat}
                      sabotageBeatIndex={sabotageBeatIndex}
                      sabotageMode={sabotageMode}
                      faultPart={beats[sabotageBeatIndex - 1]?.part ?? null}
                    />
                  ) : (
                    <Scene3D
                      beats={beats}
                      currentBeat={currentBeat}
                      sabotageBeatIndex={sabotageBeatIndex}
                      sabotageMode={sabotageMode}
                      nodes={dslNodes}
                      activeNodeIds={activeNodeIds}
                      faultNodeIds={shownFaultNodeIds}
                      hiddenNodeIds={shownHiddenNodeIds}
                      joints={dslJoints}
                      groups={sceneData?.dsl?.groups ?? []}
                      time={beatTime}
                      playing
                      medium={medium}
                      backdrop={sceneData?.dsl?.theme?.backdrop}
                      focusNodeIds={[...activeNodeIds, ...faultNodeIds]}
                      sceneKey={concept?.id ?? 'scene'}
                    />
                  )}
                </div>
              </>
            )}
          </main>
          {screen === 'scene' && (
            <aside className="w-80 shrink-0 border-l-2 border-c9ba9e bg-f3efe1 flex flex-col z-20 min-h-0">
              <div className="shrink-0 flex border-b-2 border-c9ba9e" role="tablist" aria-label="Detail panels">
                {(['spine', 'read', 'repair'] as const).map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={railTab === tab}
                    onClick={() => setRailTab(tab)}
                    className={`flex-1 px-4 py-3 text-[11px] font-bold uppercase tracking-widest border-r-2 border-c9ba9e last:border-r-0 transition-all ${railTab === tab ? 'bg-2c2418 text-f3efe1' : 'bg-transparent text-slate hover:bg-white'}`}
                  >
                    {tab === 'spine' ? 'Spine' : tab === 'read' ? 'Read' : 'Repair'}
                    {tab === 'repair' && sabotageMode && <span className="ml-2 inline-block w-2 h-2 bg-a04000 animate-pulse"></span>}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
              {railTab === 'spine' && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[11px] font-bold text-slate uppercase tracking-widest">Causal spine</h3>
                    <span className={`inline-flex items-center gap-2 px-3 py-1 border-2 ${sabotageMode ? 'border-a04000 bg-fdeee2 text-a04000' : verification?.badge === 'solver' ? 'border-009e73 bg-009e73/5 text-009e73' : 'border-c9ba9e bg-white text-slate'} text-[10px] font-bold uppercase tracking-tighter`}>{badgeLabel}</span>
                  </div>
                  <div className="space-y-4">
                    {(sceneData?.causalSpine ?? beats.map((b, i) => ({
                      part: b.part || `part-${i}`,
                      action: i < beats.length - 1 ? 'drives' : 'completes',
                      nextPart: beats[i + 1]?.part || 'end',
                    }))).map((link, i) => {
                      const isActive = i + 1 === currentBeat
                      const isSab = sabotageMode && currentBeat === sabotageBeatIndex && i === sabotageBeatIndex - 1
                      return (
                        <button
                          key={i}
                          onClick={() => dispatch({ type: 'SET_BEAT', payload: i + 1 })}
                          className={`spine-node ${isActive ? 'active' : ''} ${isSab ? 'sabotage' : ''} flex items-center gap-2 p-3 craft-panel w-full text-left cursor-pointer hover:border-b8860b transition-all ${isSab ? 'border-a04000 bg-fdeee2' : ''}`}
                          aria-label={`Go to beat ${i + 1}: ${link.part}`}
                        >
                          <span className={`w-3 h-3 shrink-0 ${isSab ? 'bg-a04000' : 'bg-b8860b'}`}></span>
                          <span className={`text-[13px] font-bold ${isSab ? 'text-a04000' : 'text-2c2418'}`}>{link.part}</span>
                          <span className={`ml-auto text-[11px] font-bold ${isSab ? 'text-a04000' : isActive ? 'text-b8860b' : 'text-e69f00'}`}>{link.action}</span>
                          {isSab && <span className="text-[10px] font-black text-a04000">Fault</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {railTab === 'read' && (
                <div className="p-6">
                  <h3 className="text-[11px] font-bold text-slate uppercase tracking-widest mb-4">Narration</h3>
                  <div className="text-lg text-2c2418 leading-relaxed italic serif fade-in">
                    <span className="drop-cap">{beat?.narration?.[0]}</span>{beat?.narration?.slice(1) || ''}
                  </div>
                  <div className="mt-4 marginalia">{isSabotage ? `Note: The ${beat?.part} beat has a causal fault. Locate the driver.` : 'Follow the causal chain through each beat.'}</div>
                  <div className="mt-6">
                    <div className="text-[11px] font-bold text-slate uppercase tracking-widest mb-3">How it chains together</div>
                    <ol className="space-y-2">
                      {beats.map((bb, i) => (
                        <li key={String(bb.id)}>
                          <button
                            onClick={() => dispatch({ type: 'SET_BEAT', payload: i + 1 })}
                            className={`w-full text-left flex items-baseline gap-2 px-3 py-2 border-2 transition-all ${i + 1 === currentBeat ? 'border-b8860b bg-white' : 'border-c9ba9e bg-transparent hover:border-b8860b'}`}
                          >
                            <span className="text-[11px] font-black text-b8860b">{i + 1}</span>
                            <span className="text-[13px] font-bold text-2c2418">{bb.part}</span>
                            <span className="text-xs font-light text-slate truncate">{bb.goal}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <BeatQuiz
                    key={currentBeat}
                    prompt={dslBeats?.[currentBeat - 1]?.probe.prompt ?? ''}
                    answer={dslNodes.find((n) => n.id === dslBeats?.[currentBeat - 1]?.probe.answer)?.label ?? dslBeats?.[currentBeat - 1]?.probe.answer ?? ''}
                  />
                </div>
              )}
              {railTab === 'repair' && (
                <div className="p-6">
                  <h3 className="text-[11px] font-bold text-slate uppercase tracking-widest mb-4">Fault drill</h3>
                  {!sabotageMode ? (
                    <button
                      className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-c9ba9e bg-white text-base font-bold text-2c2418 uppercase tracking-widest hover:bg-b8860b hover:text-white transition-all"
                      onClick={() => { dispatch({ type: 'INTRODUCE_FAULT' }); setRailTab('repair') }}
                    >
                      <span className="w-3 h-3 bg-a04000"></span> Introduce fault
                    </button>
                  ) : mutation ? (
                    <DrillPanel
                      dslNodes={dslNodes}
                      probeAnswer={mutation.probe.answer}
                      prompt={mutation.probe.prompt}
                      kind={mutation.kind}
                      mutationId={mutation.mutationId}
                      repairStatus={repairStatus}
                      onPick={(nodeId) => dispatch({ type: 'REPAIR_ATTEMPT', payload: { nodeId } })}
                      onRestore={() => dispatch({ type: 'RESOLVE_FAULT' })}
                    />
                  ) : null}
                </div>
              )}
              </div>
              </aside>
            )}
        </div>
          {screen === 'scene' && (
            <footer className="shrink-0 border-t-2 border-c9ba9e bg-f3efe1 px-6 py-3 z-30 flex items-center gap-4 overflow-x-auto">
              <div className="flex items-center gap-2 shrink-0">
                {beats.map((b, i) => (
                  <button
                    key={String(b.id)}
                    onClick={() => dispatch({ type: 'SET_BEAT', payload: i + 1 })}
                    className={`w-8 h-8 text-xs font-black border-2 transition-all ${i + 1 === currentBeat ? 'border-b8860b bg-b8860b text-white' : 'border-c9ba9e bg-white text-2c2418 hover:border-b8860b'}`}
                    aria-label={`Go to beat ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={totalDuration}
                step={0.1}
                value={beatTime}
                className="flex-1 min-w-32 range-slider"
                onChange={(e) => seekToTime(parseFloat(e.target.value))}
                aria-label="Scrub timeline"
              />
              <div className="text-[10px] font-mono text-slate uppercase tracking-widest whitespace-nowrap">0s · {totalDuration}s</div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-tighter whitespace-nowrap">
                <span className="w-3 h-3 bg-009e73"></span>
                <span>{badgeLabel}</span>
              </div>
              <div className="text-[11px] font-mono font-bold text-b8860b whitespace-nowrap">+{masteryDelta ?? 0}%</div>
              <div className="text-[10px] font-mono text-slate uppercase tracking-widest whitespace-nowrap">
                Beat {currentBeat} of {beats.length} · {medium}
              </div>
              {!showMastery ? (
                <button
                  className="ml-auto shrink-0 flex items-center gap-3 px-6 py-2 border-2 border-b8860b bg-b8860b text-sm font-bold text-white uppercase tracking-widest hover:bg-2c2418 hover:border-2c2418 transition-all"
                  onClick={nextBeat}
                >
                  <span className="w-3 h-3 bg-white"></span>
                  {currentBeat === lastBeatId ? 'Finish' : 'Next'}
                </button>
              ) : (
                <div className="ml-auto shrink-0 flex items-center gap-3">
                  <span className="text-[11px] font-bold text-deepGreen uppercase tracking-widest">Teach-back complete +{masteryDelta ?? 0}%</span>
                  <button className="btn-text" onClick={() => dispatch({ type: 'RESET' })}>
                    Try another concept
                  </button>
                </div>
              )}
            </footer>
          )}
      </div>
    </>
  )
}
