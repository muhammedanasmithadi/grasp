# Grasp agent workflow (pstack, adapted for OpenCode)

Solo builder. Smallest change that solves the problem. Verify against the real artifact.

## Playbooks

Investigation: read the code first. Never guess a file's contents.
1. Locate with glob/grep. 2. Read the exact lines. 3. State the discrepancy with file:line.

Feature: types first, validator second, UI last.
1. Extend `src/types.ts`. 2. Add named-error validation. 3. Wire the UI. 4. Run `bash scripts/verify.sh`.

Refactor: behavior first.
1. Keep the passing build green. 2. Move code without changing output. 3. Re-run verify.

Bug fix: root cause, not symptom.
1. Reproduce via the real artifact (page, build, parser). 2. Trace to the DAG edge or schema boundary. 3. Fix there. 4. Add a named error if a new failure mode was found.

Docs/spec: spec edit and code change land together, or neither lands.

## Principles

Laziness: bias to deletion. Model the domain: causal DAG plus flat DSL, no scattered conditionals. Boundary discipline: guards at system boundaries (schema, API args); trust internal types. Type discipline: illegal states unrepresentable. Prove it works: verify against rendered motion or real API output, not "it compiles". Fix root causes: wrong beat traces to the DAG edge. Sequence verifiable units: one task per turn, verify before the next. Test behavior, not implementation: probes assert learner actions, not DSL internals. Build the lever: the mutation engine generates wrongness plus answer keys. Encode lessons in structure: slop rules are lints, not prose.

## Model routing

Code edits: fast code model. Hardest judgment calls: strongest judgment model. Prose and judgment: judgment model. Verification passes: swarm worker model. Fresh subagents with consolidated scope; resume only when state is costly to move.

## Verification gates (blocking)

Run `bash scripts/verify.sh` before every commit. It runs `tsc --noEmit`, `vite build`, and the named-error lint (every `throw` in `src/api` must carry an `E_*` code). A failing gate blocks render and blocks commit.

## Writing rules

Short declarative sentences. One thought per sentence. No long-dash character. No mid-sentence colon except before a list. Every claim carries its evidence: measured, inferred, or guess. Never fabricate links. Comments only for non-obvious why.
