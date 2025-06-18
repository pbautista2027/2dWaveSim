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
  terrainDropdown: { left: 530, top: 10 }
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
// Disable image smoothing globally so icons drawn at scaled sizes stay pixelated
ctx.imageSmoothingEnabled = false;
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
// Example Metro Manila soils + generic (placeholder values/colors)
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
// Tools: 'origin', 'pen', 'eraser', 'rect', 'sphere', 'fill', 'text', 'icon'
let drawTool = 'origin', penW = 1, eraserW = 1, hollow = false;
let origins = []; // {x,y,mag}
let simRunning = false;
let lastMouse = { x: 0, y: 0 }, preview = null, shapeStart = null;

// Overlay toggle: show/hide text & icons
let showOverlays = true;

// Text elements: { text, x, y, color, fontFamily, fontSize, opacity, bold, italic }
let textElements = [];
let selectedTextIndex = null;
let typingMode = false;
let typingPos = { x: 0, y: 0 };
let typingText = "";
let typingStyle = null;
let editingIndex = null;
let textAction = null;
let textDragOffset = { dx: 0, dy: 0 };
let textResizeOrig = null;

// Icon Tool state:
let icons = []; // saved icons: [{ name, dataURL }, ...]
let selectedIconIndex = null;
let iconPlacements = []; // placed icons: { dataURL, img:Image, x, y, width, height }
let selectedPlacementIndex = null;
let iconPlacementAction = null;
let iconPlacementDragOffset = { dx: 0, dy: 0 };
let iconPlacementResizeOrig = null;

// Icon Maker state:
let iconMakerUndoStack = [];
let iconMakerRedoStack = [];
let iconPalette = [];
let iconImageData = null; // ImageData for the 50×50 content
let iconLastMouseXY = { x: -1, y: -1 };

// UI element references
const originBtn = document.getElementById('originBtn');
const startBtn = document.getElementById('startSim');
const replayBtn = document.getElementById('replay');
const finishBtn = document.getElementById('finishSim');
const reloadBtn = document.getElementById('reload');
const magInput = document.getElementById('mag');

const paintSelect = document.getElementById('paintMediumSelect');
mediums.forEach(m => paintSelect.add(new Option(m.name, m.id)));

const paintButtons = ['penBtn','eraserBtn','rectBtn','sphereBtn','fillBtn','textBtn','iconBtn']
  .map(id => document.getElementById(id));

const originsListDiv = document.getElementById('originsList');
const clearOriginsBtn = document.getElementById('clearOriginsBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

// Text tool controls
const textControlsDiv = document.getElementById('textControls');
const textColorInp = document.getElementById('textColor');
const fontSelect = document.getElementById('fontSelect');
const textSizeInp = document.getElementById('textSize');
const textOpacityInp = document.getElementById('textOpacity');
const textBoldChk = document.getElementById('textBold');
const textItalicChk = document.getElementById('textItalic');

// Icon Tool UI
const iconSectionDiv = document.getElementById('iconSection');
const iconListContainer = document.getElementById('iconListContainer');
const openIconMakerBtn = document.getElementById('openIconMakerBtn');
const iconLoadInput = document.getElementById('iconLoadInput');
const exportAllIconsBtn = document.getElementById('exportAllIconsBtn');

// Icon Maker modal elements
const iconMakerOverlay = document.getElementById('iconMakerOverlay');
const iconMakerClose = document.getElementById('iconMakerClose');
const iconCanvas = document.getElementById('iconCanvas');
const iconCtx = iconCanvas.getContext('2d');
const iconColorPicker = document.getElementById('iconColorPicker');
const iconPenSizeInp = document.getElementById('iconPenSize');
const iconPenSizeRange = document.getElementById('iconPenSizeRange');
const iconDrawToolSel = document.getElementById('iconDrawTool');
const iconShapeHollowChk = document.getElementById('iconShapeHollow');
const iconPaletteDiv = document.getElementById('iconPalette');
const iconUndoBtn = document.getElementById('iconUndoBtn');
const iconRedoBtn = document.getElementById('iconRedoBtn');
const iconNameInput = document.getElementById('iconNameInput');
const iconSaveBtn = document.getElementById('iconSaveBtn');
const iconDownloadBtn = document.getElementById('iconDownloadBtn');
const iconMakerListDiv = document.getElementById('iconMakerList');

// Terrain UI elements
const noiseScaleInp   = document.getElementById('noiseScale');
const waterThreshInp  = document.getElementById('waterThresh');
const sandThreshInp   = document.getElementById('sandThresh');
const rockThreshInp   = document.getElementById('rockThresh');
const noiseScaleLabel = document.getElementById('noiseScaleLabel');
const waterThreshLabel= document.getElementById('waterThreshLabel');
const sandThreshLabel = document.getElementById('sandThreshLabel');
const rockThreshLabel = document.getElementById('rockThreshLabel');
const generateTerrainBtn = document.getElementById('generateTerrain');

// Toggle overlays button
const toggleOverlayBtn = document.getElementById('toggleOverlayBtn');

// Button helpers
function activateButtons(btns, activeId) {
  btns.forEach(id => {
    const b = document.getElementById(id);
    b.classList.toggle('active', id === activeId);
  });
}

// Undo/Redo stacks for main simulation/paint/text/icon placements
const undoStack = [];
const redoStack = [];

// Push current state onto undoStack; clear redoStack
function pushStateForUndo() {
  const gridCopy = mediumGrid.map(row => row.slice());
  const originsCopy = origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  const textCopy = textElements.map(te => ({
    text: te.text,
    x: te.x, y: te.y,
    color: te.color,
    fontFamily: te.fontFamily,
    fontSize: te.fontSize,
    opacity: te.opacity,
    bold: te.bold,
    italic: te.italic
  }));
  const iconPlacementsCopy = iconPlacements.map(ic => ({
    dataURL: ic.dataURL, x: ic.x, y: ic.y, width: ic.width, height: ic.height
  }));
  undoStack.push({
    grid: gridCopy,
    origins: originsCopy,
    textElements: textCopy,
    iconPlacements: iconPlacementsCopy
  });
  redoStack.length = 0;
  updateUndoRedoButtons();
}

// Update Undo/Redo button disabled states
function updateUndoRedoButtons() {
  undoBtn.disabled = simRunning || undoStack.length === 0;
  redoBtn.disabled = simRunning || redoStack.length === 0;
}

// Update UI enabled/disabled based on state
function updateUIState() {
  startBtn.disabled = simRunning || origins.length === 0;
  replayBtn.disabled = !simRunning;
  finishBtn.disabled = !simRunning;
  reloadBtn.disabled = !simRunning;
  originBtn.disabled = simRunning;
  paintButtons.forEach(b => b.disabled = simRunning);
  document.getElementById('penWidth2').disabled = simRunning;
  document.getElementById('eraserSize2').disabled = simRunning;
  document.getElementById('shapeHollow2').disabled = simRunning;
  paintSelect.disabled = simRunning;
  magInput.disabled = simRunning;

  // Text controls
  textColorInp.disabled = simRunning;
  fontSelect.disabled = simRunning;
  textSizeInp.disabled = simRunning;
  textOpacityInp.disabled = simRunning;
  textBoldChk.disabled = simRunning;
  textItalicChk.disabled = simRunning;

  // Icon section
  openIconMakerBtn.disabled = simRunning;
  iconLoadInput.disabled = simRunning;
  exportAllIconsBtn.disabled = simRunning;

  // Terrain controls
  noiseScaleInp.disabled = simRunning;
  waterThreshInp.disabled = simRunning;
  sandThreshInp.disabled = simRunning;
  rockThreshInp.disabled = simRunning;
  generateTerrainBtn.disabled = simRunning;

  // Undo/Redo
  updateUndoRedoButtons();
  // Origins list: disable remove buttons & per-origin mags if running
  originsListDiv.querySelectorAll('.remove-origin').forEach(btn => btn.disabled = simRunning);
  originsListDiv.querySelectorAll('.origin-mag').forEach(inp => inp.disabled = simRunning);
  clearOriginsBtn.disabled = simRunning;

  // Toggle overlay button always enabled; style reflect current
  if (showOverlays) {
    toggleOverlayBtn.classList.add('active');
    toggleOverlayBtn.textContent = 'Hide Text/Icon';
  } else {
    toggleOverlayBtn.classList.remove('active');
    toggleOverlayBtn.textContent = 'Show Text/Icon';
  }
}
updateUIState();

// -------- Load icons from localStorage --------
function loadIconsFromStorage() {
  const raw = localStorage.getItem('seismic_simulator_icons');
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        icons = arr.filter(item => item.name && item.dataURL);
      }
    } catch {}
  }
  refreshIconListUI();
  refreshIconMakerListUI();
}
function saveIconsToStorage() {
  localStorage.setItem('seismic_simulator_icons', JSON.stringify(icons));
}

