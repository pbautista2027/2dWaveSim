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

