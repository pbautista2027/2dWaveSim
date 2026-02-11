saveTerrainBtn.addEventListener('click', () => {
  // Collect state: mediumGrid, origins, textElements, iconPlacements, icons palette
  const gridArr = mediumGrid.map(row => Array.from(row));
  const data = {
    mediumGrid: gridArr,
    origins: origins.map(pt => ({ x: pt.x, y: pt.y, mag: pt.mag })),
    textElements: textElements.map(te => ({
      text: te.text,
      x: te.x, y: te.y,
      color: te.color,
      fontFamily: te.fontFamily,
      fontSize: te.fontSize,
      opacity: te.opacity,
      bold: te.bold,
      italic: te.italic
    })),
    icons: icons.slice(), // saved palette icons
    iconPlacements: iconPlacements.map(ic => ({
      dataURL: ic.dataURL,
      x: ic.x, y: ic.y,
      width: ic.width, height: ic.height
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = prompt('Enter filename to save terrain (without extension):', 'terrain_save');
  if (filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.json';
    a.click();
  }
  URL.revokeObjectURL(url);
});

loadTerrainBtn.addEventListener('click', () => {
  if (simRunning) {
    alert('Finish simulation before loading.');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const obj = JSON.parse(e.target.result);
        if (!obj.mediumGrid || !Array.isArray(obj.mediumGrid)) {
          alert('Invalid save file.');
          return;
        }
        pushStateForUndo();
        // Restore mediumGrid
        for (let y = 0; y < rows; y++) {
          if (Array.isArray(obj.mediumGrid[y])) {
            for (let x = 0; x < cols; x++) {
              mediumGrid[y][x] = obj.mediumGrid[y][x] ?? 0;
            }
          }
        }
        // Restore origins
        origins = [];
        if (Array.isArray(obj.origins)) {
          obj.origins.forEach(pt => {
            if (typeof pt.x === 'number' && typeof pt.y === 'number' && typeof pt.mag === 'number') {
              origins.push({ x: pt.x, y: pt.y, mag: pt.mag });
            }
          });
        }
        refreshOriginsList();
        // Restore textElements
        textElements = [];
        if (Array.isArray(obj.textElements)) {
          obj.textElements.forEach(te => {
            if (typeof te.text === 'string') {
              textElements.push({
                text: te.text,
                x: te.x, y: te.y,
                color: te.color,
                fontFamily: te.fontFamily,
                fontSize: te.fontSize,
                opacity: te.opacity,
                bold: te.bold,
                italic: te.italic
              });
            }
          });
        }
        // Restore icons palette
        if (Array.isArray(obj.icons)) {
          icons = obj.icons.filter(ic => ic.name && ic.dataURL);
          saveIconsToStorage();
        }
        refreshIconListUI();
        refreshIconMakerListUI();
        // Restore placements
        iconPlacements = [];
        if (Array.isArray(obj.iconPlacements)) {
          obj.iconPlacements.forEach(ic => {
            if (ic.dataURL && typeof ic.x === 'number' && typeof ic.y === 'number' &&
                typeof ic.width === 'number' && typeof ic.height === 'number') {
              const img = new Image();
              img.src = ic.dataURL;
              iconPlacements.push({ dataURL: ic.dataURL, img: img, x: ic.x, y: ic.y, width: ic.width, height: ic.height });
            }
          });
        }
        selectedTextIndex = null;
        typingMode = false;
        editingIndex = null;
        selectedPlacementIndex = null;
        updateUIState();
        alert('Terrain loaded.');
      } catch(err) {
        alert('Error loading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});
