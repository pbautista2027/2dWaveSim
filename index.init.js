window.addEventListener('load', () => {
  try {
    if (typeof resizeCanvas === 'function') resizeCanvas();
    if (typeof populateLegend === 'function') populateLegend();
    if (typeof loadIconsFromStorage === 'function') loadIconsFromStorage();
    if (typeof refreshIconListUI === 'function') refreshIconListUI();
    if (typeof refreshIconMakerListUI === 'function') refreshIconMakerListUI();
    if (typeof updateUIState === 'function') updateUIState();
    if (typeof loop === 'function') {
      requestAnimationFrame(loop);
    }
  } catch (err) {
    console.error('Initializer error:', err);
  }
});
