const dropdowns = [
  document.getElementById('ctrlDropdown'),
  document.getElementById('paintDropdown'),
  document.getElementById('terrainDropdown'),
  document.getElementById('seismographDropdown')
];
document.getElementById('toggleAll').onclick = () => {
  const anyOpen = dropdowns.some(d => d.open);
  dropdowns.forEach(d => d.open = !anyOpen);
};
// Default positions for reset:
const windowDefaults = {
  ctrlDropdown: { left: 10, top: 10 },
  paintDropdown: { left: 270, top: 10 },
  terrainDropdown: { left: 530, top: 10 },
  seismographDropdown: { left: 790, top: 10}
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

