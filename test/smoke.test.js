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

test("attacks damage opponents and blocking reduces damage", async () => {
  const a = await connect();
  const b = await connect();
  try {
    const wa = await join(a, "Боец 1", "COMBAT");
    const wb = await join(b, "Боец 2", "COMBAT");
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let i = 0; i < 24; i++) {
      a.send(JSON.stringify({ type:"move", x:0, z:0, dx:1, dz:0, action:"idle" }));
      b.send(JSON.stringify({ type:"move", x:1, z:0, dx:-1, dz:0, action:"idle" }));
      await pause(120);
    }
    const damaged = waitForMessage(b, m => m.type === "state" && m.players && m.players.some(p => p.id === wb.id && p.health === 72));
    a.send(JSON.stringify({ type:"action", action:"attack" }));
    const first = await damaged;
    assert.equal(first.players.find(p => p.id === wb.id).health, 72);

    b.send(JSON.stringify({ type:"move", x:1, z:0, dx:-1, dz:0, action:"block" }));
    await pause(120);
    await pause(700);
    const blocked = waitForMessage(a, m => m.type === "state" && m.players && m.players.some(p => p.id === wb.id && p.health === 64));
    a.send(JSON.stringify({ type:"action", action:"attack" }));
    const second = await blocked;
    assert.equal(second.players.find(p => p.id === wb.id).health, 64);
  } finally {
    a.close();
    b.close();
  }
});

test("players can share a car and the driver can move it", async () => {
  const a = await connect();
  const b = await connect();
  try {
    const wa = await join(a, "Водитель", "CARS");
    const wb = await join(b, "Пассажир", "CARS");
    assert.ok(wa.cars.some(c => c.id === "vaz2106-1"));
    const enteredA = waitForMessage(a, m => m.type === "state" && m.players?.some(p => p.id === wa.id && p.vehicleId === "vaz2106-1"));
    a.send(JSON.stringify({ type:"vehicleEnter" }));
    const stateA = await enteredA;
    assert.equal(stateA.players.find(p => p.id === wa.id).seat, 0);
    const enteredB = waitForMessage(b, m => m.type === "state" && m.players?.some(p => p.id === wb.id && p.vehicleId === "vaz2106-1"));
    b.send(JSON.stringify({ type:"vehicleEnter" }));
    const stateB = await enteredB;
    assert.equal(stateB.players.find(p => p.id === wb.id).seat, 1);
    const moving = waitForMessage(a, m => m.type === "state" && m.cars?.some(c => c.id === "vaz2106-1" && c.speed > 0.1));
    a.send(JSON.stringify({ type:"vehicleControl", throttle:1, steer:0.25 }));
    const movingState = await moving;
    assert.ok(movingState.cars.find(c => c.id === "vaz2106-1").speed > 0.1);
  } finally {
    a.close();
    b.close();
  }
});
