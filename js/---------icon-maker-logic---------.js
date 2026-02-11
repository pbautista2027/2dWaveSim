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
    if (tool === 'pen') {
      drawIconPixel(x, y, iconColorPicker.value);
    } else {
      drawIconPixel(x, y, null);
    }
  } else if (iconShapeStart && ['rect','circle'].includes(tool)) {
    iconCtx.putImageData(iconShapePreviewData, 0, 0);
    renderIconCanvas();
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
    const { x: x0, y: y0 } = iconShapeStart;
    const { x: x1, y: y1 } = iconLastMouseXY;
    iconImageData = new ImageData(
      new Uint8ClampedArray(iconShapePreviewData.data),
      iconShapePreviewData.width,
      iconShapePreviewData.height
    );
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
                if (dist2 >= 0.8 && dist2 <= 1.2) {
                  setIconPixel(iconImageData, xx, yy, iconColorPicker.value);
                }
              }
            }
          }
        }
      }
    }
    renderIconCanvas();
    iconShapeStart = null;
    iconShapePreviewData = null;
  }
});

// Helper to set a pixel in iconImageData, or clear if color is null
function setIconPixel(imageData, x, y, color) {
  const idx = (y * imageData.width + x) * 4;
  if (color) {
    const rgba = hexToRgba(color);
    imageData.data[idx]   = rgba[0];
    imageData.data[idx+1] = rgba[1];
    imageData.data[idx+2] = rgba[2];
    imageData.data[idx+3] = rgba[3];
  } else {
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
  // animate exit
  iconMakerModal.style.animation = 'modal-exit 0.2s ease-in forwards';
  setTimeout(() => {
    iconMakerOverlay.style.display = 'none';
    iconMakerModal.style.animation = 'modal-enter 0.3s ease-out forwards';
  }, 200);
  refreshIconListUI();
}

// Save icon from Maker to palette (localStorage)
iconSaveBtn.addEventListener('click', () => {
  const name = iconNameInput.value.trim();
  if (!name) {
    alert('Enter an icon name');
    return;
  }
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
    iconImageData = iconCtx.createImageData(iconCanvas.width, iconCanvas.height);
    const tmp = document.createElement('canvas');
    tmp.width = iconCanvas.width;
    tmp.height = iconCanvas.height;
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0,0, tmp.width, tmp.height);
    img.width = tmp.width;
    img.height = tmp.height;
    tctx.drawImage(img, 0, 0, tmp.width, tmp.height);
    const data = tctx.getImageData(0,0,tmp.width,tmp.height).data;
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