// Refresh icon list in Paint Tools window
function refreshIconListUI() {
  iconListContainer.innerHTML = '';
  icons.forEach((icon, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'icon-item';
    if (idx === selectedIconIndex) wrapper.classList.add('selected');
    // Image
    const img = document.createElement('img');
    img.src = icon.dataURL;
    wrapper.appendChild(img);
    // Name overlay
    const nameSpan = document.createElement('div');
    nameSpan.className = 'icon-name';
    nameSpan.textContent = icon.name;
    wrapper.appendChild(nameSpan);
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-icon-btn';
    removeBtn.innerText = '×';
    removeBtn.title = 'Remove this icon';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (simRunning) return;
      if (confirm(`Delete icon "${icon.name}"?`)) {
        icons.splice(idx, 1);
        if (selectedIconIndex === idx) selectedIconIndex = null;
        saveIconsToStorage();
        refreshIconListUI();
        refreshIconMakerListUI();
      }
    });
    wrapper.appendChild(removeBtn);
    // Click to select
    wrapper.addEventListener('click', () => {
      if (simRunning) return;
      selectedIconIndex = idx;
      refreshIconListUI();
    });
    iconListContainer.appendChild(wrapper);
  });
}

// -------- Icon Maker logic --------

// Clear the 50×50 icon canvas and reset iconImageData
function clearIconCanvas() {
  iconCtx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
  iconImageData = iconCtx.createImageData(iconCanvas.width, iconCanvas.height);
  // Initially fully transparent
  for (let i = 0; i < iconImageData.data.length; i += 4) {
    iconImageData.data[i+3] = 0;
  }
  renderIconCanvas();
}

// Draw grid lines on icon canvas for reference; do not modify iconImageData
function drawIconGrid() {
  const w = iconCanvas.width, h = iconCanvas.height;
  iconCtx.save();
  iconCtx.strokeStyle = 'rgba(0,0,0,0.1)';
  iconCtx.lineWidth = 0.5;
  // vertical lines
  for (let x = 0; x <= w; x++) {
    iconCtx.beginPath();
    iconCtx.moveTo(x + 0.5, 0);
    iconCtx.lineTo(x + 0.5, h);
    iconCtx.stroke();
  }
  // horizontal lines
  for (let y = 0; y <= h; y++) {
    iconCtx.beginPath();
    iconCtx.moveTo(0, y + 0.5);
    iconCtx.lineTo(w, y + 0.5);
    iconCtx.stroke();
  }
  iconCtx.restore();
}

// Render the icon canvas: put iconImageData, then grid, then hover highlight
function renderIconCanvas() {
  // Clear
  iconCtx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
  // Draw imageData
  iconCtx.putImageData(iconImageData, 0, 0);
  // Draw grid
  drawIconGrid();
  // Draw hover highlight if within bounds
  const { x: hx, y: hy } = iconLastMouseXY;
  if (hx >= 0 && hy >= 0 && hx < iconCanvas.width && hy < iconCanvas.height) {
    iconCtx.save();
    iconCtx.strokeStyle = 'yellow';
    iconCtx.lineWidth = 1;
    // strokeRect around the pixel
    iconCtx.strokeRect(hx + 0.5, hy + 0.5, 1 - 1, 1 - 1);
    iconCtx.restore();
  }
}

// Icon Maker undo/redo
function pushIconMakerState() {
  // Save a copy of iconImageData
  const copy = new ImageData(
    new Uint8ClampedArray(iconImageData.data),
    iconImageData.width,
    iconImageData.height
  );
  iconMakerUndoStack.push(copy);
  iconMakerRedoStack.length = 0;
  updateIconUndoRedoButtons();
}
function updateIconUndoRedoButtons() {
  iconUndoBtn.disabled = iconMakerUndoStack.length === 0;
  iconRedoBtn.disabled = iconMakerRedoStack.length === 0;
}
function iconMakerUndo() {
  if (iconMakerUndoStack.length === 0) return;
  const current = new ImageData(
    new Uint8ClampedArray(iconImageData.data),
    iconImageData.width,
    iconImageData.height
  );
  iconMakerRedoStack.push(current);
  const prev = iconMakerUndoStack.pop();
  iconImageData = new ImageData(
    new Uint8ClampedArray(prev.data),
    prev.width,
    prev.height
  );
  renderIconCanvas();
  updateIconUndoRedoButtons();
}
function iconMakerRedo() {
  if (iconMakerRedoStack.length === 0) return;
  const current = new ImageData(
    new Uint8ClampedArray(iconImageData.data),
    iconImageData.width,
    iconImageData.height
  );
  iconMakerUndoStack.push(current);
  const next = iconMakerRedoStack.pop();
  iconImageData = new ImageData(
    new Uint8ClampedArray(next.data),
    next.width,
    next.height
  );
  renderIconCanvas();
  updateIconUndoRedoButtons();
}

