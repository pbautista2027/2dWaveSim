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
  paintDropdown: { left: 310, top: 10 },
  terrainDropdown: { left: 630, top: 10 }
};

document.getElementById('resetAll').onclick = () => {
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
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let cols = 100, rows = 100, cellW, cellH;

function resizeCanvas() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  cellW = canvas.width / cols;
  cellH = canvas.height / rows;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// — Medium & Grid —
// Definitions merging original generic and Metro Manila soils:
class Medium {
  constructor(id, name, color, speed = 1, damping = 0.995, reflect = false) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.speed = speed;
    this.damping = damping;
    this.reflect = reflect;
  }
  propagate() { return !this.reflect; }
}
// IDs:
// 0: Soft Soil (generic)         → speed 1.0, damping 0.995
// 1: Border (reflective)         → speed 1.0, damping 0.5, reflect
// 2: Water                       → speed 0.85, damping 0.995
// 3: Sand (generic)             → speed 0.9, damping 0.99
// 4: Rock (generic bedrock)     → speed 3.0, damping 0.997
// 5: Coastal Lowland            → speed 0.6, damping 0.98
// 6: Central Plateau            → speed 2.0, damping 0.995
// 7: Marikina Valley            → speed 0.5, damping 0.97
// 8: Novaliches Loam            → speed 1.8, damping 0.994
// 9: San Luis Clay              → speed 1.0, damping 0.99
const mediums = [
  new Medium(0, 'Soft Soil', '#884400', 1.0, 0.995, false),
  new Medium(1, 'Border', '#444444', 1.0, 0.5, true),
  new Medium(2, 'Water', '#00aaff', 0.85, 0.995, false),
  new Medium(3, 'Sand', '#d2b48c', 0.9, 0.99, false),
  new Medium(4, 'Rock', '#888888', 3.0, 0.997, false),
  new Medium(5, 'Coastal Lowland', '#a0d6b4', 0.6, 0.98, false),
  new Medium(6, 'Central Plateau', '#884400', 2.0, 0.995, false),
  new Medium(7, 'Marikina Valley', '#e0a899', 0.5, 0.97, false),
  new Medium(8, 'Novaliches Loam', '#b56576', 1.8, 0.994, false),
  new Medium(9, 'San Luis Clay', '#d2b48c', 1.0, 0.99, false)
];

// Initialize mediumGrid default to Soft Soil (ID 0)
const mediumGrid = Array.from({ length: rows }, () => {
  const arr = new Uint8Array(cols);
  arr.fill(0);
  return arr;
});

// Populate legend
const legendDiv = document.getElementById('mediumLegend');
function populateLegend(){
  legendDiv.innerHTML = '';
  const ul = document.createElement('ul');
  ul.style.paddingLeft = '1.2em';
  mediums.forEach(m => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.style.display = 'inline-block';
    span.style.width = '1em';
    span.style.height = '1em';
    span.style.background = m.color;
    span.style.marginRight = '4px';
    li.appendChild(span);
    li.appendChild(document.createTextNode(m.name));
    ul.appendChild(li);
  });
  legendDiv.appendChild(ul);
}
populateLegend();

// — Wave fields —
const pDisp = [], sDisp = [], pVel = [], sVel = [];
for (let y = 0; y < rows; y++) {
  pDisp[y] = new Float32Array(cols);
  sDisp[y] = new Float32Array(cols);
  pVel[y] = new Float32Array(cols);
  sVel[y] = new Float32Array(cols);
}
function resetFields() {
  for (let y = 0; y < rows; y++) {
    pDisp[y].fill(0);
    sDisp[y].fill(0);
    pVel[y].fill(0);
    sVel[y].fill(0);
  }
}

// — State & UI Bindings —
let drawTool = 'origin', penW = 1, eraserW = 1, hollow = false;
let origins = []; // {x,y,mag}
let simRunning = false;
let lastMouse = { x: 0, y: 0 }, preview = null, shapeStart = null;

// Undo/Redo stacks
const undoStack = [];
const redoStack = [];

const originBtn = document.getElementById('originBtn');
const startBtn = document.getElementById('startSim');
const replayBtn = document.getElementById('replay');
const reloadBtn = document.getElementById('reload');
const magInput = document.getElementById('mag');

