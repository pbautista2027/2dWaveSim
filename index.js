// index.js

// ===== Dropdown visibility & reset =====
const dropdowns = [
  document.getElementById('ctrlDropdown'),
  document.getElementById('paintDropdown'),
  document.getElementById('terrainDropdown')
];
document.getElementById('toggleAll').onclick = () => {
  const anyOpen = dropdowns.some(d => d.open);
  dropdowns.forEach(d => d.open = !anyOpen);
};

// Default positions for reset:
const windowDefaults = {
  ctrlDropdown: { left: 10, top: 10 },
  paintDropdown: { left: 270, top: 10 },
  terrainDropdown: { left: 530, top: 10 }
};

document.getElementById('resetAll').onclick = () => {
  // Reposition windows to defaults, keep open/closed state unchanged.
  dropdowns.forEach(d => {
    const def = windowDefaults[d.id];
    if (def) {
      d.style.left = def.left + 'px';
      d.style.top  = def.top  + 'px';
    }
  });
};

// ===== Window dragging =====
dropdowns.forEach(win => {
  const handle = win.querySelector('.drag-handle');
  let isDragging = false;
  let startX = 0, startY = 0;
  let origLeft = 0, origTop = 0;

  handle.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = win.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    e.preventDefault();
    win.style.zIndex = 1000;
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    win.style.left = (origLeft + dx) + 'px';
    win.style.top  = (origTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      win.style.zIndex = 20;
    }
  });
});

// ===== Canvas & Simulation Setup =====
const canvas = document.getElementById("canvas"), ctx = canvas.getContext("2d");
let cols=100, rows=100, cellW, cellH;
function resize(){ 
  canvas.width=innerWidth; 
  canvas.height=innerHeight; 
  cellW=canvas.width/cols; 
  cellH=canvas.height/rows; 
}
window.addEventListener('resize', resize);
resize();

// — Medium & Grid —
class Medium {
  constructor(id,name,color,speed=1,damping=0.995,reflect=false){
    this.id=id; this.name=name; this.color=color;
    this.speed=speed; this.damping=damping; this.reflect=reflect;
  }
  propagate(){ return !this.reflect; }
}
const mediums = [
  new Medium(0,'Soft Soil','#884400',1,0.995,false),
  new Medium(1,'Border','#0044ff',1,0.5,true),
  new Medium(2,'Water','#00aaff',0.6,0.98,false),
  new Medium(3,'Sand','#d2b48c',0.9,0.99,false),
  new Medium(4,'Rock','#888888',1.4,0.995,false),
];
const mediumGrid = Array.from({length:rows},()=>new Uint8Array(cols).fill(0));

// Populate legend
const legendDiv = document.getElementById('mediumLegend');
mediums.forEach(m=>{
  const row=document.createElement('div');
  row.innerHTML=`<span style="display:inline-block;width:1em;height:1em;background:${m.color};margin-right:4px"></span>${m.name}`;
  legendDiv.appendChild(row);
});

// — Wave fields —
const pDisp=[], sDisp=[], pVel=[], sVel=[];
for(let y=0;y<rows;y++){
  pDisp[y]=new Float32Array(cols);
  sDisp[y]=new Float32Array(cols);
  pVel[y]=new Float32Array(cols);
  sVel[y]=new Float32Array(cols);
}
function resetFields(){
  for(let y=0;y<rows;y++){
    pDisp[y].fill(0); sDisp[y].fill(0);
    pVel[y].fill(0); sVel[y].fill(0);
  }
}

// — State & UI Bindings —
// drawTool can be 'origin' (for adding origins) or paint tools
let drawTool='origin', penW=1, eraserW=1, hollow=false;
let origins = []; // Array of {x, y, mag}
let simRunning=false;
let lastMouse={x:0,y:0}, preview=null, shapeStart=null;

const originBtn = document.getElementById('originBtn');
const startBtn = document.getElementById('startSim');
const replayBtn = document.getElementById('replay');
const reloadBtn = document.getElementById('reload');
const magInput = document.getElementById('mag');

const paintSelect = document.getElementById('paintMediumSelect');
mediums.forEach(m=> paintSelect.add(new Option(m.name,m.id)));