// Icon Maker palette
function addColorToIconPalette(color) {
  const existingIndex = iconPalette.indexOf(color);
  if (existingIndex !== -1) {
    iconPalette.splice(existingIndex,1);
  }
  iconPalette.unshift(color);
  if (iconPalette.length > 5) iconPalette.pop();
  refreshIconPaletteUI();
}
function refreshIconPaletteUI() {
  iconPaletteDiv.innerHTML = '';
  iconPalette.forEach(col => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch';
    sw.style.background = col;
    sw.addEventListener('click', () => {
      iconColorPicker.value = col;
    });
    iconPaletteDiv.appendChild(sw);
  });
}

// Icon Maker drawing & shape handling
let iconMakerIsDrawing = false;
let iconShapeStart = null; // { x, y }
let iconShapePreviewData = null; // ImageData before preview

// Helper: translate mouse event to canvas pixel coords
function iconEventToCanvasXY(e) {
  const rect = iconCanvas.getBoundingClientRect();
  const scaleX = iconCanvas.width / rect.width;
  const scaleY = iconCanvas.height / rect.height;
  let x = Math.floor((e.clientX - rect.left) * scaleX);
  let y = Math.floor((e.clientY - rect.top) * scaleY);
  // clamp
  x = Math.max(0, Math.min(iconCanvas.width-1, x));
  y = Math.max(0, Math.min(iconCanvas.height-1, y));
  return { x, y };
}

// Track lastMouseXY for hover highlight
iconCanvas.addEventListener('mousemove', e => {
  const { x, y } = iconEventToCanvasXY(e);
  iconLastMouseXY = { x, y };
  if (simRunning) return;
  const tool = iconDrawToolSel.value;
  if (iconMakerIsDrawing && ['pen','eraser'].includes(tool)) {
    // continue drawing
    if (tool === 'pen') {
      drawIconPixel(x, y, iconColorPicker.value);
    } else {
      drawIconPixel(x, y, null);
    }
  } else if (iconShapeStart && ['rect','circle'].includes(tool)) {
    // Preview shape: restore base, then draw outline preview
    iconCtx.putImageData(iconShapePreviewData, 0, 0);
    renderIconCanvas(); // draws grid+hover
    iconCtx.save();
    iconCtx.strokeStyle = iconColorPicker.value;
    iconCtx.lineWidth = 1;
    const hollowShape = iconShapeHollowChk.checked;
    const x0 = iconShapeStart.x, y0 = iconShapeStart.y;
    const x1 = x, y1 = y;
    if (tool === 'rect') {
      const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1);
      const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
      iconCtx.strokeRect(xmin + 0.5, ymin + 0.5, (xmax - xmin) + 1 - 1, (ymax - ymin) + 1 - 1);
    } else if (tool === 'circle') {
      const rx = Math.abs(x1 - x0);
      const ry = Math.abs(y1 - y0);
      if (rx > 0 && ry > 0) {
        iconCtx.beginPath();
        iconCtx.ellipse(x0 + 0.5, y0 + 0.5, rx, ry, 0, 0, 2*Math.PI);
        iconCtx.stroke();
      }
    }
    iconCtx.restore();
  } else {
    // simply re-render hover highlight
    renderIconCanvas();
  }
});

iconCanvas.addEventListener('mouseleave', () => {
  iconLastMouseXY = { x: -1, y: -1 };
  renderIconCanvas();
});

iconCanvas.addEventListener('mousedown', e => {
  if (simRunning) return;
  const { x, y } = iconEventToCanvasXY(e);
  const tool = iconDrawToolSel.value;
  if (['pen','eraser'].includes(tool)) {
    pushIconMakerState();
    iconMakerIsDrawing = true;
    if (tool === 'pen') {
      drawIconPixel(x, y, iconColorPicker.value);
    } else {
      drawIconPixel(x, y, null);
    }
  } else if (tool === 'fill') {
    pushIconMakerState();
    iconFloodFill(x, y, iconColorPicker.value);
  } else if (['rect','circle'].includes(tool)) {
    pushIconMakerState();
    iconShapeStart = { x, y };
    // Save base for preview
    iconShapePreviewData = new ImageData(
      new Uint8ClampedArray(iconImageData.data),
      iconImageData.width,
      iconImageData.height
    );
  }
});

window.addEventListener('mouseup', e => {
  if (simRunning) return;
  const tool = iconDrawToolSel.value;
  if (iconMakerIsDrawing) {
    iconMakerIsDrawing = false;
    renderIconCanvas();
  }
  if (iconShapeStart && ['rect','circle'].includes(tool)) {
    // Finalize shape
    const { x: x0, y: y0 } = iconShapeStart;
    const { x: x1, y: y1 } = iconLastMouseXY;
    // Restore base
    iconImageData = new ImageData(
      new Uint8ClampedArray(iconShapePreviewData.data),
      iconShapePreviewData.width,
      iconShapePreviewData.height
    );
    // Draw final shape onto iconImageData
    const hollowShape = iconShapeHollowChk.checked;
    if (tool === 'rect') {
      const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1);
      const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
      for (let yy = ymin; yy <= ymax; yy++) {
        for (let xx = xmin; xx <= xmax; xx++) {
          if (xx >= 0 && yy >= 0 && xx < iconCanvas.width && yy < iconCanvas.height) {
            if (hollowShape) {
              if (yy === ymin || yy === ymax || xx === xmin || xx === xmax) {
                setIconPixel(iconImageData, xx, yy, iconColorPicker.value);
              }
            } else {
              setIconPixel(iconImageData, xx, yy, iconColorPicker.value);
            }
          }
        }
      }
    } else if (tool === 'circle') {
      const rx = Math.abs(x1 - x0);
      const ry = Math.abs(y1 - y0);
      if (rx > 0 && ry > 0) {
        for (let yy = y0 - ry; yy <= y0 + ry; yy++) {
          for (let xx = x0 - rx; xx <= x0 + rx; xx++) {
            if (xx >= 0 && yy >= 0 && xx < iconCanvas.width && yy < iconCanvas.height) {
              const dx = (xx - x0)/rx;
              const dy = (yy - y0)/ry;
              const dist2 = dx*dx + dy*dy;
              if (!hollowShape) {
                if (dist2 <= 1) {
                  setIconPixel(iconImageData, xx, yy, iconColorPicker.value);
                }
              } else {
                // hollow: near boundary
                if (dist2 >= 0.8 && dist2 <= 1.2) {
                  setIconPixel(iconImageData, xx, yy, iconColorPicker.value);
                }
              }
            }
          }
        }
      }
    }
    // After modifying iconImageData, render
    renderIconCanvas();
    // Clear shape state
    iconShapeStart = null;
    iconShapePreviewData = null;
  }
});

// Helper to set a pixel in iconImageData, or clear if color is null
function setIconPixel(imageData, x, y, color) {
  const idx = (y * imageData.width + x) * 4;
  if (color) {
    // parse hex to RGBA
    const rgba = hexToRgba(color);
    imageData.data[idx]   = rgba[0];
    imageData.data[idx+1] = rgba[1];
    imageData.data[idx+2] = rgba[2];
    imageData.data[idx+3] = rgba[3];
  } else {
    // clear
    imageData.data[idx+3] = 0;
  }
}

