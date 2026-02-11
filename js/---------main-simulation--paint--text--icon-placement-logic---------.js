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

// Terrain method select
terrainMethodSelect.addEventListener('change', () => {
  if (terrainMethodSelect.value === 'noise') {
    noiseControlsDiv.style.display = '';
    geojsonControlsDiv.style.display = 'none';
  } else {
    noiseControlsDiv.style.display = 'none';
    geojsonControlsDiv.style.display = '';
  }
  updateUIState();
});
// On load:
if (terrainMethodSelect.value === 'noise') {
  noiseControlsDiv.style.display = '';
} else {
  noiseControlsDiv.style.display = 'none';
}


// Point-in-polygon test (ray-casting)
function pointInPolygon(lat, lng, coords) {
  // coords: array of [lng, lat]
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Generate terrain
generateTerrainBtn.addEventListener('click', () => {
  if (simRunning) return;
  if (terrainMethodSelect.value === 'noise') {
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
    alert('Noise-based terrain generated.');
  }
});

// — Mouse & Painting/Origin/Text/Icon placement —

// Prevent any painting/origin changes while simRunning
canvas.addEventListener('mousemove', e => {
  const gm = toGrid(e);
  if (gm) lastMouse = gm;
  if (simRunning) return;

  if (viewingSeismograph) {
    // check if a seismograph exists in this cell
    for (let i = 0; i < seismographs.length; i++) {
      const s = seismographs[i];
      if (s.x === gm.x && s.y === gm.y) {
        selectedSeismoIndex = i;
        refreshSeismographListUI();
        return; // stop other tools
      }
    }

    // clicked a cell without a seismograph -> deselect
    selectedSeismoIndex = null;
    refreshSeismographListUI();
    return;
  }

  if (drawTool === 'origin') {
    // Nothing special on move
  } else if (drawTool === 'text') {
    if (typingMode) {
      // caret drawn in draw()
    } else if (selectedTextIndex !== null && textAction) {
      handleTextMouseMove(e);
    }
  } else if (drawTool === 'icon') {
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
  // ----- seismograph placement/selection handling (insert right after `const gm = toGrid(e);`) -----
  // ----- Seismograph selection mode -----
  if (placingSeismo) {
    // consume click as placement, then cancel placing mode

    if (!gm) return; // clicked outside grid

    // optional: avoid border cells if you use mediumGrid; keep or remove as needed
    if (typeof mediumGrid !== 'undefined' && mediumGrid[gm.y] && mediumGrid[gm.y][gm.x] === 1) {
      return;
    }

    addSeismographAtCell(gm.x, gm.y);
    return; // IMPORTANT: stop other tools from also acting on this click
  }

  if (viewingSeismograph) {
    if (!gm) return;

    const idx = findSeismographAtCell(gm.x, gm.y);

    if (idx !== -1) {
      selectedSeismographIndex = idx;

      if (window.seismoUI) {
        window.seismoUI.showAtCell(gm.x, gm.y);
      }

    } else {
      // clicked empty grid — deselect
      selectedSeismographIndex = -1;
      if (window.seismoUI) window.seismoUI.hide();
    }

    return;
  }

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
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const foundIndex = findIconPlacementAt(clickX, clickY);
    if (foundIndex !== null) {
      selectedPlacementIndex = foundIndex;
      const ic = iconPlacements[foundIndex];
      const boxX = ic.x, boxY = ic.y, boxW = ic.width, boxH = ic.height;
      const handleSize = 10;
      // For scaling: only allow integer multiples. We'll compute relative to 50px base.
      if (clickX >= boxX + boxW - handleSize && clickX <= boxX + boxW + handleSize &&
          clickY >= boxY + boxH - handleSize && clickY <= boxY + boxH + handleSize) {
        iconPlacementAction = 'resize';
        iconPlacementResizeOrig = {
          origX: ic.x,
          origY: ic.y,
          origWidth: ic.width,
          origHeight: ic.height
        };
      } else {
        iconPlacementAction = 'drag';
        iconPlacementDragOffset.dx = clickX - ic.x;
        iconPlacementDragOffset.dy = clickY - ic.y;
      }
      pushStateForUndo();
      selectedTextIndex = null;
      typingMode = false;
      editingIndex = null;
    } else {
      if (gm && selectedIconIndex !== null && icons[selectedIconIndex]) {
        pushStateForUndo();
        const iconDataURL = icons[selectedIconIndex].dataURL;
        const img = new Image();
        img.src = iconDataURL;
        // Place centered on click
        const placedX = (e.clientX - canvas.getBoundingClientRect().left) - 25;
        const placedY = (e.clientY - canvas.getBoundingClientRect().top) - 25;
        iconPlacements.push({ dataURL: iconDataURL, img: img, x: placedX, y: placedY, width: 50, height: 50 });
        selectedPlacementIndex = iconPlacements.length - 1;
        iconPlacementAction = 'drag';
        iconPlacementDragOffset.dx = (e.clientX - canvas.getBoundingClientRect().left) - placedX;
        iconPlacementDragOffset.dy = (e.clientY - canvas.getBoundingClientRect().top) - placedY;
      } else {
        selectedPlacementIndex = null;
      }
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
    // Compute new size as integer multiple of base 50px
    const { origX, origY } = iconPlacementResizeOrig;
    const deltaX = mouseX - origX;
    const deltaY = mouseY - origY;
    // Determine scale factor: floor(delta / 50 + 0.5)
    const factorX = Math.max(1, Math.round(deltaX / 50));
    const factorY = Math.max(1, Math.round(deltaY / 50));
    // Use smaller factor to keep square
    const factor = Math.max(1, Math.min(factorX, factorY));
    ic.width = 50 * factor;
    ic.height = 50 * factor;
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
  // penW is radius in cells; penW=0 => only center cell
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

  // ---- draw seismograph circles (insert into draw() where overlays are drawn) ----
  seismographs.forEach((s, idx) => {
    const cx = (s.x + 0.5) * cellW;
    const cy = (s.y + 0.5) * cellH;
    // fill the cell as much as possible: radius slightly smaller than half the smaller cell dimension
    const r = Math.min(cellW, cellH) * 0.48;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = (idx === selectedSeismoIndex) ? 'yellow' : 'white';
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  });

  // draw placed icons if overlays shown
  if (showOverlays) {
    iconPlacements.forEach((ic, idx) => {
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
  if (drawTool === 'pen' || drawTool === 'show') {
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