const paintButtons = ['penBtn','eraserBtn','rectBtn','sphereBtn','fillBtn'].map(id=>document.getElementById(id));

const originsListDiv = document.getElementById('originsList');
const clearOriginsBtn = document.getElementById('clearOriginsBtn');

// Button helpers
function activateButtons(btns, activeId){
  btns.forEach(id=>{
    const b=document.getElementById(id);
    b.classList.toggle('active', id===activeId);
  });
}

// Update UI enabled/disabled state based on origins.length and simRunning
function updateUIState(){
  // Start button: enabled only if at least one origin exists and simulation not running
  startBtn.disabled = simRunning || origins.length===0;
  // Replay & Reload: enabled only when simulation is running
  replayBtn.disabled = !simRunning;
  reloadBtn.disabled = !simRunning;
  // Origin button: disabled while simulation is running
  originBtn.disabled = simRunning;
  // Paint tools & paint inputs: disabled while simulation is running
  paintButtons.forEach(b=> b.disabled = simRunning);
  document.getElementById('penWidth2').disabled = simRunning;
  document.getElementById('eraserSize2').disabled = simRunning;
  document.getElementById('shapeHollow2').disabled = simRunning;
  paintSelect.disabled = simRunning;

  // Global magnitude input disabled while running
  magInput.disabled = simRunning;

  // Terrain generation controls disabled while running
  document.getElementById('noiseScale').disabled = simRunning;
  document.getElementById('waterThresh').disabled = simRunning;
  document.getElementById('sandThresh').disabled = simRunning;
  document.getElementById('rockThresh').disabled = simRunning;
  document.getElementById('generateTerrain').disabled = simRunning;

  // Origins list: disable remove buttons & clear if simRunning
  const removeButtons = originsListDiv.querySelectorAll('.remove-origin');
  removeButtons.forEach(btn => btn.disabled = simRunning);
  // Also disable per-origin magnitude inputs
  const magInputs = originsListDiv.querySelectorAll('.origin-mag');
  magInputs.forEach(inp => inp.disabled = simRunning);

  clearOriginsBtn.disabled = simRunning;
}

// Initialize UI state on load
updateUIState();

// Function to refresh the origins list UI
function refreshOriginsList(){
  originsListDiv.innerHTML = '';
  if(origins.length === 0){
    const placeholder = document.createElement('div');
    placeholder.style.fontSize = '13px';
    placeholder.style.color = '#666';
    placeholder.textContent = 'No origins yet';
    originsListDiv.appendChild(placeholder);
  } else {
    origins.forEach((pt, idx) => {
      const item = document.createElement('div');
      item.className = 'origin-item';
      // Coordinate + magnitude input
      const leftDiv = document.createElement('div');
      leftDiv.style.display = 'flex';
      leftDiv.style.alignItems = 'center';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = `(${pt.x},${pt.y})`;
      labelSpan.style.marginRight = '4px';
      const magInp = document.createElement('input');
      magInp.type = 'number';
      magInp.min = '0';
      magInp.step = '0.1';
      magInp.value = pt.mag.toFixed(1);
      magInp.className = 'origin-mag';
      magInp.title = 'Magnitude for this origin';
      magInp.addEventListener('input', () => {
        let v = parseFloat(magInp.value);
        if (isNaN(v) || v < 0) v = 0;
        pt.mag = v;
        magInp.value = v.toFixed(1);
      });
      leftDiv.appendChild(labelSpan);
      leftDiv.appendChild(magInp);

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-origin';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove this origin';
      removeBtn.addEventListener('click', () => {
        if(simRunning) return;
        origins.splice(idx,1);
        refreshOriginsList();
        updateUIState();
      });

      item.appendChild(leftDiv);
      item.appendChild(removeBtn);
      originsListDiv.appendChild(item);
    });
  }
  updateUIState();
}

// Origin button: mutual exclusion with paint tools
originBtn.addEventListener('click', () => {
  if(simRunning) return;
  drawTool='origin';
  originBtn.classList.add('active');
  paintButtons.forEach(b=>b.classList.remove('active'));
  updateUIState();
});