// drawIconPixel: modify iconImageData, then render
function drawIconPixel(x, y, color) {
  const penSize = parseInt(iconPenSizeInp.value, 10) || 1;
  const half = Math.floor(penSize/2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const ix = x + dx, iy = y + dy;
      if (ix >= 0 && iy >= 0 && ix < iconCanvas.width && iy < iconCanvas.height) {
        setIconPixel(iconImageData, ix, iy, color);
        if (color) addColorToIconPalette(color);
      }
    }
  }
  renderIconCanvas();
}

function iconFloodFill(x, y, fillColor) {
  const w = iconCanvas.width, h = iconCanvas.height;
  const data = iconImageData.data;
  function getIndex(ix, iy) { return (iy * w + ix) * 4; }
  const idx0 = getIndex(x,y);
  const target = [
    data[idx0], data[idx0+1], data[idx0+2], data[idx0+3]
  ];
  const fc = hexToRgba(fillColor);
  if (colorsMatch(target, fc)) {
    renderIconCanvas();
    return;
  }
  const stack = [[x,y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const i = getIndex(cx,cy);
    const cur = [data[i], data[i+1], data[i+2], data[i+3]];
    if (!colorsMatch(cur, target)) continue;
    data[i] = fc[0]; data[i+1] = fc[1]; data[i+2] = fc[2]; data[i+3] = fc[3];
    if (cx > 0) stack.push([cx-1, cy]);
    if (cx < w-1) stack.push([cx+1, cy]);
    if (cy > 0) stack.push([cx, cy-1]);
    if (cy < h-1) stack.push([cx, cy+1]);
  }
  addColorToIconPalette(fillColor);
  renderIconCanvas();
}
function hexToRgba(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [0,0,0,255];
  const int = parseInt(m[1],16);
  return [(int>>16)&0xFF, (int>>8)&0xFF, int&0xFF, 255];
}
function colorsMatch(a,b) {
  return a[0]===b[0] && a[1]===b[1] && a[2]===b[2] && a[3]===b[3];
}

// Icon Maker undo/redo buttons
iconUndoBtn.addEventListener('click', iconMakerUndo);
iconRedoBtn.addEventListener('click', iconMakerRedo);

// Sync pen size number input and range
iconPenSizeInp.addEventListener('input', () => {
  let v = parseInt(iconPenSizeInp.value,10);
  if (isNaN(v) || v < 1) v = 1;
  if (v > 10) v = 10;
  iconPenSizeInp.value = v;
  iconPenSizeRange.value = v;
});
iconPenSizeRange.addEventListener('input', () => {
  let v = parseInt(iconPenSizeRange.value,10);
  if (isNaN(v) || v < 1) v = 1;
  if (v > 10) v = 10;
  iconPenSizeRange.value = v;
  iconPenSizeInp.value = v;
});

// Open Icon Maker
openIconMakerBtn.addEventListener('click', () => {
  if (simRunning) return;
  showIconMaker();
});
iconMakerClose.addEventListener('click', () => {
  hideIconMaker();
});

function showIconMaker() {
  clearIconCanvas();
  iconMakerUndoStack = [];
  iconMakerRedoStack = [];
  updateIconUndoRedoButtons();
  iconNameInput.value = '';
  refreshIconMakerListUI();
  iconMakerOverlay.style.display = 'flex';
}
function hideIconMaker() {
  iconMakerOverlay.style.display = 'none';
  refreshIconListUI();
}

// Save icon from Maker to palette (localStorage)
iconSaveBtn.addEventListener('click', () => {
  const name = iconNameInput.value.trim();
  if (!name) {
    alert('Enter an icon name');
    return;
  }
  // Render current iconImageData to a temporary canvas to get dataURL
  const tmp = document.createElement('canvas');
  tmp.width = iconCanvas.width;
  tmp.height = iconCanvas.height;
  const tctx = tmp.getContext('2d');
  tctx.putImageData(iconImageData, 0, 0);
  const dataURL = tmp.toDataURL();
  const existing = icons.findIndex(ic => ic.name === name);
  if (existing !== -1) {
    if (!confirm('Icon name exists. Overwrite?')) return;
    icons.splice(existing,1);
  }
  icons.push({ name: name, dataURL: dataURL });
  saveIconsToStorage();
  refreshIconMakerListUI();
  refreshIconListUI();
  selectedIconIndex = icons.findIndex(ic => ic.name === name);
  refreshIconListUI();
  alert('Icon saved to palette.');
});

// Download single icon JSON
iconDownloadBtn.addEventListener('click', () => {
  const name = iconNameInput.value.trim();
  if (!name) {
    alert('Enter an icon name to download');
    return;
  }
  const tmp = document.createElement('canvas');
  tmp.width = iconCanvas.width;
  tmp.height = iconCanvas.height;
  const tctx = tmp.getContext('2d');
  tctx.putImageData(iconImageData, 0, 0);
  const dataURL = tmp.toDataURL();
  const obj = { name: name, dataURL: dataURL };
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Export all icons as JSON array
exportAllIconsBtn.addEventListener('click', () => {
  if (icons.length === 0) {
    alert('No icons to export.');
    return;
  }
  const blob = new Blob([JSON.stringify(icons, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `icons_export.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Maker list: shows saved icons for editing and removal
let selectedInMakerIndex = null;
function refreshIconMakerListUI() {
  iconMakerListDiv.innerHTML = '';
  icons.forEach((icon, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'icon-item';
    wrapper.style.position = 'relative';
    if (idx === selectedInMakerIndex) {
      wrapper.style.outline = '2px solid #4285f4';
    } else {
      wrapper.style.border = '1px solid #888';
    }
    wrapper.style.width = '50px'; wrapper.style.height = '50px';
    // Image
    const img = document.createElement('img');
    img.src = icon.dataURL;
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain';
    wrapper.appendChild(img);
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.innerText = '×';
    removeBtn.title = 'Remove this icon';
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '0'; removeBtn.style.right = '0';
    removeBtn.style.background = 'rgba(200,0,0,0.8)';
    removeBtn.style.color = 'white';
    removeBtn.style.border = 'none';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.lineHeight = '1';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.width = '16px'; removeBtn.style.height = '16px';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete icon "${icon.name}"?`)) {
        icons.splice(idx,1);
        saveIconsToStorage();
        refreshIconMakerListUI();
        refreshIconListUI();
        if (selectedInMakerIndex === idx) {
          selectedInMakerIndex = null;
          iconNameInput.value = '';
          clearIconCanvas();
        }
      }
    });
    wrapper.appendChild(removeBtn);
    // Click to load into maker
    wrapper.addEventListener('click', () => {
      selectedInMakerIndex = idx;
      iconNameInput.value = icon.name;
      loadIconIntoMaker(idx);
      refreshIconMakerListUI();
    });
    iconMakerListDiv.appendChild(wrapper);
  });
}
function loadIconIntoMaker(idx) {
  const icon = icons[idx];
  const img = new Image();
  img.onload = () => {
    // Reset imageData
    iconImageData = iconCtx.createImageData(iconCanvas.width, iconCanvas.height);
    // Draw image into a temp canvas to extract pixel data
    const tmp = document.createElement('canvas');
    tmp.width = iconCanvas.width;
    tmp.height = iconCanvas.height;
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0,0, tmp.width, tmp.height);
    img.width = tmp.width;
    img.height = tmp.height;
    tctx.drawImage(img, 0, 0, tmp.width, tmp.height);
    const data = tctx.getImageData(0,0,tmp.width,tmp.height).data;
    // Copy into iconImageData
    for (let i = 0; i < data.length; i++) {
      iconImageData.data[i] = data[i];
    }
    renderIconCanvas();
    iconMakerUndoStack = [];
    iconMakerRedoStack = [];
    updateIconUndoRedoButtons();
  };
  img.src = icon.dataURL;
}

