/* ═══════════════════════════════════════════════════════════════
   CURSOR SURVIVAL — INFINITE BOSS RUSH
   Inimigos variados + Escudo + Laser!
   ═══════════════════════════════════════════════════════════════ */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
resize(); window.addEventListener('resize',resize);

// ─── MOUSE & TOUCH ───
const mouse = {x:canvas.width/2,y:canvas.height/2,rawX:canvas.width/2,rawY:canvas.height/2,trail:[],clicking:false};

window.addEventListener('mousemove',e=>{mouse.rawX=e.clientX;mouse.rawY=e.clientY;});
window.addEventListener('mousedown',e=>{if(e.button===0)mouse.clicking=true;});
window.addEventListener('mouseup',e=>{if(e.button===0)mouse.clicking=false;});

window.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length>0){
        mouse.rawX=e.touches[0].clientX;
        mouse.rawY=e.touches[0].clientY;
    }
}, {passive:false});
window.addEventListener('touchstart',e=>{
    e.preventDefault();
    if(e.touches.length>0){
        mouse.rawX=e.touches[0].clientX;
        mouse.rawY=e.touches[0].clientY;
        mouse.clicking=true;
    }
}, {passive:false});
window.addEventListener('touchend',e=>{
    e.preventDefault();
    mouse.clicking=false;
}, {passive:false});

// ─── PERSISTENCE (IndexedDB) ───
let savedData = {
    coins: 0,
    inventory: {
        'Munição': 0, 'Escudo': 0, 'Guarda-Costa': 0, 'Bomba': 0, 'Ímã': 0, 'Vida': 0
    },
    limits: {}, // e.g. "2026-07-13": { "Munição": 5 }
    lastLogin: null,
    streak: 0
};
let db = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('CursorSurvivalDB', 1);
        req.onupgradeneeded = e => {
            db = e.target.result;
            if(!db.objectStoreNames.contains('saves')) {
                db.createObjectStore('saves', { keyPath: 'id' });
            }
        };
        req.onsuccess = e => {
            db = e.target.result;
            const tx = db.transaction('saves', 'readonly');
            const store = tx.objectStore('saves');
            const getReq = store.get('main_save');
            
            getReq.onsuccess = () => {
                if(getReq.result && getReq.result.data) {
                    savedData = getReq.result.data;
                } else {
                    // Try to migrate from localStorage if IndexedDB is empty
                    const oldStr = localStorage.getItem('cursorSurvivalData');
                    if(oldStr) {
                        try {
                            savedData = JSON.parse(oldStr);
                            localStorage.removeItem('cursorSurvivalData'); // Clear old
                        } catch(e) {}
                    }
                    saveData(); // Initial save to DB
                }
                updateGlobalUI();
                resolve();
            };
            getReq.onerror = () => resolve(); // proceed anyway
        };
        req.onerror = e => reject(e);
    });
}

function saveData() {
    if(!db) return;
    const tx = db.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    store.put({ id: 'main_save', data: savedData });
    updateGlobalUI();
}

function confirmReset() {
    if(confirm("TEM CERTEZA ABSOLUTA? Todo seu dinheiro e itens serão perdidos para sempre!")) {
        savedData = {
            coins: 0,
            inventory: { 'Munição': 0, 'Escudo': 0, 'Guarda-Costa': 0, 'Bomba': 0, 'Ímã': 0, 'Vida': 0 },
            limits: {}, lastLogin: null, streak: 0
        };
        saveData();
        closeShop();
        announce('⚠️ JOGO RESETADO! ⚠️', '#ff0000', 90);
    }
}

function getTodayDate() { return new Date().toLocaleDateString('pt-BR'); }

function updateGlobalUI() {
    const c = savedData.coins;
    if(document.getElementById('menuCoins')) document.getElementById('menuCoins').textContent = c;
    if(document.getElementById('shopCoins')) document.getElementById('shopCoins').textContent = c;
    if(document.getElementById('hudGlobalCoins')) document.getElementById('hudGlobalCoins').textContent = c;
    updateInventoryUI();
}

// ─── ENEMY TYPES ───
const ETYPES = [
    {name:'Chaser',color:'#ff0044',glow:'rgba(255,0,68,0.5)',size:10,speed:1.6,behavior:'chase',shape:'circle'},
    {name:'Zigzag',color:'#ff6600',glow:'rgba(255,102,0,0.5)',size:9,speed:2.2,behavior:'zigzag',shape:'triangle'},
    {name:'Ghost',color:'#aa00ff',glow:'rgba(170,0,255,0.5)',size:12,speed:1.3,behavior:'ghost',shape:'circle'},
    {name:'Mini',color:'#ff0088',glow:'rgba(255,0,136,0.5)',size:6,speed:3.5,behavior:'chase',shape:'circle'},
    {name:'Tank',color:'#00aaff',glow:'rgba(0,170,255,0.5)',size:18,speed:0.8,behavior:'chase',shape:'hexagon'},
    {name:'Orbiter',color:'#00ffcc',glow:'rgba(0,255,204,0.5)',size:9,speed:2.0,behavior:'orbit',shape:'diamond'},
    {name:'Splitter',color:'#88ff00',glow:'rgba(136,255,0,0.5)',size:16,speed:1.4,behavior:'split',shape:'diamond'},
    {name:'Dash',color:'#ffff00',glow:'rgba(255,255,0,0.5)',size:8,speed:1.0,behavior:'dash',shape:'triangle'},
];

// ─── SHOP ITEMS ───
const SHOP_ITEMS = [
    { id:'Munição', name:'🔫 Munição', desc:'10 tiros de laser', price:50, limit:20 },
    { id:'Escudo', name:'🛡️ Escudo', desc:'Protege 3 hits', price:80, limit:10 },
    { id:'Guarda-Costa', name:'💂 Guarda-Costa', desc:'Mata quem encostar', price:150, limit:5 },
    { id:'Bomba', name:'💥 Bomba', desc:'Mata todos na tela', price:100, limit:8 },
    { id:'Ímã', name:'🧲 Ímã', desc:'Atrai moedas (15s)', price:60, limit:10 },
    { id:'Vida', name:'❤️ Vida Extra', desc:'+1 Vida na hora', price:200, limit:3 },
];

// ─── POWER-UP TYPES (drops in-game) ───
const PTYPES = [
    {name:'Escudo',icon:'🛡️',color:'#00ff88',duration:300},
    {name:'Laser',icon:'🔫',color:'#ff0000',duration:0},
    {name:'Vida Extra',icon:'❤️',color:'#ff3366',duration:0},
    {name:'Nuke',icon:'💥',color:'#ffaa00',duration:0},
    {name:'Slow-Mo',icon:'⏰',color:'#00aaff',duration:300},
];

// ─── GAME STATE ───
const G = {
    running:false, state:'MENU', score:0, lives:3, phase:1, time:0,
    boss:null, bossActive:false, bossTimer:0, bossInterval:900,
    spawnTimer:0, spawnRate:70, orbTimer:0,
    invincible:false, invTimer:0, shake:0,
    darkness:false, inverted:false, invertFlash:0,
    // SHIELD
    shieldActive:false, shieldTimer:0, shieldHits:0,
    // LASER
    laserActive:false, laserAmmo:0, laserBeams:[],
    laserCooldown:0,
    // INVENTORY ITEMS
    guardActive:false, guardAngle:0,
    magnetActive:false, magnetTimer:0,
    // SLOW-MO
    slowMo:false, slowTimer:0,
    // power-up spawn
    pwrTimer:0,
    announce:null, announceTimer:0,
    // combo
    coinCombo:0, coinComboTimer:0, sessionCoins:0,
    stars:[], bgPulse:0, lastTime:0, dt:0,
};

let enemies=[], orbs=[], coins=[], particles=[], texts=[];
let projectiles=[], obstacles=[], fakes=[], powerups=[];

// ─── BOSS CONFIG ───
const BOSSES=[null,
    {name:'Slime Rei',icon:'👑',color:'#00ff44',hp:60,speed:1.2,id:1},
    {name:'Aranha Rainha',icon:'🕷️',color:'#9933ff',hp:75,speed:1.8,id:2},
    {name:'Fantasma Sombrio',icon:'👻',color:'#6644cc',hp:70,speed:1.5,id:3},
    {name:'Dragão Infernal',icon:'🐉',color:'#ff4400',hp:90,speed:1.0,id:4},
    {name:'Kraken',icon:'🐙',color:'#0088ff',hp:100,speed:0.8,id:5},
    {name:'Mago das Ilusões',icon:'🧙',color:'#aa00ff',hp:80,speed:2.0,id:6},
    {name:'Demônio Caótico',icon:'😈',color:'#ff0000',hp:90,speed:2.2,id:7},
    {name:'Hidra',icon:'🐍',color:'#00cc44',hp:110,speed:1.5,id:8},
    {name:'Ceifador',icon:'💀',color:'#888888',hp:100,speed:2.5,id:9},
    {name:'Deus do Caos',icon:'⚡',color:'#ffaa00',hp:150,speed:2.0,id:10},
];