// Clear Origins button
clearOriginsBtn.addEventListener('click', () => {
  if(simRunning) return;
  origins = [];
  refreshOriginsList();
  updateUIState();
});

// Paint tool buttons: mutual exclusion with origin
paintButtons.forEach(btnEl => {
  btnEl.addEventListener('click', () => {
    if(simRunning) return;
    const id = btnEl.id; // e.g. 'penBtn'
    const tool = id.replace('Btn',''); // 'pen', etc.
    drawTool = tool;
    activateButtons(['penBtn','eraserBtn','rectBtn','sphereBtn','fillBtn'], id);
    originBtn.classList.remove('active');
    updateUIState();
  });
});

// Pen/Eraser/Hollow sliders & checkbox
document.getElementById('penWidth2').addEventListener('input', e=>{
  penW=+e.target.value;
  document.getElementById('penWidthLabel2').innerText=penW;
});
document.getElementById('eraserSize2').addEventListener('input', e=>{
  eraserW=+e.target.value;
  document.getElementById('eraserSizeLabel2').innerText=eraserW;
});
document.getElementById('shapeHollow2').addEventListener('change', e=>{
  hollow = e.target.checked;
});

// Start/Replay/Reload & Magnitude
startBtn.addEventListener('click', () => {
  if(origins.length>0 && !simRunning){
    resetFields();
    injectAllOrigins();
    simRunning = true;
    updateUIState();
  }
});
replayBtn.addEventListener('click', () => {
  if(origins.length>0 && simRunning){
    resetFields();
    injectAllOrigins();
    updateUIState();
  }
});
reloadBtn.addEventListener('click', () => {
  if(simRunning){
    location.reload();
  }
});

// Terrain Gen parameters
let noiseScale=0.1, waterTh=0.3, sandTh=0.4, rockTh=0.7;
[
  ['noiseScale','noiseScaleLabel','noiseScale'],
  ['waterThresh','waterThreshLabel','waterTh'],
  ['sandThresh','sandThreshLabel','sandTh'],
  ['rockThresh','rockThreshLabel','rockTh']
].forEach(([id,label,varName])=>{
  document.getElementById(id).addEventListener('input', e=>{
    const v=+e.target.value;
    if(varName==='noiseScale') noiseScale=v;
    else if(varName==='waterTh') waterTh=v;
    else if(varName==='sandTh') sandTh=v;
    else if(varName==='rockTh') rockTh=v;
    document.getElementById(label).innerText=v.toFixed(2);
  });
});

// Simple deterministic noise function based on coordinates
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

document.getElementById('generateTerrain').onclick = () => {
  if(simRunning) return; // disabled by UI
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      if (x===0||y===0||x===cols-1||y===rows-1) {
        mediumGrid[y][x] = 1; // border
      } else {
        const nx = x * noiseScale;
        const ny = y * noiseScale;
        const v = noise(nx, ny);
        let m;
        if (v < waterTh) {
          m = 2; // Water
        } else if (v < sandTh) {
          m = 3; // Sand
        } else if (v < rockTh) {
          m = 0; // Soft Soil
        } else {
          m = 4; // Rock
        }
        mediumGrid[y][x] = m;
      }
    }
  }
};

// — Mouse & Painting/Origin —
// Prevent any painting/origin changes while simRunning
canvas.addEventListener('mousemove', e=>{
  if(simRunning) return;
  const gm = toGrid(e);
  if(!gm) return;
  lastMouse=gm;
  if(e.buttons){
    paintAt(gm.x,gm.y);
    if((drawTool==='rect'||drawTool==='sphere')&& shapeStart){
      preview={tool:drawTool,x0:shapeStart.x,y0:shapeStart.y,x1:gm.x,y1:gm.y};
    }
  }
});
canvas.addEventListener('mousedown', e=>{
  if(simRunning) return;
  const gm=toGrid(e); if(!gm)return;
  if(drawTool==='origin' && mediumGrid[gm.y][gm.x]!==1){
    // Add new origin if not on border
    const exists = origins.some(pt=> pt.x===gm.x && pt.y===gm.y);
    if(!exists){
      // Use global magnitude as default
      let defaultMag = parseFloat(magInput.value);
      if(isNaN(defaultMag) || defaultMag < 0) defaultMag = 0;
      origins.push({x: gm.x, y: gm.y, mag: defaultMag});
      refreshOriginsList();
      updateUIState();
    }
  } else {
    paintAt(gm.x,gm.y);
  }
  if(drawTool==='rect'||drawTool==='sphere'){
    shapeStart={...gm}; preview=null;
  }
});
window.addEventListener('mouseup', ()=>{
  if(simRunning) return;
  if(shapeStart&&preview) finalizeShape(preview);
  shapeStart=null; preview=null;
});

