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