// ─── AUDIO ───
let audioCtx=null;
function aud(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx;}
function snd(type){
    try{const c=aud(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);const t=c.currentTime;
    if(type==='coin'){o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(1760,t+0.1);g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.15);o.start(t);o.stop(t+0.15);}
    else if(type==='hit'){o.type='sawtooth';o.frequency.setValueAtTime(200,t);o.frequency.exponentialRampToValueAtTime(50,t+0.3);g.gain.setValueAtTime(0.15,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.start(t);o.stop(t+0.3);}
    else if(type==='orb'){o.type='sine';o.frequency.setValueAtTime(660,t);o.frequency.exponentialRampToValueAtTime(1320,t+0.15);g.gain.setValueAtTime(0.1,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.2);o.start(t);o.stop(t+0.2);}
    else if(type==='boom'){o.type='square';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(20,t+0.5);g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.5);o.start(t);o.stop(t+0.5);}
    else if(type==='laser'){o.type='sawtooth';o.frequency.setValueAtTime(1200,t);o.frequency.exponentialRampToValueAtTime(200,t+0.15);g.gain.setValueAtTime(0.08,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.15);o.start(t);o.stop(t+0.15);}
    else if(type==='shield'){o.type='sine';o.frequency.setValueAtTime(440,t);o.frequency.exponentialRampToValueAtTime(880,t+0.2);g.gain.setValueAtTime(0.1,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.start(t);o.stop(t+0.3);}
    else if(type==='boss'){o.type='triangle';o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(55,t+0.8);g.gain.setValueAtTime(0.15,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.8);o.start(t);o.stop(t+0.8);}
    else if(type==='win'){o.type='sine';o.frequency.setValueAtTime(523,t);o.frequency.setValueAtTime(659,t+0.15);o.frequency.setValueAtTime(784,t+0.3);g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.5);o.start(t);o.stop(t+0.5);}
    else if(type==='death'){o.type='sawtooth';o.frequency.setValueAtTime(440,t);o.frequency.exponentialRampToValueAtTime(20,t+1);g.gain.setValueAtTime(0.15,t);g.gain.exponentialRampToValueAtTime(0.001,t+1);o.start(t);o.stop(t+1);}
    else if(type==='pwr'){o.type='sine';o.frequency.setValueAtTime(523,t);o.frequency.exponentialRampToValueAtTime(1047,t+0.2);g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.3);o.start(t);o.stop(t+0.3);}
    }catch(e){}
}

// ─── UTILS ───
function dist(a,b,c,d){return Math.sqrt((c-a)**2+(d-b)**2);}
function lerp(a,b,t){return a+(b-a)*t;}
function rnd(a,b){return Math.random()*(b-a)+a;}
function edgePos(){const s=Math.floor(Math.random()*4),m=40;if(s===0)return{x:rnd(0,canvas.width),y:-m};if(s===1)return{x:canvas.width+m,y:rnd(0,canvas.height)};if(s===2)return{x:rnd(0,canvas.width),y:canvas.height+m};return{x:-m,y:rnd(0,canvas.height)};}
function emit(x,y,col,n,spd=3,sz=3){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=Math.random()*spd+1;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,size:Math.random()*sz+1,color:col,life:1,decay:rnd(0.015,0.04)});}}
function floatText(x,y,text,col,sz=18){texts.push({x,y,text,color:col,size:sz,life:1,vy:-2});}
function announce(text,col,dur=120){G.announce={text,color:col};G.announceTimer=dur;}

// ─── STARS ───
function initStars(){G.stars=[];for(let i=0;i<100;i++)G.stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,s:rnd(0.5,2),b:Math.random(),t:rnd(0.005,0.02)});}
initStars();

// ─── SPAWN ENEMY (varied types!) ───
function spawnEnemy(){
    const p=edgePos();
    // Pick random type, more types unlock as phases progress
    const maxType = Math.min(ETYPES.length, 2 + G.phase);
    const type = ETYPES[Math.floor(Math.random()*maxType)];
    const speedMult = 1 + G.phase*0.08 + Math.min(G.time/5000,1.5);

    const e = {
        x:p.x, y:p.y, vx:0, vy:0,
        size: type.size * rnd(0.9,1.1),
        speed: type.speed * speedMult * rnd(0.85,1.15),
        color: type.color,
        glow: type.glow,
        behavior: type.behavior,
        shape: type.shape,
        life: 1,
        // behavior state
        angle: Math.random()*Math.PI*2,
        zigDir: 1, zigTimer: 0,
        ghostVisible: true, ghostTimer: 0,
        opacity: 1,
        orbitAngle: rnd(0,6.28), orbitRadius: rnd(100,200),
        orbitCX: canvas.width/2, orbitCY: canvas.height/2,
        splitDone: false,
        dashTimer: rnd(60,150), dashing: false, dashVx:0, dashVy:0,
    };
    enemies.push(e);
}

// ─── SPAWN ORB ───
function spawnOrb(){const m=100;orbs.push({x:rnd(m,canvas.width-m),y:rnd(m,canvas.height-m),size:14,timer:0,maxTimer:300,pulse:rnd(0,6.28)});}

// ─── SPAWN COIN ───
function spawnCoin(){
    const m=60;
    const isRare = Math.random() < 0.03; // 3% chance for rare
    coins.push({
        x:rnd(m,canvas.width-m),y:rnd(m,canvas.height-m),
        size:isRare?14:10, timer:0, pulse:rnd(0,6.28), isRare
    });
}

// ─── SPAWN POWER-UP ───
function spawnPowerup(){
    const m=100;
    const type = PTYPES[Math.floor(Math.random()*PTYPES.length)];
    // Don't spawn extra life if at max
    if(type.name==='Vida Extra' && G.lives>=3) return spawnPowerup();
    powerups.push({x:rnd(m,canvas.width-m),y:rnd(m,canvas.height-m),size:16,type,timer:0,maxTimer:480,pulse:rnd(0,6.28)});
}

// ─── ACTIVATE POWER-UP ───
function activatePowerup(type){
    snd('pwr');
    switch(type.name){
        case 'Escudo':
            G.shieldActive=true;G.shieldTimer=type.duration;G.shieldHits=3;
            announce('🛡️ ESCUDO ATIVADO!','#00ff88',90);
            break;
        case 'Laser':
            G.laserActive=true;G.laserAmmo=10;
            announce('🔫 LASER! 10 tiros — Clique!','#ff0000',90);
            break;
        case 'Vida Extra':
            if(G.lives<3){G.lives++;updateLives();}
            G.score+=100;
            break;
        case 'Nuke':
        case 'Bomba':
            enemies.forEach(e=>{emit(e.x,e.y,e.color,5,3);G.score+=10;});
            enemies=[];
            G.shake=20;snd('boom');
            announce('💥 BOOM!','#ffaa00',90);
            break;
        case 'Slow-Mo':
            G.slowMo=true;G.slowTimer=type.duration||300;
            announce('⏰ SLOW MOTION!','#00aaff',90);
            break;
        case 'Guarda-Costa':
            G.guardActive=true;
            announce('💂 GUARDA-COSTA ATIVO!','#00aaff',90);
            break;
        case 'Ímã':
            G.magnetActive=true;G.magnetTimer=900; // 15s
            announce('🧲 ÍMÃ DE MOEDAS!','#ff00ff',90);
            break;
    }
}

