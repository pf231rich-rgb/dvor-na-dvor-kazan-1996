const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const rooms = new Map();
let nextId = 1;

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok: true, service: "dvor-na-dvor", rooms: rooms.size }));
  }
  if (req.url === "/" || req.url.startsWith("/?")) {
    const file = path.join(ROOT, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(500); return res.end("Game client is not installed"); }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(data);
    });
    return;
  }
  if (req.url === "/favicon.ico") { res.writeHead(204); return res.end(); }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const wss = new WebSocket.Server({ server, maxPayload: 2048, perMessageDeflate: false });

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function publicPlayer(p) {
  return {
    id: p.id, nick: p.nick, team: p.team, x: p.x, z: p.z,
    dx: p.dx, dz: p.dz, health: p.health, alive: p.alive,
    action: p.action, score: p.score, deaths: p.deaths, respawnAt: p.respawnAt
  };
}
function state(room) {
  const players = Array.from(room.players.values(), publicPlayer);
  return {
    type: "state", players,
    redScore: room.redScore, blueScore: room.blueScore,
    maxPlayers: 10
  };
}
function broadcast(room, message) {
  for (const p of room.players.values()) send(p.ws, message);
}
function publish(room) { broadcast(room, state(room)); }
function roomBySocket(ws) {
  if (!ws.roomCode) return null;
  return rooms.get(ws.roomCode) || null;
}
function leave(ws) {
  const room = roomBySocket(ws);
  if (!room) return;
  room.players.delete(ws.id);
  ws.roomCode = null;
  if (room.players.size === 0) rooms.delete(room.code);
  else publish(room);
}
function cleanNick(value) {
  return String(value || "Игрок").replace(/[<>\\u0000-\\u001f]/g, "").trim().slice(0, 16) || "Игрок";
}
function join(ws, msg) {
  if (ws.roomCode) leave(ws);
  const code = String(msg.room || "DVOR96").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 10);
  if (!code) return send(ws, { type: "error", message: "Введи код комнаты." });
  let room = rooms.get(code);
  if (!room) {
    room = { code, players: new Map(), redScore: 0, blueScore: 0 };
    rooms.set(code, room);
  }
  if (room.players.size >= 10) return send(ws, { type: "error", message: "Комната заполнена. Максимум 10 игроков." });
  let red = 0, blue = 0;
  for (const p of room.players.values()) p.team === "red" ? red++ : blue++;
  const team = red <= blue ? "red" : "blue";
  const p = {
    id: ws.id, nick: cleanNick(msg.nick), team, ws,
    x: team === "red" ? -8 : 8, z: 6 + Math.random() * 3,
    dx: team === "red" ? 1 : -1, dz: 0,
    health: 100, alive: true, action: "idle",
    score: 0, deaths: 0, respawnAt: 0, lastMove: Date.now(),
    lastAttack: 0
  };
  room.players.set(p.id, p);
  ws.roomCode = code;
  send(ws, { type: "welcome", id: p.id, team, room: code, players: Array.from(room.players.values(), publicPlayer) });
  publish(room);
  broadcast(room, { type: "notice", text: p.nick + " зашёл во двор." });
}
function move(ws, msg) {
  const room = roomBySocket(ws);
  const p = room && room.players.get(ws.id);
  if (!p || !p.alive) return;
  const now = Date.now();
  const elapsed = Math.max(0.02, Math.min(0.25, (now - p.lastMove) / 1000));
  p.lastMove = now;
  const tx = Number(msg.x), tz = Number(msg.z);
  if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
  const dx = tx - p.x, dz = tz - p.z;
  const distance = Math.hypot(dx, dz);
  const maxDistance = (msg.action === "block" ? 3.2 : 7.2) * elapsed + 0.35;
  const scale = distance > maxDistance ? maxDistance / distance : 1;
  p.x = Math.max(-44, Math.min(44, p.x + dx * scale));
  p.z = Math.max(-36, Math.min(36, p.z + dz * scale));
  if (Math.hypot(Number(msg.dx) || 0, Number(msg.dz) || 0) > 0.05) {
    const len = Math.hypot(Number(msg.dx), Number(msg.dz));
    p.dx = Number(msg.dx) / len;
    p.dz = Number(msg.dz) / len;
  }
  p.action = msg.action === "block" ? "block" : "idle";
  publish(room);
}
function attack(ws) {
  const room = roomBySocket(ws);
  const p = room && room.players.get(ws.id);
  if (!p || !p.alive) return;
  const now = Date.now();
  if (now - p.lastAttack < 650) return;
  p.lastAttack = now;
  p.action = "attack";
  let hit = false;
  for (const target of room.players.values()) {
    if (!target.alive || target.team === p.team || target.id === p.id) continue;
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const facing = dx * p.dx + dz * p.dz;
    if (dist > 2.45 || facing < -0.15) continue;
    const damage = target.action === "block" ? 8 : 28;
    target.health = Math.max(0, target.health - damage);
    const push = dist > 0.01 ? 0.65 / dist : 0;
    target.x = Math.max(-44, Math.min(44, target.x + dx * push));
    target.z = Math.max(-36, Math.min(36, target.z + dz * push));
    hit = true;
    broadcast(room, { type: "combat", attacker: p.id, target: target.id, damage, blocked: target.action === "block" });
    if (target.health <= 0) {
      target.alive = false;
      target.action = "down";
      target.deaths++;
      p.score++;
      if (p.team === "red") room.redScore++; else room.blueScore++;
      target.respawnAt = now + 3000;
      broadcast(room, { type: "notice", text: p.nick + " отправил в нокаут " + target.nick + "." });
    }
  }
  if (!hit) broadcast(room, { type: "swing", id: p.id });
  publish(room);
}
wss.on("connection", ws => {
  ws.id = String(nextId++);
  ws.roomCode = null;
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "join") return join(ws, msg);
    if (msg.type === "move") return move(ws, msg);
    if (msg.type === "action" && msg.action === "attack") return attack(ws);
  });
  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    for (const p of room.players.values()) {
      if (!p.alive && p.respawnAt && now >= p.respawnAt) {
        p.alive = true; p.health = 100; p.respawnAt = 0;
        p.x = p.team === "red" ? -8 : 8; p.z = 6 + Math.random() * 3;
        p.action = "idle"; changed = true;
        send(p.ws, { type: "notice", text: "Ты снова в игре!" });
      }
    }
    if (changed) publish(room);
  }
}, 250).unref();

server.listen(PORT, "0.0.0.0", () => console.log("Dvor na Dvor listening on " + PORT));
