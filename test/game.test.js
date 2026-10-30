const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const { createGameServer } = require("../server");
function waitMessage(ws, predicate, timeout=2500) {
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.off("message",onMessage);reject(new Error("Timed out waiting for game message"));},timeout);
  function onMessage(raw){let msg;try{msg=JSON.parse(raw.toString())}catch{return}if(predicate(msg)){clearTimeout(timer);ws.off("message",onMessage);resolve(msg)}}
  ws.on("message",onMessage);
 });
}
async function connect(url){const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject)});return ws;}
test("health endpoint and two-player versus room",async t=>{
 const app=createGameServer(0);await new Promise(resolve=>app.server.once("listening",resolve));t.after(()=>app.close());
 const port=app.server.address().port,base="http://127.0.0.1:"+port;
 const health=await fetch(base+"/health");assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 const a=await connect("ws://127.0.0.1:"+port),b=await connect("ws://127.0.0.1:"+port);t.after(()=>{a.terminate();b.terminate()});
 const wa=waitMessage(a,m=>m.type==="welcome");a.send(JSON.stringify({type:"join",room:"TEST96",nick:"Игрок 1",mode:"versus"}));assert.equal((await wa).mode,"versus");
 const wb=waitMessage(b,m=>m.type==="welcome");b.send(JSON.stringify({type:"join",room:"TEST96",nick:"Игрок 2",mode:"coop"}));const second=await wb;assert.equal(second.mode,"versus");assert.equal(second.players.length,2);
});
test("co-op room starts with enemy wave",async t=>{
 const app=createGameServer(0);await new Promise(resolve=>app.server.once("listening",resolve));t.after(()=>app.close());
 const port=app.server.address().port,ws=await connect("ws://127.0.0.1:"+port);t.after(()=>ws.terminate());
 const welcome=waitMessage(ws,m=>m.type==="welcome");ws.send(JSON.stringify({type:"join",room:"COOP96",nick:"Тест",mode:"coop"}));assert.equal((await welcome).mode,"coop");
 const state=waitMessage(ws,m=>m.type==="state"&&m.enemies.length>0,3000);assert.ok((await state).enemies.length>0);
});
