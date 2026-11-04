// scripts/server-check.mjs
// Deterministic server proxy test: mock upstream, fake key, no network
// beyond localhost. Asserts: health, chat pass-through, upstream auth
// header server-side, bad-body 400, oversize 413, missing-key 500
// (second instance), and that responses never contain the key.
import http from "node:http";
import { spawn } from "node:child_process";

const KEY = "test-secret-key-123";
let upstreamAuth = null;

const upstream = http.createServer((req, res) => {
  upstreamAuth = req.headers.authorization || null;
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "mock-ok" } }] }));
  });
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const upstreamPort = upstream.address().port;

function startServer(port, env) {
  const child = spawn("node", ["server/index.mjs"], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("server start timeout")), 10000);
    child.stdout.on("data", (d) => {
      if (String(d).includes("listening")) {
        clearTimeout(to);
        resolve(child);
      }
    });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
}

const post = async (port, path, body) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
};

const results = [];
const check = (name, cond, detail = "") => {
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) throw new Error(`server check failed: ${name} ${detail}`);
};

const srv = await startServer(8891, {
  PORT: "8891",
  META_API_KEY: KEY,
  META_API_BASE: `http://127.0.0.1:${upstreamPort}/v1`,
});
try {
  const health = await fetch("http://127.0.0.1:8891/api/health").then((r) => r.json());
  check("health", health.ok === true && health.keyConfigured === true);
  const chat = await post(8891, "/api/chat", { system: "s", user: "u", maxTokens: 100 });
  check("chat-200", chat.status === 200 && chat.text.includes("mock-ok"), `${chat.status}`);
  check("upstream-auth-server-side", upstreamAuth === `Bearer ${KEY}`, String(upstreamAuth));
  check("key-not-in-response", !chat.text.includes(KEY));
  const bad = await post(8891, "/api/chat", { system: "", user: "u" });
  check("bad-body-400", bad.status === 400, `${bad.status}`);
  const big = await post(8891, "/api/chat", "x".repeat(300 * 1024));
  check("oversize-413", big.status === 413, `${big.status}`);
} finally {
  srv.kill();
}

const srv2 = await startServer(8892, { PORT: "8892", META_API_KEY: "", META_API_BASE: "http://127.0.0.1:9" });
try {
  const noKey = await post(8892, "/api/chat", { system: "s", user: "u" });
  check("missing-key-500", noKey.status === 500 && noKey.text.includes("E_NO_API_KEY"), `${noKey.status}`);
} finally {
  srv2.kill();
  upstream.close();
}

console.log(results.join("\n"));
console.log("SERVER CHECK GREEN");