// ─── SHOOT LASER ───
function shootLaser(){
    if(!G.laserActive||G.laserAmmo<=0||G.laserCooldown>0)return;
    G.laserCooldown=10;
    G.laserAmmo--;

    // Find nearest enemy to mouse direction
    // Shoot beam from cursor toward nearest enemy or forward
    let target = null, minD = Infinity;

    // Find closest enemy
    enemies.forEach(e=>{
        const d=dist(mouse.x,mouse.y,e.x,e.y);
        if(d<minD){minD=d;target=e;}
    });

    // Also check boss
    if(G.boss&&G.boss.hp>0&&G.boss.visible!==false){
        const d=dist(mouse.x,mouse.y,G.boss.x,G.boss.y);
        if(d<minD){minD=d;target={x:G.boss.x,y:G.boss.y,isBoss:true};}
    }

    if(!target)return;

    const angle=Math.atan2(target.y-mouse.y,target.x-mouse.x);
    const beamLen=800;
    const ex=mouse.x+Math.cos(angle)*beamLen;
    const ey=mouse.y+Math.sin(angle)*beamLen;

    // Add beam visual
    G.laserBeams.push({x1:mouse.x,y1:mouse.y,x2:ex,y2:ey,life:12,angle});

    snd('laser');
    emit(mouse.x,mouse.y,'#ff0000',5,2,2);

    // Check if ammo ran out
    if(G.laserAmmo<=0){G.laserActive=false;announce('🔫 Sem munição!','#ff6600',60);}

    // Damage enemies along the beam
    const beamWidth=20;
    for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];
        // Point-to-line distance
        const d=pointToLineDist(e.x,e.y,mouse.x,mouse.y,ex,ey);
        if(d<beamWidth+e.size){
            emit(e.x,e.y,e.color,10,4,3);
            floatText(e.x,e.y-10,'💀','#ff0000',14);
            G.score+=15;
            enemies.splice(i,1);
        }
    }

    // Damage boss
    if(G.boss&&G.boss.hp>0&&G.boss.visible!==false){
        const d=pointToLineDist(G.boss.x,G.boss.y,mouse.x,mouse.y,ex,ey);
        if(d<beamWidth+G.boss.size){
            damageBoss(5);
        }
    }
}

function pointToLineDist(px,py,x1,y1,x2,y2){
    const A=px-x1,B=py-y1,C=x2-x1,D=y2-y1;
    const dot=A*C+B*D,lenSq=C*C+D*D;
    let t=lenSq!==0?dot/lenSq:0;
    t=Math.max(0,Math.min(1,t));
    const closestX=x1+t*C,closestY=y1+t*D;
    return dist(px,py,closestX,closestY);
}

// ─── CREATE BOSS ───
function createBoss(){
    const loop=Math.floor((G.phase-1)/10);
    const idx=((G.phase-1)%10)+1;
    const cfg=BOSSES[idx];
    const hpMult=1+loop*0.5;
    return {x:canvas.width/2,y:canvas.height*0.25,size:40+loop*5,hp:Math.floor(cfg.hp*hpMult),maxHp:Math.floor(cfg.hp*hpMult),
        color:cfg.color,name:cfg.name,icon:cfg.icon,speed:cfg.speed+loop*0.3,id:cfg.id,
        timer:0,attackTimer:0,angle:0,visible:true,visTimer:0,splitCount:0,chaosPhase:0,chaosTimer:0};
}

// ─── MOUSE UPDATE ───
function updateMouse(){
    if(G.inverted){const cx=canvas.width/2,cy=canvas.height/2;mouse.x=lerp(mouse.x,cx-(mouse.rawX-cx),0.12);mouse.y=lerp(mouse.y,cy-(mouse.rawY-cy),0.12);}
    else{mouse.x=mouse.rawX;mouse.y=mouse.rawY;}
    mouse.trail.unshift({x:mouse.x,y:mouse.y});if(mouse.trail.length>15)mouse.trail.pop();
}

// ─── UPDATE ENEMIES (varied AI!) ───
function updateEnemies(){
    const speedFactor = G.slowMo ? 0.3 : 1;

    enemies.forEach(e=>{
        e.angle+=0.02;

        switch(e.behavior){
            case 'chase':{
                const a=Math.atan2(mouse.y-e.y,mouse.x-e.x);
                e.vx=lerp(e.vx,Math.cos(a)*e.speed,0.04);
                e.vy=lerp(e.vy,Math.sin(a)*e.speed,0.04);
                break;}
            case 'zigzag':{
                const a=Math.atan2(mouse.y-e.y,mouse.x-e.x);
                e.zigTimer=(e.zigTimer||0)+1;
                if(e.zigTimer>30){e.zigDir*=-1;e.zigTimer=0;}
                const perp=a+(Math.PI/2)*e.zigDir;
                e.vx=Math.cos(a)*e.speed*0.7+Math.cos(perp)*e.speed*0.5;
                e.vy=Math.sin(a)*e.speed*0.7+Math.sin(perp)*e.speed*0.5;
                break;}
            case 'ghost':{
                e.ghostTimer=(e.ghostTimer||0)+1;
                if(e.ghostTimer>80){e.ghostVisible=!e.ghostVisible;e.ghostTimer=0;
                    if(e.ghostVisible)emit(e.x,e.y,e.color,4,2,2);}
                e.opacity=e.ghostVisible?lerp(e.opacity,0.9,0.05):lerp(e.opacity,0.1,0.05);
                const a=Math.atan2(mouse.y-e.y,mouse.x-e.x);
                e.vx=Math.cos(a)*e.speed;e.vy=Math.sin(a)*e.speed;
                break;}
            case 'orbit':{
                e.orbitCX=lerp(e.orbitCX,mouse.x,0.008);
                e.orbitCY=lerp(e.orbitCY,mouse.y,0.008);
                e.orbitAngle+=0.03*e.speed;
                e.orbitRadius=Math.max(e.orbitRadius-0.1,25);
                const tx=e.orbitCX+Math.cos(e.orbitAngle)*e.orbitRadius;
                const ty=e.orbitCY+Math.sin(e.orbitAngle)*e.orbitRadius;
                e.vx=(tx-e.x)*0.08;e.vy=(ty-e.y)*0.08;
                break;}
            case 'split':{
                const a=Math.atan2(mouse.y-e.y,mouse.x-e.x);
                e.vx=Math.cos(a)*e.speed;e.vy=Math.sin(a)*e.speed;
                if(!e.splitDone&&dist(e.x,e.y,mouse.x,mouse.y)<130){
                    e.splitDone=true;e.life=0;
                    for(let i=0;i<3;i++){
                        const p=edgePos();
                        enemies.push({x:e.x+rnd(-20,20),y:e.y+rnd(-20,20),vx:0,vy:0,size:6,speed:3.2+G.phase*0.1,
                            color:'#ff0088',glow:'rgba(255,0,136,0.5)',behavior:'chase',shape:'circle',life:1,
                            opacity:1,ghostVisible:true,ghostTimer:0,zigDir:1,zigTimer:0,angle:0,
                            orbitAngle:0,orbitRadius:100,orbitCX:0,orbitCY:0,splitDone:false,dashTimer:100,dashing:false,dashVx:0,dashVy:0});
                    }
                    emit(e.x,e.y,e.color,12,4);snd('boom');
                }
                break;}
            case 'dash':{
                e.dashTimer=(e.dashTimer||0)-1;
                if(e.dashing){
                    e.vx=e.dashVx;e.vy=e.dashVy;
                    e.dashTimer--;
                    if(e.dashTimer<=0){e.dashing=false;e.dashTimer=rnd(80,150);}
                } else {
                    // Slow approach
                    const a=Math.atan2(mouse.y-e.y,mouse.x-e.x);
                    e.vx=Math.cos(a)*e.speed*0.3;e.vy=Math.sin(a)*e.speed*0.3;
                    if(e.dashTimer<=0){
                        e.dashing=true;e.dashTimer=15;
                        const da=Math.atan2(mouse.y-e.y,mouse.x-e.x);
                        e.dashVx=Math.cos(da)*e.speed*4;e.dashVy=Math.sin(da)*e.speed*4;
                        emit(e.x,e.y,e.color,6,2);
                    }
                }
                break;}
        }

        e.x+=e.vx*speedFactor*G.dt;
        e.y+=e.vy*speedFactor*G.dt;
    });

    // Remove dead (split)
    enemies=enemies.filter(e=>e.life>0);
}

