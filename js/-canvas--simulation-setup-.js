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
// Example mediums; adjust as required (Philippines soil types etc.)
// Ensure all original mediums are back plus added ones.
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
let drawTool = 'origin';
let penW = 0, eraserW = 0, hollow = false; // penW=0 => radius 0 => 1 cell
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

// ---- Seismograph state ----
const seismographs = []; // { id, x, y, label, buffer: [] } -- buffer optional for later
let selectedSeismoIndex = null;
let placingSeismo = false; // toggled by Add Seismograph
let viewingSeismograph = false;

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
const terrainMethodSelect = document.getElementById('terrainMethodSelect');
const noiseControlsDiv = document.getElementById('noiseControls');
const noiseScaleInp   = document.getElementById('noiseScale');
const waterThreshInp  = document.getElementById('waterThresh');
const sandThreshInp   = document.getElementById('sandThresh');
const rockThreshInp   = document.getElementById('rockThresh');
const noiseScaleLabel = document.getElementById('noiseScaleLabel');
const waterThreshLabel= document.getElementById('waterThreshLabel');
const sandThreshLabel = document.getElementById('sandThreshLabel');
const rockThreshLabel = document.getElementById('rockThreshLabel');
const generateTerrainBtn = document.getElementById('generateTerrain');
const bboxMinLatInp = document.getElementById('bboxMinLat');
const bboxMaxLatInp = document.getElementById('bboxMaxLat');
const bboxMinLngInp = document.getElementById('bboxMinLng');
const bboxMaxLngInp = document.getElementById('bboxMaxLng');

// ---- Seismograph UI refs and helpers ----
const addSeismoBtn = document.getElementById('addSeismograph');
const seismoListDiv = document.getElementById('seismographsList');
const viewSeismoBtn = document.getElementById('viewSeismograph');


// Refresh list UI to match style of origins (rows with X). Clicking row selects it.
/*function refreshSeismographListUI() {
  seismoListDiv.innerHTML = '';
  if (seismographs.length === 0) {
    const ph = document.createElement('div');
    ph.style.fontSize = '13px';
    ph.style.color = '#666';
    ph.textContent = 'No seismographs yet';
    seismoListDiv.appendChild(ph);
    selectedSeismoIndex = null;
    return;
  }

  seismographs.forEach((s, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '6px 8px';
    row.style.borderBottom = '1px solid #f2f2f2';
    row.style.cursor = 'pointer';
    row.style.userSelect = 'none';

    // left: label
    const left = document.createElement('div');
    left.textContent = s.label;
    left.style.flex = '1';
    left.addEventListener('click', () => {
      selectedSeismoIndex = idx;
      refreshSeismographListUI();
      // ensure dropdown opens
      const dd = document.getElementById('seismographDropdown'); if (dd) dd.open = true;
    });

    // middle: coords
    const mid = document.createElement('div');
    mid.textContent = `(${s.x},${s.y})`;
    mid.style.margin = '0 8px';
    mid.style.color = '#666';
    mid.style.fontSize = '12px';

    // right: delete X button, similar to origins behavior
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Remove';
    del.style.border = 'none';
    del.style.background = 'transparent';
    del.style.cursor = 'pointer';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation(); // prevent selecting row
      seismographs.splice(idx, 1);
      if (selectedSeismoIndex === idx) selectedSeismoIndex = null;
      else if (selectedSeismoIndex > idx) selectedSeismoIndex--;
      refreshSeismographListUI();
    });

    // highlight selected
    if (idx === selectedSeismoIndex) row.style.background = '#eef6ff';

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(del);
    seismoListDiv.appendChild(row);
  });
}

// Add a seismograph object at grid cell (gx, gy)
function addSeismographAtCell(gx, gy) {
  // avoid duplicates
  if (seismographs.some(s => s.x === gx && s.y === gy)) return null;
  const id = 'seismo_' + Date.now() + '_' + Math.floor(Math.random()*1000);
  const s = { id, x: gx, y: gy, label: `Seismo ${seismographs.length + 1}`, buffer: [] };
  seismographs.push(s);
  selectedSeismoIndex = seismographs.length - 1;
  refreshSeismographListUI();
  return s;
}
*/

// Toggle overlays button
const toggleOverlayBtn = document.getElementById('toggleOverlayBtn');

// Save/Load Terrain buttons (moved here)
const saveTerrainBtn = document.getElementById('saveTerrainBtn');
const loadTerrainBtn = document.getElementById('loadTerrainBtn');

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
  terrainMethodSelect.disabled = simRunning;
  if (!simRunning) {
    if (terrainMethodSelect.value === 'noise') {
      noiseScaleInp.disabled = false;
      waterThreshInp.disabled = false;
      sandThreshInp.disabled = false;
      rockThreshInp.disabled = false;
    } else {
      noiseScaleInp.disabled = true;
      waterThreshInp.disabled = true;
      sandThreshInp.disabled = true;
      rockThreshInp.disabled = true;
      geojsonFileInput.disabled = false;
      bboxMinLatInp.disabled = false;
      bboxMaxLatInp.disabled = false;
      bboxMinLngInp.disabled = false;
      bboxMaxLngInp.disabled = false;
      terrainTutorialBtn.disabled = false;
    }
  }
  generateTerrainBtn.disabled = simRunning;

  // Save/Load Terrain
  saveTerrainBtn.disabled = simRunning;
  loadTerrainBtn.disabled = simRunning;

  // Undo/Redo
  updateUndoRedoButtons();
  // Origins list: disable remove buttons & per-origin mags if running
  originsListDiv.querySelectorAll('.remove-origin').forEach(btn => btn.disabled = simRunning);
  originsListDiv.querySelectorAll('.origin-mag').forEach(inp => inp.disabled = simRunning);
  clearOriginsBtn.disabled = simRunning;
  // initial populate
 // refreshSeismographListUI();


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

