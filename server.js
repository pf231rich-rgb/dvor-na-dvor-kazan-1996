const http = require("http");
const WebSocket = require("ws");
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Dvor na Dvor server is online\n");
});
const wss = new WebSocket.Server({ server });
const rooms = new Map();
let nextId = 1;
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function snapshot(room) { return [...room.values()].map(p => ({ id:p.id, nick:p.nick, team:p.team, x:p.x, z:p.z, action:p.action })); }
function broadcast(room, data) { for (const p of room.values()) send(p.ws, data); }
function publish(room) { broadcast(room, { type:"state", players:snapshot(room) }); }
wss.on("connection", ws => {
  ws.id = String(nextId++);
  ws.roomCode = null;
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === "join") {
      const code = String(m.room || "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
      if (!code) return send(ws,{type:"error",message:"Укажи код комнаты"});
      if (!rooms.has(code)) rooms.set(code,new Map());
      const room = rooms.get(code);
      if (room.size >= 10) return send(ws,{type:"error",message:"Комната заполнена: максимум 10 игроков"});
      const red = [...room.values()].filter(p => p.team === "red").length;
      const blue = [...room.values()].filter(p => p.team === "blue").length;
      const team = red <= blue ? "red" : "blue";
      const p = { id:ws.id, nick:String(m.nick || "Игрок").slice(0,16), team, ws, x:team==="red"?-8:8, z:8, action:"idle" };
      room.set(ws.id,p); ws.roomCode=code;
      send(ws,{type:"welcome",id:p.id,team,room:code,players:snapshot(room)});
      publish(room); return;
    }
    if (!ws.roomCode) return;
    const room=rooms.get(ws.roomCode), p=room && room.get(ws.id);
    if (!p) return;
    if (m.type === "move") {
      p.x=Math.max(-43,Math.min(43,Number(m.x)||0));
      p.z=Math.max(-35,Math.min(35,Number(m.z)||0));
      p.action=["idle","block"].includes(m.action)?m.action:"idle";
      publish(room);
    } else if (m.type === "action" && m.action === "attack") {
      broadcast(room,{type:"event",event:"attack",nick:p.nick,team:p.team});
    }
  });
  ws.on("close",()=>{
    if (!ws.roomCode) return;
    const room=rooms.get(ws.roomCode); if (!room) return;
    room.delete(ws.id); if (!room.size) rooms.delete(ws.roomCode); else publish(room);
  });
});
server.listen(PORT,()=>console.log("Dvor na Dvor listening on "+PORT));