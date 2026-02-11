// Origin button
originBtn.addEventListener('click', () => {
  if (simRunning) return;
  drawTool='origin';
  originBtn.classList.add('active');
  addSeismoBtn.classList.remove('active')
  viewSeismoBtn.classList.remove('active')
  placingSeismo = false;
  viewingSeismograph = false;
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
    placingSeismo = false;
    viewingSeismograph = false;
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
    originBtn.classList.remove('active');
    addSeismoBtn.classList.remove('active')
    viewSeismoBtn.classList.remove('active')
    updateUIState();
  });
});

// toggle Add Seismograph behaviour (click again to cancel)
addSeismoBtn.addEventListener('click', () => {
  drawTool='show';
  placingSeismo = true;
  viewingSeismograph = false;
  addSeismoBtn.classList.add('active')
  viewSeismoBtn.classList.remove('active')
  originBtn.classList.remove('active');
  paintButtons.forEach(b => b.classList.remove('active'));

  if (placingSeismo) {
    if (typeof activateButtons === 'function') {
      try { activateButtons([], 'none'); } catch (e) {}
    } else {
      // fallback: remove common active classes
      document.querySelectorAll('.active, .on').forEach(el => el.classList.remove('active', 'on'));
    }
  }
});

viewSeismoBtn.addEventListener('click', () => {
  drawTool='show';
  viewingSeismograph = true;
  viewSeismoBtn.classList.add('active')
  addSeismoBtn.classList.remove('active')
  originBtn.classList.remove('active');
  paintButtons.forEach(b => b.classList.remove('active'));
});

// Pen/Eraser/Hollow sliders
document.getElementById('penWidth2').addEventListener('input', e => {
  penW = +e.target.value;
  if (penW < 0) penW = 0;
  document.getElementById('penWidthLabel2').innerText = penW;
});
document.getElementById('eraserSize2').addEventListener('input', e => {
  eraserW = +e.target.value;
  if (eraserW < 0) eraserW = 0;
  document.getElementById('eraserSizeLabel2').innerText = eraserW;
});
document.getElementById('shapeHollow2').addEventListener('change', e => {
  hollow = e.target.checked;
});