const paintSelect = document.getElementById('paintMediumSelect');
mediums.forEach(m => paintSelect.add(new Option(m.name, m.id)));

const paintButtons = ['penBtn','eraserBtn','rectBtn','sphereBtn','fillBtn']
  .map(id => document.getElementById(id));

const originsListDiv = document.getElementById('originsList');
const clearOriginsBtn = document.getElementById('clearOriginsBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// Terrain UI elements
const terrainModeSel = document.getElementById('terrainMode');
const syntheticControls = document.getElementById('syntheticControls');
const noiseControls     = document.getElementById('noiseControls');
const geojsonControls   = document.getElementById('geojsonControls');
const applyTerrainBtn   = document.getElementById('applyTerrain');
const geojsonTutorialBtn = document.getElementById('geojsonTutorialBtn');

// Synthetic inputs
const synFracWater    = document.getElementById('synFracWater');
const synFracClay     = document.getElementById('synFracClay');
const synFracAlluvial = document.getElementById('synFracAlluvial');
const synFracVolcanic = document.getElementById('synFracVolcanic');

// Noise inputs
const noiseScaleInp   = document.getElementById('noiseScale');
const waterThreshInp  = document.getElementById('waterThresh');
const sandThreshInp   = document.getElementById('sandThresh');
const rockThreshInp   = document.getElementById('rockThresh');
const noiseScaleLabel = document.getElementById('noiseScaleLabel');
const waterThreshLabel= document.getElementById('waterThreshLabel');
const sandThreshLabel = document.getElementById('sandThreshLabel');
const rockThreshLabel = document.getElementById('rockThreshLabel');

// GeoJSON inputs
const soilGeojsonFile   = document.getElementById('soilGeojsonFile');
const latMinInp         = document.getElementById('latMin');
const latMaxInp         = document.getElementById('latMax');
const lonMinInp         = document.getElementById('lonMin');
const lonMaxInp         = document.getElementById('lonMax');
const soilMappingJsonInp= document.getElementById('soilMappingJson');
const applyGeojsonBtn   = document.getElementById('applyGeojsonBtn');
const geojsonStatusDiv  = document.getElementById('geojsonStatus');

let geojsonData = null;
let soilMapping = {}; // soilType → medium ID

// Modal elements
const modalOverlay = document.getElementById('modalOverlay');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalCloseBtnFooter = document.getElementById('modalCloseBtnFooter');

// Button helpers
function activateButtons(btns, activeId) {
  btns.forEach(id => {
    const b = document.getElementById(id);
    b.classList.toggle('active', id === activeId);
  });
}

// Push current state onto undoStack; clear redoStack
function pushStateForUndo() {
  const gridCopy = mediumGrid.map(row => row.slice());
  const originsCopy = origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  undoStack.push({ grid: gridCopy, origins: originsCopy });
  redoStack.length = 0;
  updateUndoRedoButtons();
}

// Update Undo/Redo button disabled states
function updateUndoRedoButtons() {
  undoBtn.disabled = simRunning || undoStack.length === 0;
  redoBtn.disabled = simRunning || redoStack.length === 0;
}

// Undo action
undoBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (undoStack.length === 0) return;
  const gridCopy = mediumGrid.map(row => row.slice());
  const originsCopy = origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  redoStack.push({ grid: gridCopy, origins: originsCopy });
  const prev = undoStack.pop();
  for (let y = 0; y < rows; y++) {
    mediumGrid[y].set(prev.grid[y]);
  }
  origins = prev.origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  refreshOriginsList();
  updateUndoRedoButtons();
});

// Redo action
redoBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (redoStack.length === 0) return;
  const gridCopy = mediumGrid.map(row => row.slice());
  const originsCopy = origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  undoStack.push({ grid: gridCopy, origins: originsCopy });
  const next = redoStack.pop();
  for (let y = 0; y < rows; y++) {
    mediumGrid[y].set(next.grid[y]);
  }
  origins = next.origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  refreshOriginsList();
  updateUndoRedoButtons();
});