// ─── BOSS AI ───
function updateBoss(b){
    if(!b||b.hp<=0)return;
    b.timer++;b.attackTimer++;b.angle+=0.02;
    const tx=canvas.width/2+Math.cos(b.angle)*150;
    const ty=canvas.height*0.28+Math.sin(b.angle*0.7)*80;
    b.x=lerp(b.x,tx,0.02);b.y=lerp(b.y,ty,0.02);
    const speedFactor=G.slowMo?0.4:1;

    switch(b.id){
        case 1:if(b.attackTimer%80===0){for(let i=0;i<2;i++)spawnBossMinion(b,'#00ff44');emit(b.x,b.y,'#00ff44',8);}break;
        case 2:if(b.attackTimer%60===0){const a=Math.atan2(mouse.y-b.y,mouse.x-b.x);projectiles.push({x:b.x,y:b.y,vx:Math.cos(a)*3.5*speedFactor,vy:Math.sin(a)*3.5*speedFactor,size:8,color:'#9933ff',type:'bullet',life:250});emit(b.x,b.y,'#9933ff',5);}break;
        case 3:G.darkness=true;b.visTimer++;if(b.visTimer>70){b.visible=!b.visible;b.visTimer=0;if(b.visible){b.x=rnd(100,canvas.width-100);b.y=rnd(80,canvas.height-100);emit(b.x,b.y,'#6644cc',12,4);}}
            if(b.attackTimer%45===0&&b.visible){const a=Math.atan2(mouse.y-b.y,mouse.x-b.x);projectiles.push({x:b.x,y:b.y,vx:Math.cos(a)*4*speedFactor,vy:Math.sin(a)*4*speedFactor,size:6,color:'#6644cc',type:'bullet',life:180});}break;
        case 4:if(b.attackTimer%25===0)projectiles.push({x:rnd(50,canvas.width-50),y:-20,vx:rnd(-0.5,0.5),vy:rnd(3,6)*speedFactor,size:12,color:'#ff4400',type:'meteor',life:300});b.y=lerp(b.y,80,0.02);break;
        case 5:if(b.attackTimer%100===0){const side=Math.random()>0.5;obstacles.push({x:side?-20:canvas.width+20,y:rnd(80,canvas.height-80),w:600,h:22,vx:(side?3:-3)*speedFactor,color:'#0088ff',type:'tentacle',life:250});snd('boom');}break;
        case 6:if(b.attackTimer%90===0){fakes.push({x:rnd(80,canvas.width-80),y:rnd(80,canvas.height-80),vx:rnd(-2,2),vy:rnd(-2,2),life:250});emit(b.x,b.y,'#aa00ff',8);}
            if(b.attackTimer%50===0){const a=rnd(0,6.28);projectiles.push({x:b.x,y:b.y,vx:Math.cos(a)*3.5*speedFactor,vy:Math.sin(a)*3.5*speedFactor,size:6,color:'#aa00ff',type:'bullet',life:200});}break;
        case 7:if(b.attackTimer%150===0){G.inverted=!G.inverted;G.invertFlash=30;announce(G.inverted?'🔄 INVERTIDO!':'✅ NORMAL!',G.inverted?'#ff0000':'#00ff88',90);}
            if(b.attackTimer%100===0){const a=Math.atan2(mouse.y-b.y,mouse.x-b.x);b.x+=Math.cos(a)*100;b.y+=Math.sin(a)*100;emit(b.x,b.y,'#ff0000',15,5);snd('boom');}break;
        case 8:if(b.attackTimer%40===0){for(let i=0;i<3;i++){const a=Math.atan2(mouse.y-b.y,mouse.x-b.x)+rnd(-0.4,0.4);projectiles.push({x:b.x+rnd(-20,20),y:b.y+rnd(-20,20),vx:Math.cos(a)*3*speedFactor,vy:Math.sin(a)*3*speedFactor,size:7,color:'#00cc44',type:'bullet',life:200});}}break;
        case 9:if(b.attackTimer%120===0){obstacles.push({x:rnd(80,canvas.width-80),y:rnd(80,canvas.height-80),radius:10,maxRadius:rnd(70,130),color:'#ff0044',type:'deathzone',life:350,growing:true});snd('boom');}
            b.x=lerp(b.x,mouse.x,0.006);b.y=lerp(b.y,mouse.y,0.006);break;
        case 10:b.chaosTimer++;if(b.chaosTimer>150){b.chaosPhase=(b.chaosPhase+1)%4;b.chaosTimer=0;}
            if(b.chaosPhase===0&&b.attackTimer%30===0)projectiles.push({x:rnd(40,canvas.width-40),y:-20,vx:0,vy:rnd(3,5)*speedFactor,size:10,color:'#ff4400',type:'meteor',life:300});
            if(b.chaosPhase===1&&b.attackTimer%50===0){for(let i=0;i<3;i++){const a=rnd(0,6.28);projectiles.push({x:b.x,y:b.y,vx:Math.cos(a)*4*speedFactor,vy:Math.sin(a)*4*speedFactor,size:6,color:'#ffaa00',type:'bullet',life:200});}}
            if(b.chaosPhase===2)G.darkness=true;else if(b.id===10&&b.chaosPhase!==2)G.darkness=false;
            if(b.chaosPhase===3&&b.attackTimer%160===0){G.inverted=!G.inverted;G.invertFlash=30;}break;
    }
}

function spawnBossMinion(b,col){
    enemies.push({x:b.x+rnd(-30,30),y:b.y+rnd(-30,30),vx:0,vy:0,size:7,speed:2.5+G.phase*0.1,
        color:col,glow:col+'88',behavior:'chase',shape:'circle',life:1,opacity:1,
        ghostVisible:true,ghostTimer:0,zigDir:1,zigTimer:0,angle:0,
        orbitAngle:0,orbitRadius:100,orbitCX:0,orbitCY:0,splitDone:false,dashTimer:100,dashing:false,dashVx:0,dashVy:0});
}

// ─── DAMAGE BOSS ───
function damageBoss(dmg){
    if(!G.boss||G.boss.hp<=0)return;
    G.boss.hp-=dmg;G.shake=5;emit(G.boss.x,G.boss.y,'#ffffff',6,4);snd('orb');
    document.getElementById('bossHpFill').style.width=Math.max(0,G.boss.hp/G.boss.maxHp*100)+'%';
    if(G.boss.id===1&&G.boss.splitCount<2){const th=[0.66,0.33];if(G.boss.hp/G.boss.maxHp<th[G.boss.splitCount]){G.boss.splitCount++;for(let i=0;i<4;i++)spawnBossMinion(G.boss,'#00ff44');emit(G.boss.x,G.boss.y,'#00ff44',20,5);snd('boom');floatText(G.boss.x,G.boss.y-30,'SPLIT!','#00ff44',24);}}
    if(G.boss.hp<=0)bossDefeated();
}

function bossDefeated(){
    G.bossActive=false;G.darkness=false;G.inverted=false;fakes=[];obstacles=[];projectiles=[];
    emit(G.boss.x,G.boss.y,G.boss.color,50,8,5);emit(G.boss.x,G.boss.y,'#ffffff',30,6,4);
    G.shake=25;G.score+=300*G.phase;snd('win');
    announce(G.boss.icon+' '+G.boss.name+' DERROTADO!','#00ff88',150);
    document.getElementById('bossHpContainer').style.display='none';
    G.phase++;G.bossTimer=0;
    G.spawnRate=Math.max(12,70-G.phase*3);
    G.bossInterval=Math.max(350,900-G.phase*30);
    setTimeout(()=>{const idx=((G.phase-1)%10)+1;const next=BOSSES[idx];announce('FASE '+G.phase+' — '+next.icon+' '+next.name+' se aproxima...','#ffaa00',180);},2500);
}