// Loading icons via input (JSON or images)
iconLoadInput.addEventListener('change', () => {
  const files = Array.from(iconLoadInput.files);
  if (!files.length) return;
  for (const file of files) {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const arr = JSON.parse(e.target.result);
          if (Array.isArray(arr)) {
            arr.forEach(item => {
              if (item.name && item.dataURL) {
                const exists = icons.findIndex(ic => ic.name === item.name);
                if (exists !== -1) {
                  icons.splice(exists,1);
                }
                icons.push({ name: item.name, dataURL: item.dataURL });
              }
            });
            saveIconsToStorage();
            refreshIconListUI();
            refreshIconMakerListUI();
            alert('Loaded icons from JSON.');
          } else if (arr.name && arr.dataURL) {
            const exists = icons.findIndex(ic => ic.name === arr.name);
            if (exists !== -1) icons.splice(exists,1);
            icons.push({ name: arr.name, dataURL: arr.dataURL });
            saveIconsToStorage();
            refreshIconListUI();
            refreshIconMakerListUI();
            alert('Loaded single icon from JSON.');
          } else {
            alert('JSON format invalid: expected array of {name,dataURL} or single object.');
          }
        } catch(err) {
          alert('Error parsing JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith('image/')) {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = e => {
        img.onload = () => {
          const tmp = document.createElement('canvas');
          tmp.width = 50; tmp.height = 50;
          const tctx = tmp.getContext('2d');
          tctx.clearRect(0,0,50,50);
          tctx.drawImage(img, 0, 0, 50, 50);
          const dataURL = tmp.toDataURL();
          let name = file.name.replace(/\.[^/.]+$/, "");
          let uniqueName = name;
          let counter = 1;
          while (icons.find(ic => ic.name === uniqueName)) {
            uniqueName = name + "_" + counter;
            counter++;
          }
          icons.push({ name: uniqueName, dataURL: dataURL });
          saveIconsToStorage();
          refreshIconListUI();
          refreshIconMakerListUI();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
  iconLoadInput.value = "";
});

// -------- Load icons on startup --------
loadIconsFromStorage();

// -------- Main simulation & paint & text & icon placement logic --------

// Noise-based terrain generation
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
let noiseScale = parseFloat(noiseScaleInp.value);
let waterThresh = parseFloat(waterThreshInp.value);
let sandThresh = parseFloat(sandThreshInp.value);
let rockThresh = parseFloat(rockThreshInp.value);

noiseScaleInp.addEventListener('input', e => {
  noiseScale = parseFloat(e.target.value);
  noiseScaleLabel.innerText = noiseScale.toFixed(2);
});
waterThreshInp.addEventListener('input', e => {
  waterThresh = parseFloat(e.target.value);
  waterThreshLabel.innerText = waterThresh.toFixed(2);
});
sandThreshInp.addEventListener('input', e => {
  sandThresh = parseFloat(e.target.value);
  sandThreshLabel.innerText = sandThresh.toFixed(2);
});
rockThreshInp.addEventListener('input', e => {
  rockThresh = parseFloat(e.target.value);
  rockThreshLabel.innerText = rockThresh.toFixed(2);
});

generateTerrainBtn.addEventListener('click', () => {
  if (simRunning) return;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
        mediumGrid[y][x] = 1; // border
      } else {
        const nx = x * noiseScale;
        const ny = y * noiseScale;
        const v = noise(nx, ny);
        let m;
        if (v < waterThresh) m = 2;        // Water
        else if (v < sandThresh) m = 5;    // Coastal Lowland
        else if (v < rockThresh) m = 6;    // Central Plateau
        else m = 4;                        // Rock
        mediumGrid[y][x] = m;
      }
    }
  }
});

// — Mouse & Painting/Origin/Text/Icon placement —