// Update UI enabled/disabled based on state
function updateUIState() {
  startBtn.disabled = simRunning || origins.length === 0;
  replayBtn.disabled = !simRunning;
  reloadBtn.disabled = !simRunning;
  originBtn.disabled = simRunning;
  paintButtons.forEach(b => b.disabled = simRunning);
  document.getElementById('penWidth2').disabled = simRunning;
  document.getElementById('eraserSize2').disabled = simRunning;
  document.getElementById('shapeHollow2').disabled = simRunning;
  paintSelect.disabled = simRunning;
  magInput.disabled = simRunning;
  // Disable terrain UI while running
  terrainModeSel.disabled = simRunning;
  synFracWater.disabled    = simRunning;
  synFracClay.disabled     = simRunning;
  synFracAlluvial.disabled = simRunning;
  synFracVolcanic.disabled = simRunning;
  noiseScaleInp.disabled   = simRunning;
  waterThreshInp.disabled  = simRunning;
  sandThreshInp.disabled   = simRunning;
  rockThreshInp.disabled   = simRunning;
  soilGeojsonFile.disabled = simRunning;
  latMinInp.disabled = simRunning;
  latMaxInp.disabled = simRunning;
  lonMinInp.disabled = simRunning;
  lonMaxInp.disabled = simRunning;
  soilMappingJsonInp.disabled = simRunning;
  applyGeojsonBtn.disabled = simRunning;
  applyTerrainBtn.disabled = simRunning;
  // GeoJSON Tutorial button: enabled when visible and not running
  geojsonTutorialBtn.disabled = simRunning;
  // Undo/Redo
  updateUndoRedoButtons();
  // Origins list: disable remove buttons & per-origin mags if running
  originsListDiv.querySelectorAll('.remove-origin').forEach(btn => btn.disabled = simRunning);
  originsListDiv.querySelectorAll('.origin-mag').forEach(inp => inp.disabled = simRunning);
  clearOriginsBtn.disabled = simRunning;
}
updateUIState();

