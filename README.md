# Grasp

A visual concept forge: ask a question, get an interactive explanation.

## Representations (honest by construction)

- **Interactive model** — code-owned mechanism templates (currently:
  crank-slider) with validated geometry and unit-tested kinematics.
- **Diagram** — structured 2D graph with explicit part nodes and
  explicit relationship edges; teaching order stays separate.
- **Illustrative** — model-proposed schematic, clearly labelled. Not
  mechanically validated, never called solver- or source-verified.

The model proposes; code routes, validates, and labels. Model output
can never grant itself verification or a template.

## Run locally

```bash
cp .env.example .env   # fill in META_API_KEY (server-side only)
npm install
npm run server         # API proxy on :8787 (holds the key)
npm run dev            # Vite on :5176, proxies /api -> :8787
```

Open http://localhost:5176/. The browser only ever calls `/api/chat`
on its own origin; the Meta key never reaches the client bundle.

Without a key, the server answers `E_NO_API_KEY` and the app shows an
actionable error. Tests never need a key.

## Verify

```bash
bash scripts/verify.sh   # tsc + build + pipeline e2e + server check + lint
```

Deterministic fixtures cover assembly preservation, reference
integrity, geometry normalization, honest badges, crank-slider
kinematics across the cycle, 2D layout (3/5/8+ nodes, branching, long
labels), and server proxy behavior against a mock upstream.

## Deploy

Build `dist/`, serve it and `server/index.mjs` behind one origin
(any reverse proxy). Set `META_API_KEY` in the server environment.
Implemented abuse controls: per-IP rate limit (30/min), request-size
cap, upstream timeout, safe error bodies. Not implemented: user
authentication — add it before public exposure if quota matters.

**Key rotation:** any key previously shipped as `VITE_META_API_KEY`
in a deployed bundle is exposed by design. Rotate it and use only
the server-side `META_API_KEY`.
