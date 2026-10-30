const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const port = 18437;
const base = "http://127.0.0.1:" + port;
const wsUrl = "ws://127.0.0.1:" + port;
let child;

function waitForMessage(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off("message", onMessage); reject(new Error("Timed out waiting for WebSocket message")); }, timeout);
    function onMessage(raw) {
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(data)) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(data);
    }
    ws.on("message", onMessage);
  });
}
async function connect() {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return ws;
}
async function join(ws, nick, room) {
  const welcome = waitForMessage(ws, m => m.type === "welcome");
  ws.send(JSON.stringify({ type: "join", nick, room }));
  return welcome;
}
async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + "/health");
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Server did not become ready");
}

before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  await waitForServer();
});
after(() => {
  if (child && !child.killed) child.kill("SIGTERM");
});

test("health endpoint reports service online", async () => {
  const res = await fetch(base + "/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "dvor-na-dvor");
});

test("two clients join the same room on opposing teams", async () => {
  const a = await connect();
  const b = await connect();
  try {
    const wa = await join(a, "Тест 1", "SMOKE");
    const wb = await join(b, "Тест 2", "SMOKE");
    assert.equal(wa.room, "SMOKE");
    assert.equal(wb.room, "SMOKE");
    assert.notEqual(wa.team, wb.team);
    assert.ok(["red", "blue"].includes(wa.team));
    assert.ok(["red", "blue"].includes(wb.team));
  } finally {
    a.close();
    b.close();
  }
});

test("room rejects the eleventh player", async () => {
  const clients = [];
  try {
    for (let i = 0; i < 10; i++) {
      const ws = await connect();
      clients.push(ws);
      const welcome = await join(ws, "Игрок " + i, "FULL");
      assert.equal(welcome.type, "welcome");
    }
    const extra = await connect();
    clients.push(extra);
    const error = waitForMessage(extra, m => m.type === "error");
    extra.send(JSON.stringify({ type: "join", nick: "Лишний", room: "FULL" }));
    const response = await error;
    assert.match(response.message, /заполнена/i);
  } finally {
    for (const ws of clients) ws.close();
  }
});