// Refresh origins list UI
function refreshOriginsList() {
  originsListDiv.innerHTML = '';
  if (origins.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.style.fontSize = '13px';
    placeholder.style.color = '#666';
    placeholder.textContent = 'No origins yet';
    originsListDiv.appendChild(placeholder);
  } else {
    origins.forEach((pt, idx) => {
      const item = document.createElement('div');
      item.className = 'origin-item';
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

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-origin';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove this origin';
      removeBtn.addEventListener('click', () => {
        if (simRunning) return;
        pushStateForUndo();
        origins.splice(idx, 1);
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
  if (simRunning) return;
  drawTool = 'origin';
  originBtn.classList.add('active');
  paintButtons.forEach(b => b.classList.remove('active'));
  updateUIState();
});

// Clear Origins
clearOriginsBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (origins.length > 0) {
    pushStateForUndo();
    origins = [];
    refreshOriginsList();
    updateUIState();
  }
});

// Paint tool buttons
paintButtons.forEach(btnEl => {
  btnEl.addEventListener('click', () => {
    if (simRunning) return;
    const id = btnEl.id;
    const tool = id.replace('Btn', '');
    drawTool = tool;
    activateButtons(['penBtn','eraserBtn','rectBtn','sphereBtn','fillBtn'], id);
    originBtn.classList.remove('active');
    updateUIState();
  });
});

// Pen/Eraser/Hollow sliders
document.getElementById('penWidth2').addEventListener('input', e => {
  penW = +e.target.value;
  document.getElementById('penWidthLabel2').innerText = penW;
});
document.getElementById('eraserSize2').addEventListener('input', e => {
  eraserW = +e.target.value;
  document.getElementById('eraserSizeLabel2').innerText = eraserW;
});
document.getElementById('shapeHollow2').addEventListener('change', e => {
  hollow = e.target.checked;
});

// Start/Replay/Reload
startBtn.addEventListener('click', () => {
  if (origins.length > 0 && !simRunning) {
    resetFields();
    injectAllOrigins();
    simRunning = true;
    updateUIState();
  }
});
replayBtn.addEventListener('click', () => {
  if (origins.length > 0 && simRunning) {
    resetFields();
    injectAllOrigins();
    updateUIState();
  }
});
reloadBtn.addEventListener('click', () => {
  if (simRunning) {
    location.reload();
  }
});

// Noise controls event listeners
noiseScaleInp.addEventListener('input', e => {
  noiseScaleLabel.innerText = parseFloat(e.target.value).toFixed(2);
});
waterThreshInp.addEventListener('input', e => {
  waterThreshLabel.innerText = parseFloat(e.target.value).toFixed(2);
});
sandThreshInp.addEventListener('input', e => {
  sandThreshLabel.innerText = parseFloat(e.target.value).toFixed(2);
});
rockThreshInp.addEventListener('input', e => {
  rockThreshLabel.innerText = parseFloat(e.target.value).toFixed(2);
});

// Terrain mode change: show/hide controls and GeoJSON Tutorial button
terrainModeSel.addEventListener('change', () => {
  const mode = terrainModeSel.value;
  syntheticControls.style.display = (mode === 'synthetic' ? 'block' : 'none');
  noiseControls.style.display     = (mode === 'noise' ? 'block' : 'none');
  geojsonControls.style.display   = (mode === 'geojson' ? 'block' : 'none');
  // Show/hide tutorial button
  geojsonTutorialBtn.style.display = (mode === 'geojson') ? 'block' : 'none';
  updateUIState();
});
// Initialize visibility on load
(function initTerrainUI() {
  const mode = terrainModeSel.value;
  syntheticControls.style.display = (mode === 'synthetic' ? 'block' : 'none');
  noiseControls.style.display     = (mode === 'noise' ? 'block' : 'none');
  geojsonControls.style.display   = (mode === 'geojson' ? 'block' : 'none');
  geojsonTutorialBtn.style.display = (mode === 'geojson') ? 'block' : 'none';
})();
updateUIState();

// GeoJSON Tutorial button click: show modal
geojsonTutorialBtn.addEventListener('click', () => {
  showModal();
});

// Modal close buttons
modalCloseBtn.addEventListener('click', hideModal);
modalCloseBtnFooter.addEventListener('click', hideModal);

// Functions to show/hide modal
function showModal() {
  modalOverlay.classList.add('show');
}
function hideModal() {
  modalOverlay.classList.remove('show');
}

// ===== Terrain generation functions =====

// Synthetic generation including water zone
function applySyntheticTerrain() {
  let fW = parseFloat(synFracWater.value);
  let fC = parseFloat(synFracClay.value);
  let fA = parseFloat(synFracAlluvial.value);
  let fV = parseFloat(synFracVolcanic.value);
  let sum = fW + fC + fA + fV;
  if (sum > 0) {
    fW /= sum; fC /= sum; fA /= sum; fV /= sum;
  } else {
    fW = 0.1; fC = 0.2; fA = 0.4; fV = 0.3;
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
        mediumGrid[y][x] = 1; // Border
      } else {
        const fx = x / cols;
        let accum = fW;
        if (fx < accum) {
          mediumGrid[y][x] = 2; // Water
        } else if (fx < accum + fC) {
          mediumGrid[y][x] = 5; // Coastal Lowland
        } else if (fx < accum + fC + fA) {
          mediumGrid[y][x] = 6; // Central Plateau
        } else {
          mediumGrid[y][x] = 7; // Marikina Valley
        }
      }
    }
  }
}

// Noise-based random terrain
function applyNoiseTerrain() {
  const ns = parseFloat(noiseScaleInp.value);
  const wT = parseFloat(waterThreshInp.value);
  const sT = parseFloat(sandThreshInp.value);
  const rT = parseFloat(rockThreshInp.value);
  function noise(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
        mediumGrid[y][x] = 1;
      } else {
        const nx = x * ns;
        const ny = y * ns;
        const v = noise(nx, ny);
        let m;
        if (v < wT) m = 2;         // Water
        else if (v < sT) m = 5;    // Coastal Lowland
        else if (v < rT) m = 6;    // Central Plateau
        else m = 4;                // Rock
        mediumGrid[y][x] = m;
      }
    }
  }
}

