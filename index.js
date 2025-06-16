const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const cols = 100, rows = 100;
const kmPerCell = 0.5;
const fixedDt = 0.01;
const pWaveVelocityKM = 6.0, sWaveVelocityKM = 3.5;

var cellWidth, cellHeight;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
cellWidth = canvas.width / cols;
cellHeight = canvas.height / rows;

var simRunning = false;
var drawTool = 'pen';
var isDrawing = false;
var originX = null, originY = null;
var storedMag = 5.0;

const pWaveDisplacement = [], sWaveDisplacement = [], pWaveVelocity = [], sWaveVelocity = [], borders = [];
for (var y = 0; y < rows; y++) {
  pWaveDisplacement[y] = new Float32Array(cols);
  sWaveDisplacement[y] = new Float32Array(cols);
  pWaveVelocity[y] = new Float32Array(cols);
  sWaveVelocity[y] = new Float32Array(cols);
  borders[y] = new Uint8Array(cols);
}

function resetFields() {
  for (var y = 0; y < rows; y++) {
    pWaveDisplacement[y].fill(0);
    sWaveDisplacement[y].fill(0);
    pWaveVelocity[y].fill(0);
    sWaveVelocity[y].fill(0);
  }
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  cellWidth = canvas.width / cols;
  cellHeight = canvas.height / rows;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (var x = 0; x <= cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * cellWidth, 0); ctx.lineTo(x * cellWidth, canvas.height); ctx.stroke();
  }
  for (var y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * cellHeight); ctx.lineTo(canvas.width, y * cellHeight); ctx.stroke();
  }
}

function drawWaves() {
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      if (borders[y][x]) continue;
      const p = pWaveDisplacement[y][x];
      const s = sWaveDisplacement[y][x];
      const r = Math.max(0, Math.min(255, 128 + 127 * (p - s)));
      const g = Math.max(0, Math.min(255, 128 + 127 * (s - p)));
      const b = Math.max(0, Math.min(255, 128 - 127 * (p + s)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
  }
  if (originX !== null && originY !== null) {
    ctx.fillStyle = 'lime';
    ctx.fillRect(originX * cellWidth, originY * cellHeight, cellWidth, cellHeight);
  }
}

function drawBorders() {
  ctx.fillStyle = "#00f";
  for (var y = 0; y < rows; y++) {
    for (var x = 0; x < cols; x++) {
      if (borders[y][x]) ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
  }
}

function updatePhysics(dt) {
  const scaleVp = (pWaveVelocityKM * dt / kmPerCell) ** 2;
  const scaleVs = (sWaveVelocityKM * dt / kmPerCell) ** 2;
  for (var y = 1; y < rows - 1; y++) {
    for (var x = 1; x < cols - 1; x++) {
      if (borders[y][x]) continue;
      const lapP = pWaveDisplacement[y][x+1] + pWaveDisplacement[y][x-1] + pWaveDisplacement[y+1][x] + pWaveDisplacement[y-1][x] - 4 * pWaveDisplacement[y][x];
      const lapS = sWaveDisplacement[y][x+1] + sWaveDisplacement[y][x-1] + sWaveDisplacement[y+1][x] + sWaveDisplacement[y-1][x] - 4 * sWaveDisplacement[y][x];
      pWaveVelocity[y][x] += scaleVp * lapP;
      sWaveVelocity[y][x] += scaleVs * lapS;
      pWaveVelocity[y][x] *= 0.995;
      sWaveVelocity[y][x] *= 0.995;
    }
  }
for (var y = 0; y < rows; y++) {
  for (var x = 0; x < cols; x++) {
      if (borders[y][x]) {
        pWaveVelocity[y][x] *= -0.5;
        sWaveVelocity[y][x] *= -0.5;
      }
    pWaveDisplacement[y][x] += pWaveVelocity[y][x];
    sWaveDisplacement[y][x] += sWaveVelocity[y][x];
    }
  }
}

var lastTimestamp = null;
var deltaAccumulator = 0;

function animate(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const deltaTime = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  if (simRunning) {
    deltaAccumulator += deltaTime;
    while (deltaAccumulator >= fixedDt) {
      updatePhysics(fixedDt);
      deltaAccumulator -= fixedDt;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawWaves();
  drawBorders();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

canvas.addEventListener("mousedown", e => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / cellWidth);
  const y = Math.floor((e.clientY - rect.top) / cellHeight);
  if (simRunning) return;
  if (drawTool === 'pen' || drawTool === 'eraser') {
    paint(x, y); isDrawing = true;
  } else if (drawTool === 'origin') {
    if (borders[y][x] === 1) return;
    originX = x; originY = y;
    document.getElementById("startSim").style.display = 'inline-block';
  }
});

canvas.addEventListener("mousemove", e => {
  if (!isDrawing || simRunning) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / cellWidth);
  const y = Math.floor((e.clientY - rect.top) / cellHeight);
  paint(x, y);
});

window.addEventListener("mouseup", () => { isDrawing = false; });

function paint(x, y) {
  if (x >= 0 && x < cols && y >= 0 && y < rows) {
    if (drawTool === 'pen') {
      if (x === originX && y === originY) return;
      borders[y][x] = 1;
    }
    else if (drawTool === 'eraser') {
      borders[y][x] = 0;
      if (x === originX && y === originY) {
        originX = null;
        originY = null;
        document.getElementById("startSim").style.display = 'none';
      }
    }
  }
}

document.getElementById("tool").onclick = () => {
  if (simRunning) return;
  if (drawTool === 'pen') drawTool = 'eraser';
  else if (drawTool === 'eraser') drawTool = 'origin';
  else drawTool = 'pen';
  document.getElementById("toolLabel").innerText = drawTool.charAt(0).toUpperCase() + drawTool.slice(1);
};

function injectEarthquake(mag) {
  const r = 3;
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      const ix = originX + dx;
      const iy = originY + dy;
      if (ix >= 0 && ix < cols && iy >= 0 && iy < rows) {
        const d = Math.hypot(dx, dy);
        const amp = mag * Math.exp(-d);
        pWaveDisplacement[iy][ix] += amp;
        sWaveDisplacement[iy][ix] += amp * 0.8;
      }
    }
  }
}

document.getElementById("startSim").onclick = () => {
  if (originX !== null && originY !== null && !simRunning) {
    storedMag = parseFloat(document.getElementById("mag").value);
    resetFields();
    injectEarthquake(storedMag);
    simRunning = true;
    document.getElementById("startSim").style.display = 'none';
    document.getElementById("reload").style.display = 'inline-block';
    document.getElementById("replay").style.display = 'inline-block';
  }
};

document.getElementById("replay").onclick = () => {
  if (originX !== null && originY !== null) {
      resetFields();
      injectEarthquake(storedMag);
      simRunning = true;
  };
}
    
document.getElementById("reload").onclick = () => location.reload();