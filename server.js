import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import crypto from "crypto";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ok:true, game:"Chaos Arena"}));

const rooms = new Map();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function code() {
  let s = "";
  for (let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}
function roomState(r) {
  return {
    code:r.code, host:r.host, phase:r.phase, round:r.round, totalRounds:5,
    mini:r.mini, players:[...r.players.values()].map(p=>({
      id:p.id,name:p.name,score:p.score,energy:p.energy,ready:p.ready,shield:p.shield
    }))
  };
}
function emitRoom(r){ io.to(r.code).emit("state", roomState(r)); }

const minis = [
  {id:"reflex",title:"REFLEX RUSH",desc:"Click the arena target as fast as you can.",time:12},
  {id:"memory",title:"MEMORY CLASH",desc:"Watch the sequence, then repeat it.",time:18},
  {id:"dodge",title:"DODGE ZONE",desc:"Move your cursor and survive the hazards.",time:15},
  {id:"target",title:"TARGET RUSH",desc:"Hit as many targets as possible.",time:15},
  {id:"risk",title:"RISK VAULT",desc:"Choose SAFE or RISKY before the timer ends.",time:8}
];

io.on("connection", socket => {
  socket.on("create", ({name}, cb) => {
    let c; do c=code(); while(rooms.has(c));
    const r={code:c,host:socket.id,phase:"lobby",round:0,mini:null,players:new Map()};
    r.players.set(socket.id,{id:socket.id,name:(name||"Player").slice(0,18),score:0,energy:0,ready:true,shield:false});
    rooms.set(c,r); socket.join(c); cb({ok:true,code:c}); emitRoom(r);
  });

  socket.on("join", ({code,name}, cb) => {
    const r=rooms.get(String(code||"").toUpperCase());
    if(!r) return cb({ok:false,error:"Room not found."});
    if(r.phase!=="lobby") return cb({ok:false,error:"Game already started."});
    if(r.players.size>=8) return cb({ok:false,error:"Room is full."});
    r.players.set(socket.id,{id:socket.id,name:(name||"Player").slice(0,18),score:0,energy:0,ready:false,shield:false});
    socket.join(r.code); cb({ok:true,code:r.code}); emitRoom(r);
  });

  socket.on("ready", ({code,ready}) => {
    const r=rooms.get(code); if(!r||!r.players.has(socket.id)) return;
    r.players.get(socket.id).ready=!!ready; emitRoom(r);
  });

  socket.on("start", ({code}) => {
    const r=rooms.get(code); if(!r||r.host!==socket.id||r.players.size<2||r.phase!=="lobby") return;
    if (![...r.players.values()].every(p=>p.ready)) return;
    r.phase="mini"; r.round=1; r.mini=minis[Math.floor(Math.random()*minis.length)];
    emitRoom(r); io.to(r.code).emit("miniStart",r.mini);
  });

  socket.on("miniResult", ({code,score}) => {
    const r=rooms.get(code), p=r?.players.get(socket.id);
    if(!r||!p||r.phase!=="mini") return;
    p.score += Math.max(0,Math.min(100,Number(score)||0));
    p.energy += Math.max(0,Math.min(100,Number(score)||0));
    socket.emit("resultAccepted",{score:Math.max(0,Math.min(100,Number(score)||0))});
    emitRoom(r);
  });

  socket.on("finishMini", ({code}) => {
    const r=rooms.get(code); if(!r||r.host!==socket.id||r.phase!=="mini") return;
    r.phase="battle"; emitRoom(r);
  });

  socket.on("ability", ({code,targetId,type}) => {
    const r=rooms.get(code), p=r?.players.get(socket.id), t=r?.players.get(targetId);
    if(!r||!p||!t||r.phase!=="battle"||p.id===t.id) return;
    const costs={attack:30,shield:20,boost:40,chaos:35,steal:50};
    const cost=costs[type]; if(!cost||p.energy<cost) return;
    if(type==="attack"){
      if(t.shield){t.shield=false}
      else {const x=Math.min(30,t.energy); t.energy-=x; p.energy+=x;}
    } else if(type==="shield"){p.shield=true}
    else if(type==="boost"){p.score+=25}
    else if(type==="chaos"){t.score=Math.max(0,t.score-20)}
    else if(type==="steal"){if(Math.random()<0.55){const x=Math.min(50,t.energy);t.energy-=x;p.energy+=x}}
    p.energy-=cost; emitRoom(r);
  });

  socket.on("nextRound", ({code}) => {
    const r=rooms.get(code); if(!r||r.host!==socket.id||r.phase!=="battle") return;
    if(r.round>=5){r.phase="finished";emitRoom(r);return;}
    r.round++; r.phase="mini"; r.mini=minis[Math.floor(Math.random()*minis.length)];
    emitRoom(r); io.to(r.code).emit("miniStart",r.mini);
  });

  socket.on("disconnect",()=>{
    for(const [c,r] of rooms){
      if(r.players.delete(socket.id)){
        if(r.host===socket.id) r.host=r.players.keys().next().value;
        if(r.players.size===0) rooms.delete(c); else emitRoom(r);
      }
    }
  });
});

httpServer.listen(process.env.PORT||3000,()=>console.log("Chaos Arena running"));