// GeoJSON-based terrain
function pointInPolygon(lon, lat, rings) {
  const ring = rings[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

applyGeojsonBtn.addEventListener('click', () => {
  geojsonStatusDiv.textContent = '';
  const file = soilGeojsonFile.files[0];
  if (!file) {
    geojsonStatusDiv.style.color = '#900';
    geojsonStatusDiv.textContent = 'Please select a GeoJSON file.';
    return;
  }
  let mapObj = {};
  const txt = soilMappingJsonInp.value.trim();
  if (txt) {
    try {
      mapObj = JSON.parse(txt);
    } catch (err) {
      geojsonStatusDiv.style.color = '#900';
      geojsonStatusDiv.textContent = 'Invalid mapping JSON.';
      return;
    }
  } else {
    geojsonStatusDiv.style.color = '#900';
    geojsonStatusDiv.textContent = 'Please provide mapping JSON.';
    return;
  }
  soilMapping = mapObj;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.features) {
        geojsonStatusDiv.style.color = '#900';
        geojsonStatusDiv.textContent = 'GeoJSON lacks features.';
        return;
      }
      geojsonData = data;
      geojsonStatusDiv.style.color = '#080';
      geojsonStatusDiv.textContent = 'GeoJSON loaded. Click "Apply Terrain".';
    } catch (err) {
      geojsonStatusDiv.style.color = '#900';
      geojsonStatusDiv.textContent = 'Error parsing GeoJSON.';
    }
  };
  reader.readAsText(file);
});

function applyGeojsonTerrain() {
  if (!geojsonData) {
    geojsonStatusDiv.style.color = '#900';
    geojsonStatusDiv.textContent = 'No GeoJSON loaded.';
    return;
  }
  let latMin = parseFloat(latMinInp.value);
  let latMax = parseFloat(latMaxInp.value);
  let lonMin = parseFloat(lonMinInp.value);
  let lonMax = parseFloat(lonMaxInp.value);
  if (isNaN(latMin) || isNaN(latMax) || isNaN(lonMin) || isNaN(lonMax)
      || latMax <= latMin || lonMax <= lonMin) {
    geojsonStatusDiv.style.color = '#900';
    geojsonStatusDiv.textContent = 'Invalid bounding box.';
    return;
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
        mediumGrid[y][x] = 1;
      } else {
        const lat = latMin + (y + 0.5) * (latMax - latMin) / rows;
        const lon = lonMin + (x + 0.5) * (lonMax - lonMin) / cols;
        let assigned = false;
        for (const feat of geojsonData.features) {
          const geom = feat.geometry;
          if (!geom) continue;
          if (geom.type === 'Polygon') {
            if (pointInPolygon(lon, lat, geom.coordinates)) {
              const soilType = feat.properties && feat.properties.soil_type;
              const mid = (soilType in soilMapping) ? soilMapping[soilType] : null;
              if (mid !== null && mid >= 0 && mid < mediums.length) {
                mediumGrid[y][x] = mid;
              } else {
                mediumGrid[y][x] = 0; // default Soft Soil
              }
              assigned = true;
              break;
            }
          } else if (geom.type === 'MultiPolygon') {
            for (const ringSet of geom.coordinates) {
              if (pointInPolygon(lon, lat, ringSet)) {
                const soilType = feat.properties && feat.properties.soil_type;
                const mid = (soilType in soilMapping) ? soilMapping[soilType] : null;
                if (mid !== null && mid >= 0 && mid < mediums.length) {
                  mediumGrid[y][x] = mid;
                } else {
                  mediumGrid[y][x] = 0;
                }
                assigned = true;
                break;
              }
            }
            if (assigned) break;
          }
        }
        if (!assigned) {
          mediumGrid[y][x] = 0; // default Soft Soil
        }
      }
    }
  }
  geojsonStatusDiv.style.color = '#080';
  geojsonStatusDiv.textContent = 'Applied GeoJSON terrain.';
}

// Unified Apply Terrain button
applyTerrainBtn.addEventListener('click', () => {
  if (simRunning) return;
  const mode = terrainModeSel.value;
  if (mode === 'synthetic') {
    applySyntheticTerrain();
  } else if (mode === 'noise') {
    applyNoiseTerrain();
  } else if (mode === 'geojson') {
    applyGeojsonTerrain();
  }
});

