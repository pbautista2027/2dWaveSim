// index.js

// — Medium system —————————————————————————————

class Medium {
  constructor(id, name, color, speed=1, damping=0.995, reflect=false) {
    this.id      = id;
    this.name    = name;
    this.color   = color;
    this.speed   = speed;
    this.damping = damping;
    this.reflect = reflect;
  }
  propagate() {
    return !this.reflect;
  }
}

const mediums = [
  new Medium(0, 'Soft Soil', '#884400', 1.0, 0.995, false),
  new Medium(1, 'Border',    '#0044ff', 1.0, 0.5,   true),
  new Medium(2, 'Water',     '#00aaff', 0.6, 0.98,  false),
  new Medium(3, 'Rock',      '#888888', 1.4, 0.995, false),
];

const rows = 100, cols = 100;
const mediumGrid = Array.from({ length: rows },
  () => new Uint8Array(cols).fill(0)
);

// — Simulation arrays ————————————————————————————

const pDisp = [], sDisp = [], pVel = [], sVel = [];
for (let y = 0; y < rows; y++) {
  pDisp[y] = new Float32Array(cols);
  sDisp[y] = new Float32Array(cols);
  pVel[y]  = new Float32Array(cols);
  sVel[y]  = new Float32Array(cols);
}

function resetFields() {
  for (let y = 0; y < rows; y++) {
    pDisp[y].fill(0); sDisp[y].fill(0);
    pVel[y].fill(0);  sVel[y].fill(0);
  }
}

// — Canvas setup ——————————————————————————————

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let cellW, cellH;
function resize() {
  canvas.width  = innerWidth;
  canvas.height = innerHeight;
  cellW = canvas.width  / cols;
  cellH = canvas.height / rows;
}
window.addEventListener('resize', resize);
resize();

// — UI hooks ——————————————————————————————

const baseSelect  = document.getElementById('baseMediumSelect');
const paintSelect = document.getElementById('paintMediumSelect');
const fillBaseBtn = document.getElementById('fillBase');
const legendDiv   = document.getElementById('legend');

mediums.forEach(m => {
  baseSelect.add(new Option(m.name, m.id));
  paintSelect.add(new Option(m.name, m.id));
  const div = document.createElement('div');
  div.textContent = m.name;
  div.style.color = m.color;
  legendDiv.appendChild(div);
});

fillBaseBtn.addEventListener('click', () => {
  const mid = +baseSelect.value;
  for (let y=0; y<rows; y++) mediumGrid[y].fill(mid);
});

// — Tool & state ————————————————————————————

let drawTool   = 'pen';
let penWidth   = 1;
let eraserSize = 1;
let shapeStart = null;
let preview    = null;
let hollowMode = false;
let originX    = null, originY = null;
let simRunning = false;
let savedMag   = 5.0;
let lastMouse  = { x:0, y:0 };

document.getElementById('penWidth').addEventListener('input', e=>{
  penWidth = +e.target.value;
  document.getElementById('penWidthLabel').innerText = penWidth;
});
document.getElementById('eraserSize').addEventListener('input', e=>{
  eraserSize = +e.target.value;
  document.getElementById('eraserSizeLabel').innerText = eraserSize;
});
document.getElementById('shapeHollow').addEventListener('change', e=>{
  hollowMode = e.target.checked;
});

const tools = {
  pen:    'penTool',
  eraser: 'eraserTool',
  rect:   'rectTool',
  sphere: 'sphereTool',
  fill:   'fillTool',
  origin: 'originTool',
};
Object.entries(tools).forEach(([key,id])=>{
  document.getElementById(id).addEventListener('click', () => {
    if (simRunning) return;
    Object.values(tools).forEach(i=>document.getElementById(i).classList.remove('active'));
    document.getElementById(id).classList.add('active');
    drawTool = key;
    document.getElementById('toolLabel').innerText =
      document.getElementById(id).innerText;
  });
});

// lock base controls once running
function lockBaseControls() {
  baseSelect.disabled = true;
  fillBaseBtn.disabled = true;
}

// Start / Replay / Reload
document.getElementById('startSim').onclick = () => {
  if (originX!==null && !simRunning) {
    savedMag = +document.getElementById('mag').value;
    resetFields(); injectEarthquake(savedMag);
    simRunning = true;
    lockBaseControls();
    document.getElementById('startSim').style.display = 'none';
    document.getElementById('reload').style.display    = 'inline-block';
    document.getElementById('replay').style.display    = 'inline-block';
  }
};
document.getElementById('replay').onclick = () => {
  if (originX!==null) {
    resetFields(); injectEarthquake(savedMag);
    simRunning = true;
  }
};
document.getElementById('reload').onclick = () => location.reload();