// ─── COLLISION ───
function checkCollisions(){
    const ps=12;

    for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];
        if(e.behavior==='ghost'&&!e.ghostVisible)continue;
        if(dist(mouse.x,mouse.y,e.x,e.y)<ps+e.size){
            if(G.shieldActive){
                // Shield absorbs hit and destroys enemy
                emit(e.x,e.y,'#00ff88',12,4);G.score+=20;enemies.splice(i,1);
                G.shieldHits--;snd('shield');
                if(G.shieldHits<=0){G.shieldActive=false;G.shieldTimer=0;announce('🛡️ Escudo quebrou!','#ff6600',60);}
                continue;
            }
            if(!G.invincible){takeDamage();enemies.splice(i,1);return;}
        }
    }

    for(let i=projectiles.length-1;i>=0;i--){
        if(dist(mouse.x,mouse.y,projectiles[i].x,projectiles[i].y)<ps+projectiles[i].size){
            if(G.shieldActive){emit(projectiles[i].x,projectiles[i].y,'#00ff88',8,3);projectiles.splice(i,1);G.shieldHits--;snd('shield');if(G.shieldHits<=0){G.shieldActive=false;G.shieldTimer=0;}continue;}
            if(!G.invincible){takeDamage();projectiles.splice(i,1);return;}
        }
    }

    if(G.boss&&G.boss.hp>0&&G.boss.visible!==false){
        if(dist(mouse.x,mouse.y,G.boss.x,G.boss.y)<ps+G.boss.size){
            if(!G.shieldActive&&!G.invincible)takeDamage();
        }
    }

    for(const o of obstacles){
        if(o.type==='tentacle'){if(mouse.x>o.x&&mouse.x<o.x+o.w&&mouse.y>o.y&&mouse.y<o.y+o.h){if(!G.shieldActive&&!G.invincible)takeDamage();}}
        else if(o.type==='deathzone'){if(dist(mouse.x,mouse.y,o.x,o.y)<o.radius){if(!G.shieldActive&&!G.invincible)takeDamage();}}
    }

    // Guarda-costa kill
    if(G.guardActive){
        const gx=mouse.x+Math.cos(G.guardAngle)*40;
        const gy=mouse.y+Math.sin(G.guardAngle)*40;
        for(let i=enemies.length-1;i>=0;i--){
            if(dist(gx,gy,enemies[i].x,enemies[i].y)<15+enemies[i].size){
                emit(enemies[i].x,enemies[i].y,'#00aaff',8,3);G.score+=15;enemies.splice(i,1);snd('hit');
            }
        }
    }

    for(let i=orbs.length-1;i>=0;i--){
        if(dist(mouse.x,mouse.y,orbs[i].x,orbs[i].y)<ps+orbs[i].size){
            const o=orbs[i];orbs.splice(i,1);damageBoss(10);G.score+=25;
            emit(o.x,o.y,'#ffaa00',10,3);floatText(o.x,o.y-10,'⚔️ -10HP!','#ffaa00',16);
        }
    }

    for(let i=coins.length-1;i>=0;i--){
        const c=coins[i];
        if(dist(mouse.x,mouse.y,c.x,c.y)<ps+c.size + (G.magnetActive?80:0)){ // Magnet radius
            coins.splice(i,1);
            
            // Combo System
            G.coinCombo++;
            G.coinComboTimer = 180; // 3 seconds to keep combo
            let mult = 1;
            if(G.coinCombo>15) mult = 5;
            else if(G.coinCombo>5) mult = 3;
            else if(G.coinCombo>2) mult = 2;

            const val = (c.isRare ? 100 : 1) * mult;
            savedData.coins += val;
            G.sessionCoins += val;
            G.score += val * 25;

            let col = c.isRare ? '#00ffff' : '#ffdd00';
            emit(c.x,c.y,col,10,3);
            let t = `+${val}`;
            if(mult>1) t += ` (x${mult}!)`;
            floatText(c.x,c.y-10,t,col,16);
            snd('coin');
            updateGlobalUI();
        }
    }

    // Power-ups
    for(let i=powerups.length-1;i>=0;i--){
        if(dist(mouse.x,mouse.y,powerups[i].x,powerups[i].y)<ps+powerups[i].size){
            const p=powerups[i];activatePowerup(p.type);
            emit(p.x,p.y,p.type.color,15,4,3);floatText(p.x,p.y-15,p.type.icon+' '+p.type.name,p.type.color,20);
            powerups.splice(i,1);
        }
    }
}

function takeDamage(){
    G.lives--;G.invincible=true;G.invTimer=120;G.shake=12;
    emit(mouse.x,mouse.y,'#ff0044',25,5,4);snd('hit');updateLives();
    if(G.lives<=0)gameOver();
}