// Prevent any painting/origin changes while simRunning
canvas.addEventListener('mousemove', e => {
  const gm = toGrid(e);
  if (gm) lastMouse = gm;
  if (simRunning) return;

  if (drawTool === 'origin') {
    // Nothing special on move
  } else if (drawTool === 'text') {
    if (typingMode) {
      // caret drawn in draw()
    } else if (selectedTextIndex !== null && textAction) {
      handleTextMouseMove(e);
    }
  } else if (drawTool === 'icon') {
    // If dragging/resizing a placed icon:
    if (selectedPlacementIndex !== null && iconPlacementAction) {
      handleIconPlacementMouseMove(e);
    }
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
  if (drawTool === 'origin') {
    if (!gm) return;
    if (mediumGrid[gm.y][gm.x] !== 1) {
      const exists = origins.some(pt => pt.x === gm.x && pt.y === gm.y);
      if (!exists) {
        pushStateForUndo();
        let defaultMag = parseFloat(magInput.value);
        if (isNaN(defaultMag) || defaultMag < 0) defaultMag = 0;
        origins.push({ x: gm.x, y: gm.y, mag: defaultMag });
        refreshOriginsList();
        updateUIState();
      }
    }
    selectedTextIndex = null;
    typingMode = false;
    editingIndex = null;
    selectedPlacementIndex = null;
  } else if (drawTool === 'text') {
    handleTextMouseDown(e);
    selectedPlacementIndex = null;
  } else if (drawTool === 'icon') {
    // First check if clicking on existing placed icon to select
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const foundIndex = findIconPlacementAt(clickX, clickY);
    if (foundIndex !== null) {
      // Select this placed icon
      selectedPlacementIndex = foundIndex;
      // Determine if click on resize handle
      const ic = iconPlacements[foundIndex];
      const boxX = ic.x, boxY = ic.y, boxW = ic.width, boxH = ic.height;
      const handleSize = 10;
      const hx = boxX + boxW;
      const hy = boxY + boxH;
      if (clickX >= hx - handleSize && clickX <= hx + handleSize &&
          clickY >= hy - handleSize && clickY <= hy + handleSize) {
        iconPlacementAction = 'resize';
        iconPlacementResizeOrig = {
          origWidth: ic.width,
          origHeight: ic.height,
          origX: ic.x,
          origY: ic.y
        };
      } else {
        iconPlacementAction = 'drag';
        iconPlacementDragOffset.dx = clickX - ic.x;
        iconPlacementDragOffset.dy = clickY - ic.y;
      }
      pushStateForUndo();
      // Deselect text
      selectedTextIndex = null;
      typingMode = false;
      editingIndex = null;
    } else {
      // Not clicking existing icon: place new if an icon is selected
      if (gm && selectedIconIndex !== null && icons[selectedIconIndex]) {
        pushStateForUndo();
        const iconDataURL = icons[selectedIconIndex].dataURL;
        const x = (e.clientX - canvas.getBoundingClientRect().left) - 25;
        const y = (e.clientY - canvas.getBoundingClientRect().top) - 25;
        const img = new Image();
        img.src = iconDataURL;
        iconPlacements.push({ dataURL: iconDataURL, img: img, x: x, y: y, width: 50, height: 50 });
        selectedPlacementIndex = iconPlacements.length - 1;
        iconPlacementAction = 'drag';
        iconPlacementDragOffset.dx = (e.clientX - canvas.getBoundingClientRect().left) - x;
        iconPlacementDragOffset.dy = (e.clientY - canvas.getBoundingClientRect().top) - y;
      } else {
        selectedPlacementIndex = null;
      }
      // Deselect text
      selectedTextIndex = null;
      typingMode = false;
      editingIndex = null;
    }
    updateUIState();
  } else if (['pen','eraser','fill','rect','sphere'].includes(drawTool)) {
    if (!gm) return;
    pushStateForUndo();
    if (drawTool === 'pen' || drawTool === 'eraser' || drawTool === 'fill') {
      paintAt(gm.x, gm.y);
    }
    if (drawTool === 'rect' || drawTool === 'sphere') {
      shapeStart = { ...gm };
      preview = null;
    }
    selectedTextIndex = null;
    typingMode = false;
    editingIndex = null;
    selectedPlacementIndex = null;
  }
});
window.addEventListener('mouseup', e => {
  if (simRunning) return;
  if (drawTool === 'text' && textAction) {
    textAction = null;
    textResizeOrig = null;
  }
  if (shapeStart && preview) {
    finalizeShape(preview);
  }
  shapeStart = null;
  preview = null;
  if (drawTool === 'icon' && iconPlacementAction) {
    iconPlacementAction = null;
    iconPlacementResizeOrig = null;
  }
});

// Helper: find index of placed icon under pixel coordinates (clickX, clickY)
function findIconPlacementAt(clickX, clickY) {
  for (let i = iconPlacements.length - 1; i >= 0; i--) {
    const ic = iconPlacements[i];
    if (clickX >= ic.x && clickX <= ic.x + ic.width &&
        clickY >= ic.y && clickY <= ic.y + ic.height) {
      return i;
    }
  }
  return null;
}

// During icon placement drag/resize
function handleIconPlacementMouseMove(e) {
  if (selectedPlacementIndex === null) return;
  const ic = iconPlacements[selectedPlacementIndex];
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  if (iconPlacementAction === 'drag') {
    ic.x = mouseX - iconPlacementDragOffset.dx;
    ic.y = mouseY - iconPlacementDragOffset.dy;
  } else if (iconPlacementAction === 'resize' && iconPlacementResizeOrig) {
    const { origWidth, origHeight, origX, origY } = iconPlacementResizeOrig;
    const dx = mouseX - origX;
    const dy = mouseY - origY;
    // Determine scale: integer multiples of 50
    const factorX = Math.max(1, Math.round(dx / 50));
    const factorY = Math.max(1, Math.round(dy / 50));
    const factor = Math.max(1, Math.min(factorX, factorY));
    const newSize = 50 * factor;
    ic.width = newSize;
    ic.height = newSize;
    ic.x = origX;
    ic.y = origY;
  }
  updateUIState();
}

// toGrid helper
function toGrid(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / cellW);
  const y = Math.floor((e.clientY - r.top) / cellH);
  return (x >= 0 && x < cols && y >= 0 && y < rows) ? { x, y } : null;
}

// PaintAt
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
          mediumGrid[ny][nx] = 0;
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