// — Mouse events —————————————————————————————

canvas.addEventListener('mousemove', e => {
  const { x, y } = toGrid(e);
  if (x<0||x>=cols||y<0||y>=rows) return;
  lastMouse = { x, y };
  if (e.buttons && !simRunning) {
    paintTool(x,y);
    if ((drawTool==='rect'||drawTool==='sphere') && shapeStart) {
      preview = { tool:drawTool, x0:shapeStart.x, y0:shapeStart.y, x1:x, y1:y };
    }
  }
});
canvas.addEventListener('mousedown', e => {
  if (simRunning) return;
  const { x, y } = lastMouse;
  if (drawTool==='pen')    paintPen(x,y);
  if (drawTool==='eraser') paintEraser(x,y);
  if (drawTool==='fill')   paintFill(x,y);
  if (drawTool==='rect'||drawTool==='sphere'){
    shapeStart = { x, y }; preview = null;
  }
  if (drawTool==='origin') {
    if (mediumGrid[y][x] !== 1) {
      originX = x; originY = y;
      document.getElementById('startSim').style.display = 'inline-block';
    }
  }
});
window.addEventListener('mouseup', () => {
  if (shapeStart && preview) finalizeShape(preview);
  shapeStart = null; preview = null;
});

// — Helpers —————————————————————————————

function toGrid(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.floor((e.clientX - r.left)/cellW),
    y: Math.floor((e.clientY - r.top)/cellH)
  };
}

function paintTool(x,y) {
  if (drawTool==='pen')    paintPen(x,y);
  if (drawTool==='eraser') paintEraser(x,y);
  if (drawTool==='fill')   paintFill(x,y);
}
function paintPen(cx,cy){
  const mid = +paintSelect.value;
  for (let dy=-penWidth; dy<=penWidth; dy++){
    for (let dx=-penWidth; dx<=penWidth; dx++){
      const nx=cx+dx, ny=cy+dy;
      if(nx>=0&&nx<cols&&ny>=0&&ny<rows) mediumGrid[ny][nx]=mid;
    }
  }
}
function paintEraser(cx,cy){
  for (let dy=-eraserSize; dy<=eraserSize; dy++){
    for (let dx=-eraserSize; dx<=eraserSize; dx++){
      const nx=cx+dx, ny=cy+dy;
      if(nx>=0&&nx<cols&&ny>=0&&ny<rows) mediumGrid[ny][nx]=0;
    }
  }
}
function paintFill(sx,sy){
  const target = mediumGrid[sy][sx], replacement=+paintSelect.value;
  if(target===replacement) return;
  const stack=[{x:sx,y:sy}];
  while(stack.length){
    const {x,y}=stack.pop();
    if(x<0||x>=cols||y<0||y>=rows) continue;
    if(mediumGrid[y][x]!==target) continue;
    mediumGrid[y][x]=replacement;
    stack.push({x:x+1,y},{x:x-1,y},{x,y:y+1},{x,y:y-1});
  }
}
function finalizeShape({tool,x0,y0,x1,y1}){
  const mid=+paintSelect.value;
  const xmin=Math.min(x0,x1), xmax=Math.max(x0,x1);
  const ymin=Math.min(y0,y1), ymax=Math.max(y0,y1);
  if(tool==='rect'){
    if(hollowMode){
      for(let x=xmin;x<=xmax;x++){
        mediumGrid[ymin][x]=mediumGrid[ymax][x]=mid;
      }
      for(let y=ymin;y<=ymax;y++){
        mediumGrid[y][xmin]=mediumGrid[y][xmax]=mid;
      }
    } else {
      for(let y=ymin;y<=ymax;y++)
        for(let x=xmin;x<=xmax;x++)
          mediumGrid[y][x]=mid;
    }
  } else {
    const rx=Math.abs(x1-x0), ry=Math.abs(y1-y0);
    if(hollowMode){
      for(let i=0;i<360;i++){
        const θ=i/360*2*Math.PI;
        const fx=x0+Math.cos(θ)*rx, fy=y0+Math.sin(θ)*ry;
        const ix=Math.round(fx), iy=Math.round(fy);
        if(ix>=0&&ix<cols&&iy>=0&&iy<rows) mediumGrid[iy][ix]=mid;
      }
    } else {
      for(let y=0;y<rows;y++){
        for(let x=0;x<cols;x++){
          if(((x-x0)/rx)**2+((y-y0)/ry)**2<=1)
            mediumGrid[y][x]=mid;
        }
      }
    }
  }
}

