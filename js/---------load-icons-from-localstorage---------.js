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