// finalizeShape for paint tools
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
      const lapP = pDisp[y][x+1] + pDisp[y][x-1] + pDisp[y+1][x] + pDisp[y-1][x]
                 - 4 * pDisp[y][x];
      const lapS = sDisp[y][x+1] + sDisp[y][x-1] + sDisp[y+1][x] + sDisp[y-1][x]
                 - 4 * sDisp[y][x];
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

  // draw placed icons if overlays shown
  if (showOverlays) {
    iconPlacements.forEach((ic, idx) => {
      // Use cached Image object
      const img = ic.img;
      if (img) {
        if (img.complete) {
          ctx.drawImage(img, ic.x, ic.y, ic.width, ic.height);
        } else {
          img.onload = () => {
            ctx.drawImage(img, ic.x, ic.y, ic.width, ic.height);
          };
        }
      }
      // If selectedPlacementIndex, draw bounding box + resize handle
      if (idx === selectedPlacementIndex && drawTool === 'icon') {
        ctx.save();
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.strokeRect(ic.x, ic.y, ic.width, ic.height);
        // resize handle at bottom-right
        const handleSize = 10;
        ctx.fillStyle = 'yellow';
        ctx.fillRect(ic.x + ic.width - handleSize/2, ic.y + ic.height - handleSize/2, handleSize, handleSize);
        ctx.restore();
      }
    });
  }

  // draw text elements on top if overlays shown
  if (showOverlays) {
    textElements.forEach((te, idx) => {
      ctx.save();
      ctx.globalAlpha = te.opacity;
      let fontStr = '';
      if (te.italic) fontStr += 'italic ';
      if (te.bold) fontStr += 'bold ';
      fontStr += `${te.fontSize}px '${te.fontFamily}'`;
      ctx.font = fontStr;
      ctx.fillStyle = te.color;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(te.text, te.x, te.y);
      if (idx === selectedTextIndex && !typingMode && !simRunning) {
        const metrics = ctx.measureText(te.text);
        const textWidth = metrics.width;
        const textHeight = te.fontSize;
        const boxX = te.x;
        const boxY = te.y - textHeight;
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, textWidth, textHeight);
        // resize handle
        const handleSize = 8;
        ctx.fillStyle = 'yellow';
        ctx.fillRect(te.x + textWidth - handleSize/2, te.y - handleSize/2, handleSize, handleSize);
      }
      ctx.restore();
    });
  }

  // If typing new or editing existing text, draw caret etc.
  if (typingMode && showOverlays) {
    ctx.save();
    let style = typingStyle;
    ctx.globalAlpha = style.opacity;
    let fontStr = '';
    if (style.italic) fontStr += 'italic ';
    if (style.bold) fontStr += 'bold ';
    fontStr += `${style.fontSize}px '${style.fontFamily}'`;
    ctx.font = fontStr;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(typingText || " ");
    const textWidth = metrics.width;
    const textHeight = style.fontSize;
    const boxX = typingPos.x;
    const boxY = typingPos.y - textHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(boxX - 2, boxY - 2, textWidth + 4, textHeight + 4);
    ctx.fillStyle = style.color;
    ctx.fillText(typingText, typingPos.x, typingPos.y);
    const now = Date.now();
    if ((now % 1000) < 500) {
      const caretX = typingPos.x + textWidth;
      const caretY1 = typingPos.y - textHeight;
      const caretY2 = typingPos.y;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(caretX, caretY1);
      ctx.lineTo(caretX, caretY2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPreview();
}

function drawPreview() {
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 2;
  if (drawTool === 'pen') {
    const w = penW;
    ctx.strokeRect((lastMouse.x - w) * cellW, (lastMouse.y - w) * cellH,
                   (2*w+1) * cellW, (2*w+1) * cellH);
  } else if (drawTool === 'eraser') {
    const r = eraserW;
    ctx.strokeRect((lastMouse.x - r) * cellW, (lastMouse.y - r) * cellH,
                   (2*r+1) * cellW, (2*r+1) * cellH);
  } else if (drawTool === 'origin') {
    if (lastMouse) {
      ctx.strokeRect(lastMouse.x * cellW, lastMouse.y * cellH,
                     cellW, cellH);
    }
  } else if ((drawTool === 'rect' || drawTool === 'sphere') && preview) {
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

// Animation loop
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

// ===== Terrain generation helper functions =====
// Already set up above via noise-based generation

// ===== Text tool handlers =====
function handleTextMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  if (typingMode) {
    return;
  }
  // See if clicking on existing text:
  let clickedIndex = null;
  for (let i = textElements.length - 1; i >= 0; i--) {
    const te = textElements[i];
    ctx.save();
    let fontStr = '';
    if (te.italic) fontStr += 'italic ';
    if (te.bold) fontStr += 'bold ';
    fontStr += `${te.fontSize}px '${te.fontFamily}'`;
    ctx.font = fontStr;
    const metrics = ctx.measureText(te.text);
    const textWidth = metrics.width;
    const textHeight = te.fontSize;
    ctx.restore();
    const boxX = te.x;
    const boxY = te.y - textHeight;
    if (clickX >= boxX && clickX <= boxX + textWidth && clickY >= boxY && clickY <= boxY + textHeight) {
      clickedIndex = i;
      break;
    }
  }
  if (clickedIndex !== null) {
    selectedTextIndex = clickedIndex;
    editingIndex = null;
    const te = textElements[selectedTextIndex];
    textColorInp.value = te.color;
    fontSelect.value = te.fontFamily;
    textSizeInp.value = Math.round(te.fontSize);
    textOpacityInp.value = te.opacity;
    textBoldChk.checked = te.bold;
    textItalicChk.checked = te.italic;
    // Check resize handle
    ctx.save();
    let fontStr = '';
    if (te.italic) fontStr += 'italic ';
    if (te.bold) fontStr += 'bold ';
    fontStr += `${te.fontSize}px '${te.fontFamily}'`;
    ctx.font = fontStr;
    const metrics = ctx.measureText(te.text);
    const textWidth = metrics.width;
    const textHeight = te.fontSize;
    ctx.restore();
    const handleSize = 10;
    const hx = te.x + textWidth;
    const hy = te.y;
    if (clickX >= hx - handleSize && clickX <= hx + handleSize && clickY >= hy - handleSize && clickY <= hy + handleSize) {
      textAction = 'resize';
      textResizeOrig = {
        origWidth: textWidth,
        origFontSize: te.fontSize,
        origX: te.x,
        origY: te.y
      };
    } else {
      textAction = 'drag';
      textDragOffset.dx = clickX - te.x;
      textDragOffset.dy = clickY - te.y;
    }
    updateUIState();
  } else {
    // Begin typing new text
    selectedTextIndex = null;
    textAction = null;
    pushStateForUndo();
    typingMode = true;
    editingIndex = null;
    typingPos.x = clickX;
    typingPos.y = clickY;
    typingText = "";
    typingStyle = {
      color: textColorInp.value,
      fontFamily: fontSelect.value,
      fontSize: parseInt(textSizeInp.value,10),
      opacity: parseFloat(textOpacityInp.value),
      bold: textBoldChk.checked,
      italic: textItalicChk.checked
    };
    window.addEventListener('keydown', handleTypingKey);
  }
}

function handleTextMouseMove(e) {
  if (selectedTextIndex === null) return;
  const te = textElements[selectedTextIndex];
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  if (textAction === 'drag') {
    te.x = mouseX - textDragOffset.dx;
    te.y = mouseY - textDragOffset.dy;
  } else if (textAction === 'resize' && textResizeOrig) {
    const deltaX = mouseX - (textResizeOrig.origX + textResizeOrig.origWidth);
    let newWidth = textResizeOrig.origWidth + deltaX;
    if (newWidth < 10) newWidth = 10;
    const scale = newWidth / textResizeOrig.origWidth;
    let newFontSize = textResizeOrig.origFontSize * scale;
    if (newFontSize < 8) newFontSize = 8;
    textElements[selectedTextIndex].fontSize = newFontSize;
  }
  updateUIState();
}

function handleTypingKey(evt) {
  if (!typingMode) {
    if (selectedTextIndex !== null && evt.key === 'Enter' && !simRunning) {
      evt.preventDefault();
      pushStateForUndo();
      editingIndex = selectedTextIndex;
      const te = textElements[editingIndex];
      typingMode = true;
      typingPos.x = te.x;
      typingPos.y = te.y;
      typingText = te.text;
      typingStyle = {
        color: te.color,
        fontFamily: te.fontFamily,
        fontSize: te.fontSize,
        opacity: te.opacity,
        bold: te.bold,
        italic: te.italic
      };
      window.addEventListener('keydown', handleTypingKey);
    }
    return;
  }
  evt.preventDefault();
  const key = evt.key;
  if (key === 'Enter') {
    finishTyping(true);
  } else if (key === 'Escape') {
    finishTyping(false);
  } else if (key === 'Backspace') {
    typingText = typingText.slice(0, -1);
  } else if (key.length === 1) {
    typingText += key;
  }
}

function finishTyping(commit) {
  if (commit && typingText.trim() !== "") {
    if (editingIndex !== null) {
      const te = textElements[editingIndex];
      te.text = typingText;
      te.color = typingStyle.color;
      te.fontFamily = typingStyle.fontFamily;
      te.fontSize = typingStyle.fontSize;
      te.opacity = typingStyle.opacity;
      te.bold = typingStyle.bold;
      te.italic = typingStyle.italic;
      selectedTextIndex = editingIndex;
    } else {
      textElements.push({
        text: typingText,
        x: typingPos.x,
        y: typingPos.y,
        color: typingStyle.color,
        fontFamily: typingStyle.fontFamily,
        fontSize: typingStyle.fontSize,
        opacity: typingStyle.opacity,
        bold: typingStyle.bold,
        italic: typingStyle.italic
      });
      selectedTextIndex = textElements.length - 1;
    }
  }
  typingMode = false;
  typingText = "";
  typingStyle = null;
  editingIndex = null;
  window.removeEventListener('keydown', handleTypingKey);
  updateUIState();
}

// Dynamic style updates when a text is selected or during typing:
textColorInp.addEventListener('input', () => {
  if (typingMode) {
    typingStyle.color = textColorInp.value;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].color = textColorInp.value;
  }
});
fontSelect.addEventListener('change', () => {
  if (typingMode) {
    typingStyle.fontFamily = fontSelect.value;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].fontFamily = fontSelect.value;
  }
});
textSizeInp.addEventListener('input', () => {
  const sz = parseInt(textSizeInp.value,10) || 1;
  if (typingMode) {
    typingStyle.fontSize = sz;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].fontSize = sz;
  }
});
textOpacityInp.addEventListener('input', () => {
  const op = parseFloat(textOpacityInp.value);
  if (typingMode) {
    typingStyle.opacity = op;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].opacity = op;
  }
});
textBoldChk.addEventListener('change', () => {
  if (typingMode) {
    typingStyle.bold = textBoldChk.checked;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].bold = textBoldChk.checked;
  }
});
textItalicChk.addEventListener('change', () => {
  if (typingMode) {
    typingStyle.italic = textItalicChk.checked;
  } else if (selectedTextIndex !== null) {
    textElements[selectedTextIndex].italic = textItalicChk.checked;
  }
});