// ===== Mouse & Painting/Origin =====
canvas.addEventListener('mousemove', e => {
  const gm = toGrid(e);
  if (gm) lastMouse = gm;
  if (simRunning) return;
  if (drawTool === 'origin') {
    // preview highlight in drawPreview()
  } else {
    if (!gm) return;
    if (e.buttons) {
      paintAt(gm.x, gm.y);
      if ((drawTool === 'rect' || drawTool === 'sphere') && shapeStart) {
        preview = { tool: drawTool, x0: shapeStart.x, y0: shapeStart.y, x1: gm.x, y1: gm.y };
      }
    }
  }
});
canvas.addEventListener('mousedown', e => {
  if (simRunning) return;
  const gm = toGrid(e);
  if (!gm) return;
  if (drawTool === 'origin' && mediumGrid[gm.y][gm.x] !== 1) {
    const exists = origins.some(pt => pt.x === gm.x && pt.y === gm.y);
    if (!exists) {
      pushStateForUndo();
      let defaultMag = parseFloat(magInput.value);
      if (isNaN(defaultMag) || defaultMag < 0) defaultMag = 0;
      origins.push({ x: gm.x, y: gm.y, mag: defaultMag });
      refreshOriginsList();
      updateUIState();
    }
  } else if (['pen','eraser','fill','rect','sphere'].includes(drawTool)) {
    pushStateForUndo();
    if (drawTool === 'pen' || drawTool === 'eraser' || drawTool === 'fill') {
      paintAt(gm.x, gm.y);
    }
    if (drawTool === 'rect' || drawTool === 'sphere') {
      shapeStart = { ...gm };
      preview = null;
    }
  }
});
window.addEventListener('mouseup', () => {
  if (simRunning) return;
  if (shapeStart && preview) {
    finalizeShape(preview);
  }
  shapeStart = null;
  preview = null;
});

function toGrid(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / cellW);
  const y = Math.floor((e.clientY - r.top) / cellH);
  return (x >= 0 && x < cols && y >= 0 && y < rows) ? { x, y } : null;
}

function paintAt(cx, cy) {
  if (simRunning) return;
  const mid = +paintSelect.value;
  if (drawTool === 'pen') {
    for (let dy = -penW; dy <= penW; dy++) {
      for (let dx = -penW; dx <= penW; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
          mediumGrid[ny][nx] = mid;
        }
      }
    }
  }
  if (drawTool === 'eraser') {
    for (let dy = -eraserW; dy <= eraserW; dy++) {
      for (let dx = -eraserW; dx <= eraserW; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
          mediumGrid[ny][nx] = 0; // reset to Soft Soil by default
        }
      }
    }
  }
  if (drawTool === 'fill') {
    const target = mediumGrid[cy][cx];
    if (target === mid) return;
    const stk = [{ x: cx, y: cy }];
    while (stk.length) {
      const p = stk.pop();
      if (p.x < 0 || p.y < 0 || p.x >= cols || p.y >= rows) continue;
      if (mediumGrid[p.y][p.x] !== target) continue;
      mediumGrid[p.y][p.x] = mid;
      stk.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y },
               { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
    }
  }
}

function finalizeShape({ tool, x0, y0, x1, y1 }) {
  if (simRunning) return;
  const mid = +paintSelect.value;
  const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1);
  const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
  if (tool === 'rect') {
    if (hollow) {
      for (let x = xmin; x <= xmax; x++) {
        mediumGrid[ymin][x] = mid;
        mediumGrid[ymax][x] = mid;
      }
      for (let y = ymin; y <= ymax; y++) {
        mediumGrid[y][xmin] = mid;
        mediumGrid[y][xmax] = mid;
      }
    } else {
      for (let y = ymin; y <= ymax; y++) {
        for (let x = xmin; x <= xmax; x++) {
          mediumGrid[y][x] = mid;
        }
      }
    }
  } else if (tool === 'sphere') {
    const rx = Math.abs(x1 - x0), ry = Math.abs(y1 - y0);
    if (rx === 0 || ry === 0) {
      if (hollow) {
        if (rx === 0) {
          for (let y = ymin; y <= ymax; y++) mediumGrid[y][x0] = mid;
        } else {
          for (let x = xmin; x <= xmax; x++) mediumGrid[y0][x] = mid;
        }
      } else {
        if (rx === 0) {
          for (let y = ymin; y <= ymax; y++) mediumGrid[y][x0] = mid;
        } else {
          for (let x = xmin; x <= xmax; x++) mediumGrid[y0][x] = mid;
        }
      }
    } else {
      if (hollow) {
        for (let i = 0; i < 360; i++) {
          const θ = i / 360 * 2 * Math.PI;
          const ix = Math.round(x0 + Math.cos(θ) * rx),
                iy = Math.round(y0 + Math.sin(θ) * ry);
          if (ix >= 0 && iy >= 0 && ix < cols && iy < rows) {
            mediumGrid[iy][ix] = mid;
          }
        }
      } else {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (((x - x0) / rx) ** 2 + ((y - y0) / ry) ** 2 <= 1) {
              mediumGrid[y][x] = mid;
            }
          }
        }
      }
    }
  }
}

