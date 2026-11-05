// server/index.mjs
// Grasp API proxy. The Meta API key lives here, server-side only, read
// from META_API_KEY (never a VITE_ variable, never shipped to browsers).
// The frontend calls POST /api/chat on its own origin; Vite proxies
// /api to this server in development. In production, serve dist/ and
// this process behind the same origin (or any reverse proxy).
//
// Run: META_API_KEY=... node server/index.mjs   (PORT default 8787)

import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.META_API_KEY || process.env.VITE_META_API_KEY || "";
const API_BASE = (process.env.META_API_BASE || "https://api.meta.ai/v1").replace(/\/$/, "");
const MODEL = process.env.META_MODEL || "muse-spark-1.3-contributor";
const MAX_BODY = 256 * 1024;
const RATE_LIMIT = 30; // requests per minute per IP
const RATE_WINDOW_MS = 60_000;

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, model: MODEL, keyConfigured: Boolean(API_KEY) });
  }
  if (req.method !== "POST" || url.pathname !== "/api/chat") {
    return send(res, 404, { error: { code: "E_NOT_FOUND", message: "not found" } });
  }
  const ip = req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    return send(res, 429, { error: { code: "E_RATE_LIMIT", message: "too many requests; slow down" } });
  }
  if (!API_KEY) {
    return send(res, 500, {
      error: { code: "E_NO_API_KEY", message: "server has no META_API_KEY configured" },
    });
  }
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      send(res, 413, { error: { code: "E_TOO_LARGE", message: "request body too large" } });
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(res, 400, { error: { code: "E_BAD_JSON", message: "body must be JSON" } });
    }
    const { system, user, maxTokens } = payload ?? {};
    if (
      typeof system !== "string" ||
      typeof user !== "string" ||
      system.length === 0 ||
      user.length === 0 ||
      system.length + user.length > 200_000
    ) {
      return send(res, 400, {
        error: { code: "E_BAD_REQUEST", message: "system and user must be non-empty strings" },
      });
    }
    const tokens =
      typeof maxTokens === "number" && Number.isFinite(maxTokens)
        ? Math.max(100, Math.min(50_000, Math.floor(maxTokens)))
        : 4096;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    try {
      const upstream = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.0,
          max_tokens: tokens,
        }),
        signal: controller.signal,
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        return send(res, 502, {
          error: {
            code: "E_API_HTTP",
            message: `upstream API error (${upstream.status})`,
          },
        });
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return send(res, 502, {
          error: { code: "E_API_HTTP", message: "upstream returned non-JSON" },
        });
      }
      // Pass through only what the client needs; never echo headers.
      return send(res, 200, { choices: data.choices ?? [] });
    } catch (err) {
      const aborted = err && err.name === "AbortError";
      return send(res, aborted ? 504 : 502, {
        error: {
          code: aborted ? "E_API_TIMEOUT" : "E_API_HTTP",
          message: aborted ? "upstream API timed out" : "network failure calling upstream API",
        },
      });
    } finally {
      clearTimeout(timer);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[grasp-server] listening on :${PORT}, model ${MODEL}, key ${API_KEY ? "configured" : "MISSING"}`);
});