function toGrid(e){
  const r=canvas.getBoundingClientRect();
  const x=Math.floor((e.clientX-r.left)/cellW), y=Math.floor((e.clientY-r.top)/cellH);
  return x>=0&&x<cols&&y>=0&&y<rows ? {x,y} : null;
}

function paintAt(cx,cy){
  if(simRunning) return;
  const mid=+paintSelect.value;
  if(drawTool==='pen'){
    for(let dy=-penW;dy<=penW;dy++)for(let dx=-penW;dx<=penW;dx++){
      const nx=cx+dx, ny=cy+dy;
      if(nx>=0&&ny>=0&&nx<cols&&ny<rows) mediumGrid[ny][nx]=mid;
    }
  }
  if(drawTool==='eraser'){
    for(let dy=-eraserW;dy<=eraserW;dy++)for(let dx=-eraserW;dx<=eraserW;dx++){
      const nx=cx+dx, ny=cy+dy;
      if(nx>=0&&ny>=0&&nx<cols&&ny<rows) mediumGrid[ny][nx]=0;
    }
  }
  if(drawTool==='fill'){
    const target=mediumGrid[cy][cx];
    if(target===mid) return;
    const stk=[{x:cx,y:cy}];
    while(stk.length){
      const p=stk.pop();
      if(p.x<0||p.y<0||p.x>=cols||p.y>=rows) continue;
      if(mediumGrid[p.y][p.x]!==target) continue;
      mediumGrid[p.y][p.x]=mid;
      stk.push({x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1});
    }
  }
}

function finalizeShape({tool,x0,y0,x1,y1}){
  if(simRunning) return;
  const mid=+paintSelect.value;
  const xmin=Math.min(x0,x1), xmax=Math.max(x0,x1);
  const ymin=Math.min(y0,y1), ymax=Math.max(y0,y1);
  if(tool==='rect'){
    if(hollow){
      for(let x=xmin;x<=xmax;x++){ mediumGrid[ymin][x]=mid; mediumGrid[ymax][x]=mid; }
      for(let y=ymin;y<=ymax;y++){ mediumGrid[y][xmin]=mid; mediumGrid[y][xmax]=mid; }
    } else {
      for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++) mediumGrid[y][x]=mid;
    }
  } else {
    const rx=Math.abs(x1-x0), ry=Math.abs(y1-y0);
    if(rx===0 || ry===0) {
      if(hollow) {
        if(rx===0) {
          for(let y=ymin;y<=ymax;y++) mediumGrid[y][x0]=mid;
        } else {
          for(let x=xmin;x<=xmax;x++) mediumGrid[y0][x]=mid;
        }
      } else {
        if(rx===0) {
          for(let y=ymin;y<=ymax;y++) mediumGrid[y][x0]=mid;
        } else {
          for(let x=xmin;x<=xmax;x++) mediumGrid[y0][x]=mid;
        }
      }
    } else {
      if(hollow){
        for(let i=0;i<360;i++){
          const θ=i/360*2*Math.PI;
          const ix=Math.round(x0+Math.cos(θ)*rx),
                iy=Math.round(y0+Math.sin(θ)*ry);
          if(ix>=0&&iy>=0&&ix<cols&&iy<rows) mediumGrid[iy][ix]=mid;
        }
      } else {
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
          if(((x-x0)/rx)**2+((y-y0)/ry)**2<=1) mediumGrid[y][x]=mid;
        }
      }
    }
  }
}