// — Physics & rendering —
const km = 0.5, dtFixed = 0.01, pSpeed = 6, sSpeed = 3.5;
function updatePhysics(dt) {
  const vp = (pSpeed * dt / km) ** 2, vs = (sSpeed * dt / km) ** 2;
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const lapP = pDisp[y][x+1] + pDisp[y][x-1] + pDisp[y+1][x] + pDisp[y-1][x] - 4 * pDisp[y][x];
      const lapS = sDisp[y][x+1] + sDisp[y][x-1] + sDisp[y+1][x] + sDisp[y-1][x] - 4 * sDisp[y][x];
      const m = mediums[ mediumGrid[y][x] ];
      pVel[y][x] += vp * lapP * m.speed;
      sVel[y][x] += vs * lapS * m.speed;
      pVel[y][x] *= m.damping;
      sVel[y][x] *= m.damping;
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
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

// injectAllOrigins, draw, drawPreview, loop
function injectAllOrigins() {
  const r = 3;
  origins.forEach(({ x: ox, y: oy, mag }) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const ix = ox + dx, iy = oy + dy;
        if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) continue;
        const d = Math.hypot(dx, dy), amp = mag * Math.exp(-d);
        pDisp[iy][ix] += amp;
        sDisp[iy][ix] += amp * 0.8;
      }
    }
  });
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function draw() {
  // draw medium background
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = mediums[ mediumGrid[y][x] ].color;
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }
  // overlay waves
  ctx.globalAlpha = 0.6;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (mediums[ mediumGrid[y][x] ].reflect) continue;
      const p = pDisp[y][x], s = sDisp[y][x];
      const r = clamp(128 + 127 * (p - s));
      const g = clamp(128 + 127 * (s - p));
      const b = clamp(128 - 127 * (p + s));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }
  ctx.globalAlpha = 1;
  // draw origins
  origins.forEach(({ x, y }) => {
    ctx.fillStyle = 'lime';
    ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
  });
  drawPreview();
}

function drawPreview() {
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 2;
  if (drawTool === 'pen') {
    const w = penW;
    ctx.strokeRect((lastMouse.x - w) * cellW, (lastMouse.y - w) * cellH, (2*w+1) * cellW, (2*w+1) * cellH);
  } else if (drawTool === 'eraser') {
    const r = eraserW;
    ctx.strokeRect((lastMouse.x - r) * cellW, (lastMouse.y - r) * cellH, (2*r+1) * cellW, (2*r+1) * cellH);
  } else if (drawTool === 'origin') {
    if (lastMouse) {
      ctx.strokeRect(lastMouse.x * cellW, lastMouse.y * cellH, cellW, cellH);
    }
  } else if (preview) {
    const { tool, x0, y0, x1, y1 } = preview;
    if (tool === 'rect') {
      const xmin = Math.min(x0, x1), ymin = Math.min(y0, y1);
      const w = Math.abs(x1 - x0) + 1, h = Math.abs(y1 - y0) + 1;
      ctx.strokeRect(xmin * cellW, ymin * cellH, w * cellW, h * cellH);
    } else {
      const rx = Math.abs(x1 - x0) * cellW, ry = Math.abs(y1 - y0) * cellH;
      ctx.beginPath();
      ctx.ellipse((x0 + 0.5) * cellW, (y0 + 0.5) * cellH, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}

let lastTs = 0, acc = 0;
function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  if (simRunning) {
    acc += dt;
    while (acc >= dtFixed) {
      updatePhysics(dtFixed);
      acc -= dtFixed;
    }
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== Terrain generation functions =====
// (applySyntheticTerrain, applyNoiseTerrain, applyGeojsonTerrain defined above)