// ─── GAME FLOW ───
function startGame(){
    try{aud();}catch(e){}
    G.running=true;G.state='PLAYING';G.score=0;G.lives=3;G.phase=1;G.time=0;
    G.spawnTimer=0;G.spawnRate=70;G.bossTimer=0;G.bossInterval=900;
    G.bossActive=false;G.boss=null;G.invincible=false;G.invTimer=0;G.shake=0;
    G.darkness=false;G.inverted=false;G.invertFlash=0;G.orbTimer=0;
    G.shieldActive=false;G.shieldTimer=0;G.shieldHits=0;
    G.laserActive=false;G.laserAmmo=0;G.laserBeams=[];G.laserCooldown=0;
    G.slowMo=false;G.slowTimer=0;G.pwrTimer=0;
    G.guardActive=false;G.magnetActive=false;
    G.coinCombo=0;G.sessionCoins=0;
    G.announce=null;G.announceTimer=0;
    enemies=[];orbs=[];coins=[];particles=[];texts=[];projectiles=[];obstacles=[];fakes=[];powerups=[];
    mouse.trail=[];updateLives();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('shopScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('inventoryUI').classList.remove('hidden');
    document.getElementById('hudPhase').textContent='1';
    document.getElementById('bossHpContainer').style.display='none';
    const b=BOSSES[1];announce('FASE 1 — '+b.icon+' '+b.name+' se aproxima...','#ffaa00',180);
    for(let i=0;i<3;i++)spawnCoin();
}

function gameOver(){
    G.state='GAMEOVER';G.running=false;G.darkness=false;G.inverted=false;
    G.shieldActive=false;G.laserActive=false;G.slowMo=false;G.guardActive=false;
    emit(mouse.x,mouse.y,'#ff0044',50,8,5);G.shake=25;snd('death');
    
    // Save data
    saveData();
    
    setTimeout(()=>{
        document.getElementById('goPhase').textContent=G.phase;
        document.getElementById('goScore').textContent=G.score.toLocaleString();
        document.getElementById('goCoinsGained').textContent='+'+G.sessionCoins;
        
        // Near miss psychology
        let nextItem = SHOP_ITEMS.find(i=>i.price > savedData.coins);
        if(nextItem && savedData.coins > nextItem.price * 0.5){
            document.getElementById('nearMissMsg').textContent = `Faltam só ${nextItem.price - savedData.coins} moedas pro ${nextItem.name}!`;
        } else {
            document.getElementById('nearMissMsg').textContent = "";
        }

        document.getElementById('hud').classList.add('hidden');
        document.getElementById('inventoryUI').classList.add('hidden');
        document.getElementById('gameOverScreen').classList.remove('hidden');
    },1500);
}

function restartFull(){
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
    document.getElementById('inventoryUI').classList.add('hidden');
    G.state='MENU';G.running=false;
    enemies=[];orbs=[];coins=[];projectiles=[];obstacles=[];fakes=[];particles=[];texts=[];powerups=[];
}

// ─── INVENTORY HANDLING ───
window.addEventListener('keydown', e => {
    if(G.state!=='PLAYING') return;
    const key = e.key;
    if(key>='1' && key<='6'){
        useInventoryItem(parseInt(key)-1);
    }
});

function useInventoryItem(index){
    const items = ['Munição', 'Escudo', 'Guarda-Costa', 'Bomba', 'Ímã', 'Vida'];
    const id = items[index];
    if(savedData.inventory[id] > 0){
        // Special case for life, can only use if < 3
        if(id==='Vida' && G.lives>=3){ announce('Vida cheia!','#ff3366',60); return; }
        
        savedData.inventory[id]--;
        saveData();
        activatePowerup({name:id, duration: id==='Escudo'?300:(id==='Ímã'?900:0)});
        // Visual feedback on slot
        const el = document.getElementById('invSlot'+(index+1));
        el.classList.add('active');
        setTimeout(()=>el.classList.remove('active'), 200);
    }
}

function updateInventoryUI(){
    const items = [
        {id:'Munição', icon:'🔫'}, {id:'Escudo', icon:'🛡️'}, {id:'Guarda-Costa', icon:'💂'},
        {id:'Bomba', icon:'💥'}, {id:'Ímã', icon:'🧲'}, {id:'Vida', icon:'❤️'}
    ];
    for(let i=0;i<6;i++){
        document.getElementById('invIcon'+(i+1)).textContent = items[i].icon;
        document.getElementById('invCount'+(i+1)).textContent = savedData.inventory[items[i].id];
        if(savedData.inventory[items[i].id]>0){
            document.getElementById('invSlot'+(i+1)).style.opacity = '1';
        } else {
            document.getElementById('invSlot'+(i+1)).style.opacity = '0.3';
        }
    }
}

function updateLives(){
    const el=document.getElementById('lives');el.innerHTML='';
    for(let i=0;i<3;i++){const h=document.createElement('span');h.className='heart'+(i>=G.lives?' lost':'');h.textContent='❤️';el.appendChild(h);}
}

// ─── MAIN UPDATE ───
function update(){
    const now=performance.now();G.dt=Math.min((now-G.lastTime)/16.67,3);G.lastTime=now;G.time++;G.bgPulse+=0.02;
    updateMouse();
    if(G.shake>0)G.shake*=0.9;if(G.shake<0.5)G.shake=0;
    if(G.invincible){G.invTimer-=G.dt;if(G.invTimer<=0)G.invincible=false;}
    if(G.invertFlash>0)G.invertFlash--;
    if(G.announceTimer>0)G.announceTimer-=G.dt;
    if(G.state!=='PLAYING')return;

    // Score
    if(G.time%20===0)G.score+=G.phase;

    // SHIELD timer
    if(G.shieldActive){G.shieldTimer-=G.dt;if(G.shieldTimer<=0){G.shieldActive=false;announce('🛡️ Escudo acabou!','#ff6600',60);}}

    // LASER
    if(G.laserActive){
        if(G.laserCooldown>0)G.laserCooldown-=G.dt;
        if(mouse.clicking)shootLaser();
    }
    // Laser beams decay
    G.laserBeams=G.laserBeams.filter(b=>{b.life-=G.dt;return b.life>0;});

    // SLOW-MO timer
    if(G.slowMo){G.slowTimer-=G.dt;if(G.slowTimer<=0){G.slowMo=false;announce('⏰ Slow-Mo acabou!','#ff6600',60);}}

    // Spawn enemies
    G.spawnTimer+=G.dt;
    if(G.spawnTimer>=G.spawnRate){spawnEnemy();G.spawnTimer=0;G.spawnRate=Math.max(8,G.spawnRate-0.015);}

    // Spawn coins
    if(G.time%150===0&&coins.length<5)spawnCoin();

    // Spawn power-ups
    G.pwrTimer+=G.dt;
    if(G.pwrTimer>600&&powerups.length<2){spawnPowerup();G.pwrTimer=0;} // every ~10s

    // Power-up timeout
    powerups.forEach(p=>{p.timer+=G.dt;p.pulse+=0.06;});
    powerups=powerups.filter(p=>p.timer<p.maxTimer);

    // Boss timer
    if(!G.bossActive){
        G.bossTimer+=G.dt;
        if(G.bossTimer>=G.bossInterval){
            G.boss=createBoss();G.bossActive=true;G.orbTimer=0;
            document.getElementById('bossHpContainer').style.display='';
            document.getElementById('bossHpLabel').textContent=G.boss.icon+' '+G.boss.name.toUpperCase();
            document.getElementById('bossHpFill').style.width='100%';
            announce('⚠️ '+G.boss.icon+' '+G.boss.name.toUpperCase()+' ⚠️','#ff0044',120);snd('boss');
        }
    }

    // Boss
    if(G.bossActive&&G.boss){
        updateBoss(G.boss);
        G.orbTimer+=G.dt;
        if(G.orbTimer>Math.max(50,100-G.phase*3)&&orbs.length<4){spawnOrb();G.orbTimer=0;}
    }

    // Enemies
    updateEnemies();

    // Projectiles
    const pSpeed=G.slowMo?0.4:1;
    projectiles.forEach(p=>{p.x+=p.vx*G.dt*pSpeed;p.y+=p.vy*G.dt*pSpeed;p.life-=G.dt;});
    projectiles=projectiles.filter(p=>p.life>0);

    // Obstacles
    obstacles.forEach(o=>{if(o.type==='tentacle'){o.x+=o.vx*G.dt*(G.slowMo?0.4:1);o.life-=G.dt;}else if(o.type==='deathzone'){if(o.growing&&o.radius<o.maxRadius)o.radius+=0.5*G.dt;o.life-=G.dt;}});
    obstacles=obstacles.filter(o=>o.life>0);

    // Fakes
    fakes.forEach(f=>{f.x+=f.vx*G.dt;f.y+=f.vy*G.dt;if(f.x<0||f.x>canvas.width)f.vx*=-1;if(f.y<0||f.y>canvas.height)f.vy*=-1;f.life-=G.dt;});
    fakes=fakes.filter(f=>f.life>0);

    // Orbs
    orbs.forEach(o=>{o.timer+=G.dt;o.pulse+=0.06;});
    orbs=orbs.filter(o=>o.timer<o.maxTimer);

    // Coins & Magnet & Combo
    if(G.coinComboTimer>0){
        G.coinComboTimer-=G.dt;
        if(G.coinComboTimer<=0) G.coinCombo=0;
    }
    if(G.magnetActive){
        G.magnetTimer-=G.dt;
        if(G.magnetTimer<=0) G.magnetActive=false;
        else {
            coins.forEach(c=>{
                if(dist(mouse.x,mouse.y,c.x,c.y)<250){
                    const a=Math.atan2(mouse.y-c.y,mouse.x-c.x);
                    c.x+=Math.cos(a)*5*G.dt;
                    c.y+=Math.sin(a)*5*G.dt;
                }
            });
        }
    }

    if(G.guardActive) G.guardAngle+=0.1*G.dt;

    coins.forEach(c=>{c.timer++;c.pulse+=0.06;});

    // Particles
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vx*=0.97;p.vy*=0.97;p.life-=p.decay;});
    particles=particles.filter(p=>p.life>0);

    // Texts
    texts.forEach(t=>{t.y+=t.vy;t.vy*=0.95;t.life-=0.015;});
    texts=texts.filter(t=>t.life>0);

    // Collisions
    checkCollisions();

    // HUD
    document.getElementById('hudScore').textContent=G.score.toLocaleString();
    document.getElementById('hudPhase').textContent=G.phase;
}

