import React, { useReducer, useCallback, useMemo } from 'react'
import { metaModelAPI } from './api/client'
import { createMutation } from './api/mutations'
import { verifyScene } from './api/verify'
import Scene3D from './components/Scene3D'
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
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.payload }
    case 'ASK_START':
      return { ...state, loading: true, apiError: null }
    case 'ASK_SUCCESS':
      return {
        ...state,
        loading: false,
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
        apiError: action.payload,
        screen: 'ask',
      }
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
      return {
        ...state,
        sabotageMode: true,
        mutation,
        mutatedBecauseOf: mutation.mutatedBecauseOf,
        hiddenNodeIds: mutation.hiddenNodeIds,
        repairStatus: 'idle',
      }
    }
    case 'REPAIR_ATTEMPT': {
      if (!state.mutation) return state
      const correct = action.payload.nodeId === state.mutation.probe.answer
      return { ...state, repairStatus: correct ? 'correct' : 'wrong' }
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

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

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
    apiError,
    mutation,
    mutatedBecauseOf,
    hiddenNodeIds,
    repairStatus,
  } = state

  const beats: Beat[] = sceneData?.beats?.length ? sceneData.beats : []
  const beat = beats[currentBeat - 1] || beats[0]

  const rawSabotageBeat = sceneData?.sabotageBeat
  const sabotageBeatId =
    typeof rawSabotageBeat === 'object' && rawSabotageBeat !== null
      ? (rawSabotageBeat as { id: string }).id
      : rawSabotageBeat
  const sabotageBeatIndex =
    beats.findIndex((b) => String(b.id) === String(sabotageBeatId)) + 1
  const isSabotage = sabotageMode && currentBeat === sabotageBeatIndex
  const lastBeatId = beats.length
  const dslNodes = sceneData?.dsl?.nodes ?? []
  const dslBeats = sceneData?.dsl?.beats
  const currentBeatId = dslBeats?.[currentBeat - 1]?.id
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
  const badgeLabel = sabotageMode
    ? 'Fault'
    : verification?.badge === 'solver'
      ? 'Solver-verified'
      : 'Sketch'

  const handleAsk = useCallback(async () => {
    if (!query.trim()) return
    dispatch({ type: 'ASK_START' })

    try {
      const data = await metaModelAPI.generateScene(query.trim())
      dispatch({ type: 'ASK_SUCCESS', payload: data })
    } catch (err) {
      console.error('[Grasp] API failed:', (err as Error).message)
      dispatch({ type: 'ASK_FAILURE', payload: (err as Error).message })
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
          <div className="flex items-center gap-6">
            <div className="w-2 h-12 bg-b8860b" />
            <div className="text-3xl font-black text-2c2418 tracking-wider leading-none">GRASP</div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-lg font-black text-2c2418 tracking-tighter">00</div>
            <nav className="flex items-center gap-6 text-sm font-bold text-2c2418 uppercase tracking-widest">
              <a href="#" className="hover:text-b8860b transition-colors">Work</a>
              <a href="#" className="hover:text-b8860b transition-colors">Method</a>
              <a href="#" className="hover:text-b8860b transition-colors">About</a>
            </nav>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
          <aside className="w-96 border-r-2 border-c9ba9e bg-f3efe1 flex flex-col z-20">
            <div className="p-10">
              <form onSubmit={(e) => { e.preventDefault(); handleAsk() }} className="relative mb-10">
                <label className="block text-[10px] font-bold text-slate tracking-widest mb-3">Query</label>
                <input
                  type="text"
                  placeholder={screen === 'ask' ? 'What would you like to understand?' : `Ask about ${concept?.title}`}
                  className="input-type w-full py-4 text-lg font-light text-2c2418"
                  value={query}
                  onChange={(e) => dispatch({ type: 'SET_QUERY', payload: e.target.value })}
                  disabled={loading}
                />
                {loading ? (
                  <div className="absolute right-4 top-4 text-[10px] font-bold text-b8860b animate-pulse">Generating…</div>
                ) : (
                  <div className="absolute right-4 top-4 text-[10px] font-bold text-slate">Type · Enter</div>
                )}
                <button
                  type="submit"
                  className="absolute right-4 bottom-3 h-9 px-4 border-2 border-c9ba9e bg-white text-[10px] font-bold text-2c2418 uppercase tracking-widest hover:bg-b8860b hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading || !query.trim()}
                >
                  {loading ? 'Generating…' : 'Go'}
                </button>
              </form>
              {apiError && (
                <div className="mt-3 p-3 border-2 border-a04000 bg-fdeee2 text-[10px] font-bold text-a04000 rounded">
                  API unavailable — {apiError}
                </div>
              )}
              <p className="text-sm text-slate leading-relaxed mt-4 italic">Any mechanism, any concept. Agents reconstruct the causal chain; you learn by repairing what they break.</p>
            </div>

            <div className="p-8 border-t-2 border-c9ba9e mt-auto">
              <button className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-c9ba9e bg-white text-base font-bold text-2c2418 uppercase tracking-widest hover:bg-b8860b hover:text-white transition-all" onClick={() => dispatch({ type: 'RESET' })}>
                <span className="w-3 h-3 bg-b8860b"></span> New world
              </button>
            </div>
          </aside>

          <main className="flex-1 relative bg-f3efe1 flex items-center justify-center p-10">
            {screen === 'ask' && (
              <div className="flex flex-col items-center justify-center h-full text-slate">
                <div className="text-6xl font-black text-2c2418 mb-4">Ask</div>
                <p className="text-xl font-light">Type any concept and watch it become a moving world.</p>
              </div>
            )}
            {screen === 'scene' && (
              <>
                <div className="absolute top-8 right-8 z-40 pointer-events-none">
                  <div className={`inline-flex items-center gap-3 px-4 py-2 border-2 border-a04000 bg-fdeee2 text-[11px] font-bold text-a04000 uppercase tracking-tighter ${sabotageMode ? '' : 'hidden'}`}>
                    <span className="w-3 h-3 bg-a04000 animate-pulse"></span>
                    Fault detected
                  </div>
                </div>

                <div className="absolute top-8 left-8 z-40">
                  <div className="beat-badge">{currentBeat}</div>
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-44 text-[10px] font-bold text-slate uppercase tracking-widest text-center">
                    Beat · {beat?.goal || beat?.title}
                  </div>
                </div>

                <div className="relative w-full max-w-5xl h-[65vh] craft-panel flex items-center justify-center p-8 overflow-hidden">
                  <div className="absolute inset-0 border-2 border-white/40 pointer-events-none" />
                  <Scene3D
                    beats={beats}
                    currentBeat={currentBeat}
                    sabotageBeatIndex={sabotageBeatIndex}
                    sabotageMode={sabotageMode}
                    nodes={dslNodes}
                    activeNodeIds={activeNodeIds}
                    faultNodeIds={faultNodeIds}
                    hiddenNodeIds={hiddenNodeIds}
                    joints={dslJoints}
                    time={beatTime}
                    playing
                    medium={medium}
                  />
                </div>

                <div className="absolute bottom-8 right-8 z-40 flex flex-col items-center justify-end">
                  <input
                    type="range"
                    min={0}
                    max={totalDuration}
                    step={0.1}
                    value={beatTime}
                    className="w-48 range-slider"
                    onChange={(e) => seekToTime(parseFloat(e.target.value))}
                    aria-label="Scrub timeline"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate">0s</span>
                    <div className="w-1 h-1 bg-slate"></div>
                    <span className="text-[10px] font-mono text-slate">{totalDuration}s</span>
                  </div>
                </div>
              </>
            )}
            {screen === 'scene' && (
              <aside className="w-104 border-l-2 border-c9ba9e bg-f3efe1 flex flex-col z-20">
                <div className="p-10">
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
                        <div
                          key={i}
                          className={`spine-node ${isActive ? 'active' : ''} ${isSab ? 'sabotage' : ''} flex items-center gap-3 p-4 craft-panel ${isSab ? 'border-a04000 bg-fdeee2' : ''}`}
                        >
                          <span className={`w-3 h-3 ${isSab ? 'bg-a04000' : 'bg-b8860b'}`}></span>
                          <span className={`text-sm font-bold ${isSab ? 'text-a04000' : 'text-2c2418'}`}>{link.part}</span>
                          <span className={`ml-auto text-[11px] font-bold ${isSab ? 'text-a04000' : isActive ? 'text-b8860b' : 'text-e69f00'}`}>{link.action}</span>
                          {isSab && <span className="text-[10px] font-black text-a04000">Fault</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="p-10 border-t-2 border-c9ba9e">
                  <h3 className="text-[11px] font-bold text-slate uppercase tracking-widest mb-4">Narration</h3>
                  <div className="text-lg text-2c2418 leading-relaxed italic serif fade-in">
                    <span className="drop-cap">{beat?.narration?.[0]}</span>{beat?.narration?.slice(1) || ''}
                  </div>
                  <div className="mt-4 marginalia">{isSabotage ? `Note: The ${beat?.part} beat has a causal fault. Locate the driver.` : 'Follow the causal chain through each beat.'}</div>
                </div>

                <div className="p-10 border-t-2 border-c9ba9e">
                  <h3 className="text-[11px] font-bold text-slate uppercase tracking-widest mb-4">Fault drill</h3>
                  {!sabotageMode ? (
                    <button
                      className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-c9ba9e bg-white text-base font-bold text-2c2418 uppercase tracking-widest hover:bg-b8860b hover:text-white transition-all"
                      onClick={() => dispatch({ type: 'INTRODUCE_FAULT' })}
                    >
                      <span className="w-3 h-3 bg-a04000"></span> Introduce fault
                    </button>
                  ) : mutation ? (
                    <div className="craft-panel p-6 border-a04000 bg-fdeee2">
                      <div className="text-[10px] font-bold text-a04000 uppercase tracking-widest mb-2">
                        {mutation.mutationId} · {mutation.kind.replace('_', ' ')}
                      </div>
                      <div className="text-lg font-bold text-2c2418 mb-4">{mutation.probe.prompt}</div>
                      <div className="space-y-2">
                        {dslNodes.map((n) => (
                          <button
                            key={n.id}
                            className="w-full text-left px-4 py-3 border-2 border-c9ba9e bg-white text-[11px] font-bold text-2c2418 uppercase tracking-widest hover:border-b8860b transition-all"
                            onClick={() => dispatch({ type: 'REPAIR_ATTEMPT', payload: { nodeId: n.id } })}
                          >
                            {n.label}
                          </button>
                        ))}
                      </div>
                      {repairStatus === 'correct' && (
                        <div className="mt-4">
                          <div className="text-[11px] font-bold text-deepGreen uppercase tracking-widest mb-3">Fault located — scene repaired</div>
                          <button className="btn-text w-full" onClick={() => dispatch({ type: 'RESOLVE_FAULT' })}>
                            Restore correct scene
                          </button>
                        </div>
                      )}
                      {repairStatus === 'wrong' && (
                        <div className="mt-4 text-[11px] font-bold text-a04000 uppercase tracking-widest">Not that part — try again</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="mt-auto p-10 border-t-2 border-c9ba9e">
                  {!showMastery ? (
                    <button
                      className="w-full flex items-center justify-center gap-3 px-6 py-4 border-2 border-c9ba9e bg-white text-base font-bold text-2c2418 uppercase tracking-widest hover:bg-b8860b hover:text-white transition-all"
                      onClick={nextBeat}
                    >
                      <span className="w-3 h-3 bg-b8860b"></span>
                      {currentBeat === lastBeatId ? 'Finish' : 'Next'}
                    </button>
                  ) : (
                    <div className="craft-panel p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="w-3 h-3 bg-deepGreen"></span>
                        <span className="text-sm font-bold text-deepGreen uppercase tracking-wider">Teach-back complete</span>
                      </div>
                      <div className="text-3xl font-black text-b8860b font-mono">+{masteryDelta ?? 0}%</div>
                      <div className="mt-3 text-sm text-slate">
                        Your understanding of this mechanism improved by {masteryDelta ?? 0}%.
                      </div>
                      <button className="mt-4 btn-text" onClick={() => dispatch({ type: 'RESET' })}>
                        Try another concept
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            )}
            {screen === 'scene' && (
              <footer className="h-20 border-t-2 border-c9ba9e bg-white/30 flex items-center justify-between px-10 z-30">
                <div className="flex items-center gap-3">
                  <div className="text-[10px] font-bold text-slate uppercase tracking-widest">Pre/post mastery delta</div>
                  <div className="flex items-center gap-3 text-[11px] font-bold text-deepGreen uppercase tracking-tighter">
                    <span className="w-3 h-3 bg-009e73"></span>
                    <span>{badgeLabel}</span>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-b8860b">+{masteryDelta ?? 0}%</div>
                </div>
                <div className="text-[10px] font-mono text-slate uppercase tracking-widest">
                  Beat {currentBeat} of {beats.length} · {medium}
                </div>
              </footer>
            )}
          </main>
        </div>
      </div>
    </>
  )
}