// ===== Simulation control buttons =====
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
finishBtn.addEventListener('click', () => {
  if (simRunning) {
    simRunning = false;
    resetFields();
    updateUIState();
  }
});
reloadBtn.addEventListener('click', () => {
  if (simRunning) {
    location.reload();
  }
});

// ===== Origins list & per-origin magnitude =====
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
clearOriginsBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (origins.length > 0) {
    pushStateForUndo();
    origins = [];
    refreshOriginsList();
    updateUIState();
  }
});
refreshOriginsList();

// ===== Button helpers for selecting tools =====
// Origin button
originBtn.addEventListener('click', () => {
  if (simRunning) return;
  drawTool='origin';
  originBtn.classList.add('active');
  paintButtons.forEach(b => b.classList.remove('active'));
  textControlsDiv.style.display = 'none';
  selectedTextIndex = null;
  typingMode = false;
  selectedPlacementIndex = null;
  iconSectionDiv.style.display = 'none';
  updateUIState();
});
// Paint tool buttons: Pen, Eraser, Rect, Sphere, Fill, Text, Icon
paintButtons.forEach(btnEl => {
  btnEl.addEventListener('click', () => {
    if (simRunning) return;
    const id = btnEl.id; // e.g. 'penBtn' or 'textBtn' or 'iconBtn'
    const tool = id.replace('Btn','');
    drawTool = tool;
    activateButtons(['penBtn','eraserBtn','rectBtn','sphereBtn','fillBtn','textBtn','iconBtn'], id);
    if (tool === 'text') {
      textControlsDiv.style.display = 'block';
      selectedTextIndex = null;
      typingMode = false;
      editingIndex = null;
      iconSectionDiv.style.display = 'none';
    } else if (tool === 'icon') {
      textControlsDiv.style.display = 'none';
      selectedTextIndex = null;
      typingMode = false;
      editingIndex = null;
      selectedPlacementIndex = null;
      iconSectionDiv.style.display = 'block';
    } else {
      textControlsDiv.style.display = 'none';
      selectedTextIndex = null;
      typingMode = false;
      editingIndex = null;
      selectedPlacementIndex = null;
      iconSectionDiv.style.display = 'none';
    }
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

// ===== Undo/Redo main =====
undoBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (undoStack.length === 0) return;
  const gridCopy = mediumGrid.map(row => row.slice());
  const originsCopy = origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  const textCopy = textElements.map(te => ({
    text: te.text,
    x: te.x, y: te.y,
    color: te.color,
    fontFamily: te.fontFamily,
    fontSize: te.fontSize,
    opacity: te.opacity,
    bold: te.bold,
    italic: te.italic
  }));
  const iconPlacementsCopy = iconPlacements.map(ic => ({
    dataURL: ic.dataURL, x: ic.x, y: ic.y, width: ic.width, height: ic.height
  }));
  redoStack.push({ grid: gridCopy, origins: originsCopy, textElements: textCopy, iconPlacements: iconPlacementsCopy });
  const prev = undoStack.pop();
  for (let y = 0; y < rows; y++) {
    mediumGrid[y].set(prev.grid[y]);
  }
  origins = prev.origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  textElements = prev.textElements.map(te => ({
    text: te.text,
    x: te.x, y: te.y,
    color: te.color,
    fontFamily: te.fontFamily,
    fontSize: te.fontSize,
    opacity: te.opacity,
    bold: te.bold,
    italic: te.italic
  }));
  // Reconstruct iconPlacements with cached Image objects
  iconPlacements = prev.iconPlacements.map(ic => {
    const img = new Image();
    img.src = ic.dataURL;
    return { dataURL: ic.dataURL, img: img, x: ic.x, y: ic.y, width: ic.width, height: ic.height };
  });
  selectedTextIndex = null;
  typingMode = false;
  editingIndex = null;
  selectedPlacementIndex = null;
  refreshOriginsList();
  updateUIState();
});
redoBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (redoStack.length === 0) return;
  const gridCopy = mediumGrid.map(row => row.slice());
  const originsCopy = origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  const textCopy = textElements.map(te => ({
    text: te.text,
    x: te.x, y: te.y,
    color: te.color,
    fontFamily: te.fontFamily,
    fontSize: te.fontSize,
    opacity: te.opacity,
    bold: te.bold,
    italic: te.italic
  }));
  const iconPlacementsCopy = iconPlacements.map(ic => ({
    dataURL: ic.dataURL, x: ic.x, y: ic.y, width: ic.width, height: ic.height
  }));
  undoStack.push({ grid: gridCopy, origins: originsCopy, textElements: textCopy, iconPlacements: iconPlacementsCopy });
  const next = redoStack.pop();
  for (let y = 0; y < rows; y++) {
    mediumGrid[y].set(next.grid[y]);
  }
  origins = next.origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag }));
  textElements = next.textElements.map(te => ({
    text: te.text,
    x: te.x, y: te.y,
    color: te.color,
    fontFamily: te.fontFamily,
    fontSize: te.fontSize,
    opacity: te.opacity,
    bold: te.bold,
    italic: te.italic
  }));
  // Reconstruct iconPlacements with cached Image objects
  iconPlacements = next.iconPlacements.map(ic => {
    const img = new Image();
    img.src = ic.dataURL;
    return { dataURL: ic.dataURL, img: img, x: ic.x, y: ic.y, width: ic.width, height: ic.height };
  });
  selectedTextIndex = null;
  typingMode = false;
  editingIndex = null;
  selectedPlacementIndex = null;
  refreshOriginsList();
  updateUIState();
});

// ===== Simulation physics helpers =====
// Already defined above: updatePhysics, etc.

// ===== Toggle Overlays Button =====
toggleOverlayBtn.addEventListener('click', () => {
  showOverlays = !showOverlays;
  updateUIState();
});

// ===== Simulation control =====
// Already above