// ─── RENDER ───
function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(G.shake>0){ctx.save();ctx.translate((Math.random()-0.5)*G.shake*2,(Math.random()-0.5)*G.shake*2);}
    drawBg();

    if(G.state==='PLAYING'||G.state==='GAMEOVER'){
        drawGrid();

        // Obstacles
        obstacles.forEach(o=>{
            if(o.type==='tentacle'){ctx.fillStyle=o.color+'88';ctx.shadowColor=o.color;ctx.shadowBlur=15;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.shadowBlur=0;}
            else if(o.type==='deathzone'){ctx.beginPath();ctx.arc(o.x,o.y,o.radius,0,Math.PI*2);const g=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.radius);g.addColorStop(0,'rgba(255,0,50,0.35)');g.addColorStop(0.7,'rgba(255,0,50,0.15)');g.addColorStop(1,'rgba(255,0,50,0.03)');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='rgba(255,0,50,0.5)';ctx.lineWidth=2;ctx.stroke();}
        });

        // Coins
        coins.forEach(c=>{
            const isR=c.isRare;
            const p=Math.sin(c.pulse)*0.2+1,s=(isR?14:10)*p;
            ctx.beginPath();ctx.arc(c.x,c.y,s+6,0,Math.PI*2);
            const g1=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,s+6);
            g1.addColorStop(0,isR?'rgba(0,255,255,0.4)':'rgba(255,221,0,0.3)');g1.addColorStop(1,'transparent');ctx.fillStyle=g1;ctx.fill();
            
            ctx.beginPath();ctx.arc(c.x,c.y,s,0,Math.PI*2);
            const g2=ctx.createRadialGradient(c.x-2,c.y-2,0,c.x,c.y,s);
            if(isR){
                g2.addColorStop(0,'#ffffff');g2.addColorStop(0.6,'#00ffff');g2.addColorStop(1,'#0088ff');
            } else {
                g2.addColorStop(0,'#fff700');g2.addColorStop(0.6,'#ffcc00');g2.addColorStop(1,'#ff9900');
            }
            ctx.fillStyle=g2;ctx.fill();
            ctx.fillStyle=isR?'#004466':'#996600';ctx.font=`bold ${s}px Orbitron`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(isR?'💎':'$',c.x,c.y);
        });

        // Power-ups
        powerups.forEach(p=>{
            const sz=Math.sin(p.pulse)*3+p.size;
            const fade=p.timer>p.maxTimer*0.7?Math.sin(p.timer*0.1)*0.3+0.7:1;
            ctx.globalAlpha=fade;
            ctx.beginPath();ctx.arc(p.x,p.y,sz+12,0,Math.PI*2);
            const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,sz+12);g.addColorStop(0,p.type.color+'33');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fill();
            ctx.beginPath();ctx.arc(p.x,p.y,sz,0,Math.PI*2);ctx.strokeStyle=p.type.color;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fill();
            ctx.font=`${sz*1.3}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.type.icon,p.x,p.y);
            ctx.globalAlpha=1;
        });

        // Orbs
        orbs.forEach(o=>{
            const p=Math.sin(o.pulse)*3+o.size;
            ctx.beginPath();ctx.arc(o.x,o.y,p+10,0,Math.PI*2);const g=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,p+10);g.addColorStop(0,'rgba(255,170,0,0.25)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fill();
            ctx.beginPath();ctx.arc(o.x,o.y,p,0,Math.PI*2);ctx.strokeStyle='#ffaa00';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fill();
            ctx.font=`${p*1.3}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⚔️',o.x,o.y);
        });

        // Projectiles
        projectiles.forEach(p=>{
            ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
            if(p.type==='meteor'){const mg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);mg.addColorStop(0,'#fff');mg.addColorStop(0.3,p.color);mg.addColorStop(1,p.color+'88');ctx.fillStyle=mg;ctx.fill();if(Math.random()<0.5)emit(p.x,p.y-5,p.color,1,1,2);}
            else{ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;}
        });

        // Enemies (varied shapes!)
        enemies.forEach(e=>{
            ctx.globalAlpha=e.opacity!==undefined?e.opacity:1;
            // Glow
            ctx.beginPath();ctx.arc(e.x,e.y,e.size+8,0,Math.PI*2);
            const g1=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size+8);g1.addColorStop(0,(e.glow||e.color+'88'));g1.addColorStop(1,'transparent');ctx.fillStyle=g1;ctx.fill();
            // Shape
            ctx.beginPath();
            if(e.shape==='triangle'){
                ctx.moveTo(e.x,e.y-e.size);ctx.lineTo(e.x+e.size*0.87,e.y+e.size*0.5);ctx.lineTo(e.x-e.size*0.87,e.y+e.size*0.5);ctx.closePath();
            } else if(e.shape==='diamond'){
                ctx.moveTo(e.x,e.y-e.size);ctx.lineTo(e.x+e.size,e.y);ctx.lineTo(e.x,e.y+e.size);ctx.lineTo(e.x-e.size,e.y);ctx.closePath();
            } else if(e.shape==='hexagon'){
                for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6;const px=e.x+Math.cos(a)*e.size;const py=e.y+Math.sin(a)*e.size;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();
            } else {
                ctx.arc(e.x,e.y,e.size,0,Math.PI*2);
            }
            const g2=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size);g2.addColorStop(0,'#fff');g2.addColorStop(0.3,e.color);g2.addColorStop(1,e.color+'88');ctx.fillStyle=g2;ctx.fill();
            // Eye
            const ea=Math.atan2(mouse.y-e.y,mouse.x-e.x);
            ctx.beginPath();ctx.arc(e.x,e.y,e.size*0.3,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
            ctx.beginPath();ctx.arc(e.x+Math.cos(ea)*e.size*0.15,e.y+Math.sin(ea)*e.size*0.15,e.size*0.15,0,Math.PI*2);ctx.fillStyle='#000';ctx.fill();
            ctx.globalAlpha=1;
        });

        // Boss
        if(G.boss&&G.boss.hp>0)drawBoss(G.boss);

        // Fakes
        fakes.forEach(f=>{ctx.strokeStyle='#00ffff';ctx.lineWidth=2;ctx.shadowColor='#00ffff';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(f.x,f.y,10,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(f.x,f.y,4,0,Math.PI*2);ctx.fillStyle='#00ffff';ctx.fill();ctx.shadowBlur=0;});

        // Laser beams!
        G.laserBeams.forEach(b=>{
            const alpha=b.life/12;
            ctx.save();ctx.globalAlpha=alpha;
            ctx.strokeStyle='#ff0000';ctx.lineWidth=4;ctx.shadowColor='#ff0000';ctx.shadowBlur=20;
            ctx.beginPath();ctx.moveTo(b.x1,b.y1);ctx.lineTo(b.x2,b.y2);ctx.stroke();
            // Inner bright core
            ctx.strokeStyle='#ffaaaa';ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(b.x1,b.y1);ctx.lineTo(b.x2,b.y2);ctx.stroke();
            ctx.shadowBlur=0;ctx.restore();
        });

        // Particles
        particles.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.fill();ctx.globalAlpha=1;});

        // Texts
        texts.forEach(t=>{ctx.globalAlpha=t.life;ctx.font=`bold ${t.size}px Orbitron`;ctx.textAlign='center';ctx.fillStyle=t.color;ctx.shadowColor=t.color;ctx.shadowBlur=10;ctx.fillText(t.text,t.x,t.y);ctx.shadowBlur=0;ctx.globalAlpha=1;});

        // Darkness
        if(G.darkness)drawDarkness();
        // Invert flash
        if(G.invertFlash>0){ctx.fillStyle=`rgba(255,0,0,${G.invertFlash/60})`;ctx.fillRect(0,0,canvas.width,canvas.height);}

        // Player
        drawPlayer();

        // Active power-up indicators
        drawPowerIndicators();
    }

    // Announcement
    if(G.announceTimer>0&&G.announce){
        ctx.save();const a=Math.min(G.announceTimer/20,1);ctx.globalAlpha=a;
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,canvas.height/2-40,canvas.width,80);
        const fs=Math.min(canvas.width*0.04,36);ctx.font=`bold ${fs}px Orbitron`;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle=G.announce.color;ctx.shadowColor=G.announce.color;ctx.shadowBlur=20;
        ctx.fillText(G.announce.text,canvas.width/2,canvas.height/2);ctx.shadowBlur=0;ctx.restore();
    }

    // Enemy counter & Combo
    if(G.state==='PLAYING'){
        ctx.font='11px Orbitron';ctx.fillStyle='rgba(255,255,255,0.25)';ctx.textAlign='right';ctx.fillText('Inimigos: '+enemies.length,canvas.width-15,canvas.height-15);
        
        if(G.coinCombo>1){
            ctx.font='bold 16px Orbitron';ctx.fillStyle='#ffdd00';ctx.textAlign='left';
            ctx.fillText('Combo: x'+G.coinCombo, 15, canvas.height-80);
            ctx.fillStyle='rgba(255,221,0,0.3)';ctx.fillRect(15,canvas.height-75,100,4);
            ctx.fillStyle='#ffdd00';ctx.fillRect(15,canvas.height-75,100*(G.coinComboTimer/180),4);
        }
    }

    if(G.shake>0)ctx.restore();
}

function drawPowerIndicators(){
    let y=canvas.height-50;
    ctx.textAlign='left';ctx.font='bold 13px Orbitron';

    if(G.shieldActive){
        const pct=G.shieldTimer/300;
        ctx.fillStyle='#00ff88';ctx.fillText('🛡️ ESCUDO ('+G.shieldHits+' hits)',15,y);
        ctx.fillStyle='rgba(0,255,136,0.3)';ctx.fillRect(15,y+5,120,4);
        ctx.fillStyle='#00ff88';ctx.fillRect(15,y+5,120*pct,4);
        y-=25;
    }
    if(G.laserActive){
        ctx.fillStyle='#ff0000';ctx.fillText('🔫 MUNIÇÃO: '+G.laserAmmo+'/10',15,y);
        ctx.fillStyle='rgba(255,0,0,0.3)';ctx.fillRect(15,y+5,120,4);
        ctx.fillStyle='#ff0000';ctx.fillRect(15,y+5,120*(G.laserAmmo/10),4);
        y-=25;
    }
    if(G.slowMo){
        const pct=G.slowTimer/300;
        ctx.fillStyle='#00aaff';ctx.fillText('⏰ SLOW-MO',15,y);
        ctx.fillStyle='rgba(0,170,255,0.3)';ctx.fillRect(15,y+5,120,4);
        ctx.fillStyle='#00aaff';ctx.fillRect(15,y+5,120*pct,4);
    }
}

