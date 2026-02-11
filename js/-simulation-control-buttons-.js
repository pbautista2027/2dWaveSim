startBtn.addEventListener('click', () => {
  if (origins.length > 0 && !simRunning) {
    resetFields();
    injectAllOrigins();
    simRunning = true;
    updateUIState();
  }
});
replayBtn.addEventListener('click', () => {
  if (origins.length > 0 && simRunning) {
    resetFields();
    injectAllOrigins();
    updateUIState();
  }
});
finishBtn.addEventListener('click', () => {
  if (simRunning) {
    simRunning = false;
    resetFields();
    updateUIState();
  }
});
reloadBtn.addEventListener('click', () => {
  if (simRunning) {
    location.reload();
  }
});