// — Physics & rendering —————————————————————

const kmPerCell = 0.5;
const fixedDt   = 0.01;
const pVelKM    = 6.0, sVelKM = 3.5;

function updatePhysics(dt) {
  const baseVp = (pVelKM*dt/kmPerCell)**2;
  const baseVs = (sVelKM*dt/kmPerCell)**2;
  for (let y=1; y<rows-1; y++){
    for (let x=1; x<cols-1; x++){
      const lapP = pDisp[y][x+1]+pDisp[y][x-1]+pDisp[y+1][x]+pDisp[y-1][x]-4*pDisp[y][x];
      const lapS = sDisp[y][x+1]+sDisp[y][x-1]+sDisp[y+1][x]+sDisp[y-1][x]-4*sDisp[y][x];
      const m = mediums[ mediumGrid[y][x] ];
      pVel[y][x] += baseVp * lapP * m.speed;
      sVel[y][x] += baseVs * lapS * m.speed;
      pVel[y][x] *= m.damping;
      sVel[y][x] *= m.damping;
    }
  }
  for (let y=0; y<rows; y++){
    for (let x=0; x<cols; x++){
      const m = mediums[ mediumGrid[y][x] ];
      if (!m.propagate()) {
        pVel[y][x] *= -0.5;
        sVel[y][x] *= -0.5;
      }
      pDisp[y][x] += pVel[y][x];
      sDisp[y][x] += sVel[y][x];
    }
  }
}

function injectEarthquake(mag){
  const r=3;
  for(let dy=-r;dy<=r;dy++){
    for(let dx=-r;dx<=r;dx++){
      const ix=originX+dx, iy=originY+dy;
      if(ix<0||ix>=cols||iy<0||iy>=rows) continue;
      const d=Math.hypot(dx,dy), amp=mag*Math.exp(-d);
      pDisp[iy][ix]+=amp; sDisp[iy][ix]+=amp*0.8;
    }
  }
}

function clamp(v){ return Math.max(0,Math.min(255,Math.round(v))); }

function draw() {
  // draw background medium
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      ctx.fillStyle = mediums[ mediumGrid[y][x] ].color;
      ctx.fillRect(x*cellW, y*cellH, cellW, cellH);
    }
  }
  // draw waves with transparency
  ctx.globalAlpha = 0.6;
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      if (mediums[ mediumGrid[y][x] ].reflect) continue;
      const p=pDisp[y][x], s=sDisp[y][x];
      const r=clamp(128+127*(p-s));
      const g=clamp(128+127*(s-p));
      const b=clamp(128-127*(p+s));
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.fillRect(x*cellW, y*cellH, cellW, cellH);
    }
  }
  ctx.globalAlpha = 1;
  // epicenter
  if(originX!==null){
    ctx.fillStyle='lime';
    ctx.fillRect(originX*cellW, originY*cellH, cellW, cellH);
  }
  // preview
  drawPreview();
}

function drawPreview(){
  ctx.strokeStyle='yellow'; ctx.lineWidth=2;
  if(drawTool==='pen'){
    const w=penWidth;
    ctx.strokeRect(
      (lastMouse.x-w)*cellW,
      (lastMouse.y-w)*cellH,
      (2*w+1)*cellW,
      (2*w+1)*cellH
    );
  }
  if(drawTool==='eraser'){
    const r=eraserSize;
    ctx.strokeRect(
      (lastMouse.x-r)*cellW,
      (lastMouse.y-r)*cellH,
      (2*r+1)*cellW,
      (2*r+1)*cellH
    );
  }
  if(preview){
    const {tool,x0,y0,x1,y1} = preview;
    if(tool==='rect'){
      const xmin=Math.min(x0,x1), ymin=Math.min(y0,y1);
      const w=Math.abs(x1-x0)+1, h=Math.abs(y1-y0)+1;
      ctx.strokeRect(xmin*cellW, ymin*cellH, w*cellW, h*cellH);
    } else {
      const rx=Math.abs(x1-x0)*cellW, ry=Math.abs(y1-y0)*cellH;
      ctx.beginPath();
      ctx.ellipse((x0+0.5)*cellW,(y0+0.5)*cellH,rx,ry,0,0,2*Math.PI);
      ctx.stroke();
    }
  }
}

// animation
let lastTs=0, acc=0;
function loop(ts){
  if(!lastTs) lastTs=ts;
  const dt=(ts-lastTs)/1000; lastTs=ts;
  if(simRunning){
    acc+=dt;
    while(acc>=fixedDt){
      updatePhysics(fixedDt);
      acc-=fixedDt;
    }
  }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