// — Physics & rendering —
const km=0.5, dtFixed=0.01, pSpeed=6, sSpeed=3.5;
function updatePhysics(dt){
  const vp=(pSpeed*dt/km)**2, vs=(sSpeed*dt/km)**2;
  for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){
    const lapP=pDisp[y][x+1]+pDisp[y][x-1]+pDisp[y+1][x]+pDisp[y-1][x]-4*pDisp[y][x];
    const lapS=sDisp[y][x+1]+sDisp[y][x-1]+sDisp[y+1][x]+sDisp[y-1][x]-4*sDisp[y][x];
    const m=mediums[ mediumGrid[y][x] ];
    pVel[y][x]+=vp*lapP*m.speed; sVel[y][x]+=vs*lapS*m.speed;
    pVel[y][x]*=m.damping; sVel[y][x]*=m.damping;
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const m=mediums[ mediumGrid[y][x] ];
    if(!m.propagate()){ pVel[y][x]*=-0.5; sVel[y][x]*=-0.5; }
    pDisp[y][x]+=pVel[y][x]; sDisp[y][x]+=sVel[y][x];
  }
}

// inject from all origins with their own magnitudes
function injectAllOrigins(){
  const r=3;
  origins.forEach(({x: ox, y: oy, mag}) => {
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const ix=ox+dx, iy=oy+dy;
      if(ix<0||iy<0||ix>=cols||iy>=rows) continue;
      const d=Math.hypot(dx,dy), amp=mag*Math.exp(-d);
      pDisp[iy][ix]+=amp;
      sDisp[iy][ix]+=amp*0.8;
    }
  });
}

function clamp(v){return Math.max(0,Math.min(255,Math.round(v)));}

function draw(){
  // draw medium background
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    ctx.fillStyle=mediums[ mediumGrid[y][x] ].color;
    ctx.fillRect(x*cellW,y*cellH,cellW,cellH);
  }
  // overlay waves
  ctx.globalAlpha=0.6;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    if(mediums[ mediumGrid[y][x] ].reflect) continue;
    const p=pDisp[y][x], s=sDisp[y][x];
    const r=clamp(128+127*(p-s)), g=clamp(128+127*(s-p)), b=clamp(128-127*(p+s));
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.fillRect(x*cellW,y*cellH,cellW,cellH);
  }
  ctx.globalAlpha=1;
  // draw origins if set
  origins.forEach(({x, y}) => {
    ctx.fillStyle='lime';
    ctx.fillRect(x*cellW, y*cellH, cellW, cellH);
  });
  drawPreview();
}

function drawPreview(){
  ctx.strokeStyle='yellow'; ctx.lineWidth=2;
  if(drawTool==='pen'){
    const w=penW;
    ctx.strokeRect((lastMouse.x-w)*cellW,(lastMouse.y-w)*cellH,(2*w+1)*cellW,(2*w+1)*cellH);
  }
  if(drawTool==='eraser'){
    const r=eraserW;
    ctx.strokeRect((lastMouse.x-r)*cellW,(lastMouse.y-r)*cellH,(2*r+1)*cellW,(2*r+1)*cellH);
  }
  if(preview){
    const {tool,x0,y0,x1,y1}=preview;
    if(tool==='rect'){
      const xmin=Math.min(x0,x1), ymin=Math.min(y0,y1);
      const w=Math.abs(x1-x0)+1, h=Math.abs(y1-y0)+1;
      ctx.strokeRect(xmin*cellW,ymin*cellH,w*cellW,h*cellH);
    } else {
      const rx=Math.abs(x1-x0)*cellW, ry=Math.abs(y1-y0)*cellH;
      ctx.beginPath();
      ctx.ellipse((x0+0.5)*cellW,(y0+0.5)*cellH,rx,ry,0,0,2*Math.PI);
      ctx.stroke();
    }
  }
}

// Animation loop
let lastTs=0, acc=0;
function loop(ts){
  if(!lastTs) lastTs=ts;
  const dt=(ts-lastTs)/1000; lastTs=ts;
  if(simRunning){
    acc+=dt;
    while(acc>=dtFixed){ updatePhysics(dtFixed); acc-=dtFixed; }
  }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
