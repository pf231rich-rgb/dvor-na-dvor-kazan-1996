const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const rooms = new Map();
let nextId = 1;

const CAR_SPAWNS = [
  { id:"vaz2106-1", model:"vaz2106", name:"ВАЗ-2106", color:0x7b3028, x:0, z:15, heading:0.1 },
  { id:"vaz2109-1", model:"vaz2109", name:"ВАЗ-2109", color:0x9a9b8e, x:38, z:-54, heading:1.4 },
  { id:"gaz24-1", model:"gaz24", name:"ГАЗ-24 Волга", color:0x263e4c, x:106, z:36, heading:Math.PI },
  { id:"vaz2101-1", model:"vaz2101", name:"ВАЗ-2101", color:0x8c6b36, x:-126, z:-64, heading:-0.4 },
  { id:"uaz469-1", model:"uaz469", name:"УАЗ-469", color:0x536047, x:152, z:-112, heading:2.2 },
  { id:"vaz2105-1", model:"vaz2105", name:"ВАЗ-2105", color:0x4b5665, x:-18, z:126, heading:0.6 },
  { id:"moskvich-1", model:"moskvich", name:"Москвич-2141", color:0x6b793f, x:188, z:88, heading:-1.2 },
  { id:"gaz3110-1", model:"gaz3110", name:"ГАЗ-3110", color:0x20272d, x:-186, z:116, heading:0.2 }
];
function makeCars() {
  return new Map(CAR_SPAWNS.map(c => [c.id, { ...c, speed:0, throttle:0, steer:0, occupants:[null,null,null,null] }]));
}
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok:true, service:"dvor-na-dvor", rooms:rooms.size }));
  }
  if (req.url === "/" || req.url.startsWith("/?")) {
    fs.readFile(path.join(ROOT, "index.html"), (err, data) => {
      if (err) { res.writeHead(500); return res.end("Game client is not installed"); }
      res.writeHead(200, { "content-type":"text/html; charset=utf-8", "cache-control":"no-store" });
      res.end(data);
    });
    return;
  }
  if (req.url === "/favicon.ico") { res.writeHead(204); return res.end(); }
  res.writeHead(404, { "content-type":"text/plain; charset=utf-8" });
  res.end("Not found");
});
const wss = new WebSocket.Server({ server, maxPayload:2048, perMessageDeflate:false });
function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function publicPlayer(p) {
  return { id:p.id, nick:p.nick, team:p.team, x:p.x, z:p.z, dx:p.dx, dz:p.dz,
    health:p.health, alive:p.alive, action:p.action, score:p.score, deaths:p.deaths,
    respawnAt:p.respawnAt, vehicleId:p.vehicleId, seat:p.seat };
}
function publicCar(c) {
  return { id:c.id, model:c.model, name:c.name, color:c.color, x:c.x, z:c.z,
    heading:c.heading, speed:c.speed, occupants:c.occupants.filter(Boolean) };
}
function state(room) {
  return { type:"state", players:Array.from(room.players.values(), publicPlayer),
    cars:Array.from(room.cars.values(), publicCar), redScore:room.redScore,
    blueScore:room.blueScore, maxPlayers:10 };
}
function broadcast(room, message) { for (const p of room.players.values()) send(p.ws, message); }
function publish(room) { broadcast(room, state(room)); }
function roomBySocket(ws) { return ws.roomCode ? rooms.get(ws.roomCode) || null : null; }
function releaseVehicle(room, p, tell=true) {
  if (!p.vehicleId) return;
  const car = room.cars.get(p.vehicleId);
  if (car) {
    car.occupants[p.seat] = null;
    if (car.occupants.every(id => !id)) { car.throttle=0; car.steer=0; }
    if (tell) broadcast(room, { type:"notice", text:p.nick+" вышел из "+car.name+"." });
  }
  p.vehicleId = null; p.seat = null; p.action = "idle";
}
function leave(ws) {
  const room = roomBySocket(ws); if (!room) return;
  const p = room.players.get(ws.id);
  if (p) releaseVehicle(room,p,false);
  room.players.delete(ws.id); ws.roomCode=null;
  if (room.players.size === 0) rooms.delete(room.code); else publish(room);
}
function cleanNick(value) { return String(value||"Игрок").replace(/[<>\x00-\x1f]/g,"").trim().slice(0,16)||"Игрок"; }
function join(ws,msg) {
  if (ws.roomCode) leave(ws);
  const code=String(msg.room||"DVOR96").toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,10);
  if (!code) return send(ws,{type:"error",message:"Введи код комнаты."});
  let room=rooms.get(code);
  if (!room) { room={code,players:new Map(),cars:makeCars(),redScore:0,blueScore:0}; rooms.set(code,room); }
  if (room.players.size>=10) return send(ws,{type:"error",message:"Комната заполнена. Максимум 10 игроков."});
  let red=0,blue=0; for(const p of room.players.values()) p.team==="red"?red++:blue++;
  const team=red<=blue?"red":"blue";
  const p={id:ws.id,nick:cleanNick(msg.nick),team,ws,x:team==="red"?-10:10,z:team==="red"?12:18,
    dx:team==="red"?1:-1,dz:0,health:100,alive:true,action:"idle",score:0,deaths:0,
    respawnAt:0,lastMove:Date.now(),lastAttack:0,vehicleId:null,seat:null};
  room.players.set(p.id,p); ws.roomCode=code;
  send(ws,{type:"welcome",id:p.id,team,room:code,players:Array.from(room.players.values(),publicPlayer),cars:Array.from(room.cars.values(),publicCar)});
  publish(room); broadcast(room,{type:"notice",text:p.nick+" зашёл во двор."});
}
function move(ws,msg) {
  const room=roomBySocket(ws),p=room&&room.players.get(ws.id);
  if(!p||!p.alive||p.vehicleId) return;
  const now=Date.now(),elapsed=Math.max(.02,Math.min(.25,(now-p.lastMove)/1000));p.lastMove=now;
  const tx=Number(msg.x),tz=Number(msg.z);if(!Number.isFinite(tx)||!Number.isFinite(tz))return;
  const dx=tx-p.x,dz=tz-p.z,distance=Math.hypot(dx,dz);
  const maxDistance=(msg.action==="block"?3.2:7.2)*elapsed+.35,scale=distance>maxDistance?maxDistance/distance:1;
  p.x=Math.max(-260,Math.min(260,p.x+dx*scale));p.z=Math.max(-260,Math.min(260,p.z+dz*scale));
  if(Math.hypot(Number(msg.dx)||0,Number(msg.dz)||0)>.05){const len=Math.hypot(Number(msg.dx),Number(msg.dz));p.dx=Number(msg.dx)/len;p.dz=Number(msg.dz)/len;}
  p.action=msg.action==="block"?"block":"idle";publish(room);
}
function enterVehicle(ws) {
  const room=roomBySocket(ws),p=room&&room.players.get(ws.id);if(!p||!p.alive||p.vehicleId)return;
  let chosen=null,best=12;
  for(const c of room.cars.values()){const d=Math.hypot(c.x-p.x,c.z-p.z);if(d<best&&c.occupants.some(id=>!id)){chosen=c;best=d;}}
  if(!chosen)return send(ws,{type:"notice",text:"Подойди ближе к машине."});
  const seat=chosen.occupants.findIndex(id=>!id);chosen.occupants[seat]=p.id;p.vehicleId=chosen.id;p.seat=seat;p.x=chosen.x;p.z=chosen.z;p.action="idle";
  broadcast(room,{type:"notice",text:p.nick+(seat===0?" сел за руль ":" сел в ") + chosen.name+"."});publish(room);
}
function exitVehicle(ws) {
  const room=roomBySocket(ws),p=room&&room.players.get(ws.id);if(!p||!p.vehicleId)return;
  const car=room.cars.get(p.vehicleId);
  if(car){const side=p.seat%2===0?1:-1;p.x=car.x+Math.cos(car.heading+Math.PI/2)*side*3;p.z=car.z-Math.sin(car.heading+Math.PI/2)*side*3;}
  releaseVehicle(room,p);publish(room);
}
function vehicleControl(ws,msg) {
  const room=roomBySocket(ws),p=room&&room.players.get(ws.id);if(!p||!p.vehicleId||p.seat!==0)return;
  const car=room.cars.get(p.vehicleId);if(!car)return;
  car.throttle=Math.max(-1,Math.min(1,Number(msg.throttle)||0));
  car.steer=Math.max(-1,Math.min(1,Number(msg.steer)||0));
}
function attack(ws) {
  const room=roomBySocket(ws),p=room&&room.players.get(ws.id);if(!p||!p.alive||p.vehicleId)return;
  const now=Date.now();if(now-p.lastAttack<650)return;p.lastAttack=now;p.action="attack";
  let hit=false;
  for(const target of room.players.values()){
    if(!target.alive||target.team===p.team||target.id===p.id||target.vehicleId)continue;
    const dx=target.x-p.x,dz=target.z-p.z,dist=Math.hypot(dx,dz),facing=dx*p.dx+dz*p.dz;
    if(dist>2.45||facing<-.15)continue;
    target.health=Math.max(0,target.health-(target.action==="block"?8:28));
    const push=dist>.01?.65/dist:0;target.x=Math.max(-260,Math.min(260,target.x+dx*push));target.z=Math.max(-260,Math.min(260,target.z+dz*push));
    hit=true;broadcast(room,{type:"combat",attacker:p.id,target:target.id,damage:target.action==="block"?8:28,blocked:target.action==="block"});
    if(target.health<=0){target.alive=false;target.action="down";target.deaths++;p.score++;if(p.team==="red")room.redScore++;else room.blueScore++;target.respawnAt=now+3000;broadcast(room,{type:"notice",text:p.nick+" отправил в нокаут "+target.nick+"."});}
  }
  if(!hit)broadcast(room,{type:"swing",id:p.id});publish(room);
}
wss.on("connection",ws=>{
  ws.id=String(nextId++);ws.roomCode=null;
  ws.on("message",raw=>{let msg;try{msg=JSON.parse(raw.toString());}catch{return;}if(!msg||typeof msg.type!=="string")return;
    if(msg.type==="join")return join(ws,msg);
    if(msg.type==="move")return move(ws,msg);
    if(msg.type==="action"&&msg.action==="attack")return attack(ws);
    if(msg.type==="vehicleEnter")return enterVehicle(ws);
    if(msg.type==="vehicleExit")return exitVehicle(ws);
    if(msg.type==="vehicleControl")return vehicleControl(ws,msg);
  });
  ws.on("close",()=>leave(ws));ws.on("error",()=>leave(ws));
});
setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    let changed=false;
    for(const car of room.cars.values()){
      const driverId=car.occupants[0],driver=driverId&&room.players.get(driverId);
      const throttle=driver?car.throttle:0,steer=driver?car.steer:0;
      car.speed+=throttle*(throttle>=0?13:9)*.05;
      car.speed*=Math.abs(throttle)>.05?.994:.965;
      car.speed=Math.max(-8,Math.min(31,car.speed));
      car.heading-=steer*Math.min(1,Math.abs(car.speed)/7)*1.8*.05;
      car.x=Math.max(-260,Math.min(260,car.x+Math.cos(car.heading)*car.speed*.05));
      car.z=Math.max(-260,Math.min(260,car.z-Math.sin(car.heading)*car.speed*.05));
      if(Math.abs(car.speed)<.08)car.speed=0;
      for(const id of car.occupants){const p=room.players.get(id);if(p){p.x=car.x;p.z=car.z;p.dx=Math.cos(car.heading);p.dz=-Math.sin(car.heading);}}
      if(Math.abs(car.speed)>.02||Math.abs(throttle)>.01||Math.abs(steer)>.01)changed=true;
    }
    for(const p of room.players.values())if(!p.alive&&p.respawnAt&&now>=p.respawnAt){p.alive=true;p.health=100;p.respawnAt=0;p.x=p.team==="red"?-10:10;p.z=12+Math.random()*4;p.action="idle";changed=true;send(p.ws,{type:"notice",text:"Ты снова в игре!"});}
    if(changed)publish(room);
  }
},50).unref();
server.listen(PORT,"0.0.0.0",()=>console.log("Dvor na Dvor listening on "+PORT));