function drawBoss(b){
    if(b.visible===false)return;
    const x=b.x,y=b.y,s=b.size;
    ctx.beginPath();ctx.arc(x,y,s+25,0,Math.PI*2);
    const g1=ctx.createRadialGradient(x,y,0,x,y,s+25);g1.addColorStop(0,b.color+'44');g1.addColorStop(1,'transparent');ctx.fillStyle=g1;ctx.fill();
    ctx.beginPath();ctx.arc(x,y,s,0,Math.PI*2);
    const g2=ctx.createRadialGradient(x,y,0,x,y,s);g2.addColorStop(0,'#ffffff');g2.addColorStop(0.2,b.color);g2.addColorStop(1,b.color+'66');ctx.fillStyle=g2;ctx.fill();
    ctx.strokeStyle=b.color;ctx.lineWidth=3;ctx.stroke();
    ctx.font=`${s*0.8}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.icon,x,y);
    ctx.font='bold 11px Orbitron';ctx.fillStyle='#fff';ctx.fillText(Math.max(0,b.hp)+'/'+b.maxHp,x,y+s+18);
}

function drawPlayer(){
    if(G.invincible&&Math.floor(G.invTimer*3)%2===0)return;
    const x=mouse.x,y=mouse.y;
    // Trail
    for(let i=1;i<mouse.trail.length;i++){const t=mouse.trail[i],p=mouse.trail[i-1],a=(1-i/mouse.trail.length)*0.5,w=(1-i/mouse.trail.length)*5+1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(t.x,t.y);
        let tc='rgba(0,255,255,'+a+')';
        if(G.shieldActive)tc='rgba(0,255,136,'+a+')';
        if(G.laserActive)tc='rgba(255,0,0,'+a+')';
        ctx.strokeStyle=tc;ctx.lineWidth=w;ctx.lineCap='round';ctx.stroke();}
    // Glow
    ctx.beginPath();ctx.arc(x,y,22,0,Math.PI*2);const pg=ctx.createRadialGradient(x,y,0,x,y,22);pg.addColorStop(0,'rgba(0,255,255,0.15)');pg.addColorStop(1,'transparent');ctx.fillStyle=pg;ctx.fill();
    // Shield ring
    if(G.shieldActive){
        ctx.beginPath();ctx.arc(x,y,28,0,Math.PI*2);ctx.strokeStyle='rgba(0,255,136,0.6)';ctx.lineWidth=3;ctx.shadowColor='#00ff88';ctx.shadowBlur=15;ctx.stroke();
        ctx.beginPath();ctx.arc(x,y,28,0,Math.PI*2);const sg=ctx.createRadialGradient(x,y,15,x,y,28);sg.addColorStop(0,'rgba(0,255,136,0.02)');sg.addColorStop(1,'rgba(0,255,136,0.12)');ctx.fillStyle=sg;ctx.fill();
        ctx.shadowBlur=0;
    }
    // Guard ring
    if(G.guardActive){
        const gx=x+Math.cos(G.guardAngle)*40;
        const gy=y+Math.sin(G.guardAngle)*40;
        ctx.beginPath();ctx.arc(gx,gy,8,0,Math.PI*2);ctx.fillStyle='#00aaff';ctx.shadowColor='#00aaff';ctx.shadowBlur=10;ctx.fill();
        ctx.beginPath();ctx.arc(x,y,40,0,Math.PI*2);ctx.strokeStyle='rgba(0,170,255,0.1)';ctx.lineWidth=1;ctx.stroke();ctx.shadowBlur=0;
    }
    // Magnet aura
    if(G.magnetActive){
        ctx.beginPath();ctx.arc(x,y,80,0,Math.PI*2);ctx.strokeStyle='rgba(255,0,255,0.1)';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='rgba(255,0,255,0.02)';ctx.fill();
    }
    // Crosshair
    let cc=G.laserActive?'#ff0000':'#00ffff';
    if(G.shieldActive)cc='#00ff88';
    ctx.strokeStyle=cc;ctx.lineWidth=2;ctx.shadowColor=cc;ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=cc;ctx.fill();
    const g=13;ctx.beginPath();ctx.moveTo(x,y-g);ctx.lineTo(x,y-g-6);ctx.moveTo(x,y+g);ctx.lineTo(x,y+g+6);ctx.moveTo(x-g,y);ctx.lineTo(x-g-6,y);ctx.moveTo(x+g,y);ctx.lineTo(x+g+6,y);ctx.stroke();ctx.shadowBlur=0;
}

function drawDarkness(){
    ctx.save();ctx.globalCompositeOperation='destination-in';
    const dg=ctx.createRadialGradient(mouse.x,mouse.y,0,mouse.x,mouse.y,300);dg.addColorStop(0,'rgba(255,255,255,1)');dg.addColorStop(0.6,'rgba(255,255,255,0.8)');dg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=dg;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();
    ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#050510';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();
}

function drawBg(){
    const bg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,0,canvas.width/2,canvas.height/2,canvas.width*0.7);bg.addColorStop(0,'#0f0519');bg.addColorStop(0.5,'#0a0a15');bg.addColorStop(1,'#050510');ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
    G.stars.forEach(s=>{s.b+=s.t;ctx.beginPath();ctx.arc(s.x,s.y,s.s,0,Math.PI*2);ctx.fillStyle=`rgba(200,220,255,${Math.sin(s.b)*0.4+0.5})`;ctx.fill();});
}

function drawGrid(){
    ctx.strokeStyle='rgba(0,255,255,0.04)';ctx.lineWidth=1;
    for(let x=0;x<canvas.width;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=0;y<canvas.height;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
}

// ─── SHOP LOGIC ───
function openShop(){
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('shopScreen').classList.remove('hidden');
    renderShop();
}
function closeShop(){
    document.getElementById('shopScreen').classList.add('hidden');
    if(G.state==='GAMEOVER') document.getElementById('gameOverScreen').classList.remove('hidden');
    else document.getElementById('startScreen').classList.remove('hidden');
}

function renderShop(){
    const cont = document.getElementById('shopItemsContainer');
    cont.innerHTML = '';
    const today = getTodayDate();
    if(!savedData.limits[today]) savedData.limits[today] = {};

    SHOP_ITEMS.forEach(item => {
        const bought = savedData.limits[today][item.id] || 0;
        const canBuy = bought < item.limit && savedData.coins >= item.price;
        const hasMoney = savedData.coins >= item.price;

        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-name">${item.id}</div>
            <div class="item-desc">${item.desc}</div>
            <div class="item-price">💰 ${item.price}</div>
            <div class="item-limit">Hoje: ${bought}/${item.limit}</div>
            <button class="btn-buy" onclick="buyItem('${item.id}')" ${!canBuy?'disabled':''}>
                ${bought>=item.limit ? 'ESGOTADO' : (hasMoney ? 'COMPRAR' : 'SEM GRANA')}
            </button>
            <div style="margin-top:8px;font-size:0.7rem;color:rgba(255,255,255,0.5)">Estoque: ${savedData.inventory[item.id]}</div>
        `;
        cont.appendChild(div);
    });
}

window.buyItem = function(id){
    const item = SHOP_ITEMS.find(i=>i.id===id);
    const today = getTodayDate();
    if(!savedData.limits[today]) savedData.limits[today] = {};
    const bought = savedData.limits[today][id] || 0;
    
    if(savedData.coins >= item.price && bought < item.limit){
        savedData.coins -= item.price;
        savedData.inventory[id]++;
        savedData.limits[today][id] = bought + 1;
        saveData();
        renderShop();
        snd('pwr');
    } else {
        snd('hit');
    }
}

window.addEventListener('keydown', e=>{
    if(e.key==='Escape' && !document.getElementById('shopScreen').classList.contains('hidden')) closeShop();
});

// ─── DAILY LOGIN LOGIC ───
function checkDaily(){
    const today = getTodayDate();
    if(savedData.lastLogin !== today){
        // check streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate()-1);
        const yDate = yesterday.toLocaleDateString('pt-BR');
        
        if(savedData.lastLogin === yDate) savedData.streak++;
        else savedData.streak = 1;

        let reward = 50 + (savedData.streak - 1) * 25;
        if(reward > 300) reward = 300;

        document.getElementById('dailyStreakText').textContent = `Dia ${savedData.streak} consecutivo`;
        document.getElementById('dailyRewardText').textContent = `+${reward} 💰`;
        document.getElementById('dailyModal').classList.remove('hidden');
        
        window.pendingReward = reward;
    }
}

window.claimDaily = function(){
    savedData.coins += window.pendingReward;
    savedData.lastLogin = getTodayDate();
    saveData();
    document.getElementById('dailyModal').classList.add('hidden');
    snd('win');
}

// ─── INITIALIZATION ───
async function initGame() {
    try {
        await initDB();
    } catch(e) {
        console.error("IndexedDB error:", e);
    }
    
    // Hide loading screen, show start screen
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');

    checkDaily();
    G.lastTime=performance.now();
    gameLoop();
}

// ─── GAME LOOP ───
function gameLoop(){try{update();render();}catch(e){console.error(e);}requestAnimationFrame(gameLoop);}

// Start init process
initGame();
