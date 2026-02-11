
// js/-seismograph-.js
// Seismograph module for sampling pDisp/sDisp and showing a waveform overlay.
// Designed to work with globals already in your project:
//   - seismographs (array of { id, x, y, label, buffer: [] })
//   - pDisp, sDisp (2D arrays of displacements; indexed by [row][col])
//   - simRunning (boolean)
//   - canvas, cellW, cellH (for positioning)
// It creates a small overlay canvas and functions to show/hide the seismograph.
let selectedSeismographIndex = -1;

function findSeismographAtCell(gx, gy) {
  if (!Array.isArray(seismographs)) return -1;
  return seismographs.findIndex(s => s.x === gx && s.y === gy);
}   

(function () {
    // currently selected seismograph index



  // Config
  const SAMPLE_INTERVAL_MS = 20; // sampling interval (20ms => 50Hz). Matches dt-ish; adjust if needed.
  const MAX_SAMPLES = 2000;      // per seismograph buffer max length
  const OVERLAY_WIDTH = 700;
  const OVERLAY_HEIGHT = 200;
  const PADDING = 8;

  // DOM elements
  let overlayDiv = null;
  let overlayCanvas = null;
  let overlayCtx = null;
  let currentSeismo = null; // index in seismographs array
  let samplingTimer = null;

  // Create overlay UI (lazy init)
  function ensureOverlayExists() {
    if (overlayDiv) return;

    // container
    overlayDiv = document.createElement('div');
    overlayDiv.id = 'seismoOverlay';
    Object.assign(overlayDiv.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      width: OVERLAY_WIDTH + 'px',
      height: (OVERLAY_HEIGHT + 60) + 'px',
      background: 'rgba(20,20,20,0.94)',
      color: '#ddd',
      border: '1px solid rgba(255,255,255,0.06)',
      padding: PADDING + 'px',
      zIndex: 20000,
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      borderRadius: '8px',
      display: 'none',
      fontFamily: 'monospace',
      fontSize: '12px'
    });

    // header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '6px';

    const title = document.createElement('div');
    title.id = 'seismoTitle';
    title.innerText = 'Seismograph';
    Object.assign(title.style, { fontWeight: '600' });
    header.appendChild(title);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '6px';
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    Object.assign(closeBtn.style, { cursor: 'pointer', background: 'transparent', color: '#ddd', border: 'none' });
    closeBtn.addEventListener('click', hideSeismograph);
    controls.appendChild(closeBtn);

    header.appendChild(controls);
    overlayDiv.appendChild(header);

    // waveform canvas
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = OVERLAY_WIDTH;
    overlayCanvas.height = OVERLAY_HEIGHT;
    overlayCanvas.style.width = OVERLAY_WIDTH + 'px';
    overlayCanvas.style.height = OVERLAY_HEIGHT + 'px';
    overlayCanvas.style.display = 'block';
    overlayCanvas.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.05))';
    overlayCanvas.style.border = '1px solid rgba(255,255,255,0.03)';
    overlayCanvas.style.borderRadius = '4px';
    overlayCanvas.style.boxSizing = 'border-box';
    overlayDiv.appendChild(overlayCanvas);

    // info row
    const infoRow = document.createElement('div');
    infoRow.id = 'seismoInfo';
    infoRow.style.marginTop = '6px';
    infoRow.innerText = '—';
    overlayDiv.appendChild(infoRow);

    document.body.appendChild(overlayDiv);
    overlayCtx = overlayCanvas.getContext('2d');
  }

  // Start sampling loop
  function startSampling() {
    if (samplingTimer) return;
    samplingTimer = setInterval(() => {
      if (!window.simRunning) return; // only sample while simulation running
      if (!Array.isArray(window.seismographs)) return;

      // sample each seismograph
      window.seismographs.forEach(s => {
        if (!s.buffer) s.buffer = [];
        // protect out-of-range access
        const gx = s.x, gy = s.y;
        let val = 0;
        try {
          if (window.pDisp && window.sDisp) {
            if (window.pDisp[gy] && typeof window.pDisp[gy][gx] !== 'undefined') {
              val = (window.pDisp[gy][gx] || 0) + (window.sDisp[gy] ? (window.sDisp[gy][gx] || 0) : 0);
            }
          }
        } catch (e) {
          val = 0;
        }
        s.buffer = s.buffer || [];
        s.buffer.push(val);
        if (s.buffer.length > MAX_SAMPLES) s.buffer.shift();
      });

      // redraw if currently visible
      if (overlayDiv && overlayDiv.style.display !== 'none' && currentSeismo !== null) {
        drawWaveformFor(currentSeismo);
      }
    }, SAMPLE_INTERVAL_MS);
  }

  function stopSampling() {
    if (samplingTimer) {
      clearInterval(samplingTimer);
      samplingTimer = null;
    }
  }

  // Public: show seismograph overlay for the seismograph at grid cell (gx, gy)
  function showSeismographAtCell(gx, gy) {
    ensureOverlayExists();
    // find seismograph index at given cell
    const idx = (window.seismographs || []).findIndex(s => s.x === gx && s.y === gy);
    if (idx === -1) {
      // not found: optionally create one? For now show message
      overlayDiv.style.display = '';
      overlayDiv.querySelector('#seismoTitle').innerText = 'No seismograph at clicked cell';
      overlayDiv.querySelector('#seismoInfo').innerText = 'Click "Add Seismograph" to place one, or click a placed seismograph.';
      overlayCtx && overlayCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
      currentSeismo = null;
      return;
    }
    currentSeismo = idx;
    overlayDiv.style.display = '';
    overlayDiv.querySelector('#seismoTitle').innerText = window.seismographs[idx].label || `Seismo ${idx+1}`;
    overlayDiv.querySelector('#seismoInfo').innerText = 'Waiting for simulation...' ;
    // start sampling loop (it will only push when simRunning)
    startSampling();
    // draw initial frame
    drawWaveformFor(idx);
  }

  // Draw waveform for index
  function drawWaveformFor(idx) {
    if (!overlayCtx) return;
    const s = window.seismographs[idx];
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!s || !Array.isArray(s.buffer) || s.buffer.length === 0) {
      // nothing to show
      overlayCtx.fillStyle = 'rgba(255,255,255,0.06)';
      overlayCtx.font = '13px monospace';
      overlayCtx.fillText(window.simRunning ? 'No data yet (simulation running).' : 'Simulation not running — waveform available only while running.', 12, 24);
      overlayDiv.querySelector('#seismoInfo').innerText = window.simRunning ? 'Collecting...' : 'Simulation not running';
      return;
    }

    // copy buffer so we don't mutate it
    const buf = s.buffer.slice();
    // compute amplitude scale
    let maxAbs = 0;
    for (let v of buf) if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    if (maxAbs === 0) maxAbs = 1e-6;

    // draw grid lines
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.03)';
    overlayCtx.lineWidth = 1;
    const w = overlayCanvas.width, h = overlayCanvas.height;
    overlayCtx.beginPath();
    overlayCtx.moveTo(0, Math.round(h/2)+0.5);
    overlayCtx.lineTo(w, Math.round(h/2)+0.5);
    overlayCtx.stroke();

    // draw waveform (polyline)
    overlayCtx.beginPath();
    const visibleSamples = Math.min(buf.length, w); // one pixel per sample approx
    const step = buf.length > w ? buf.length / w : 1;
    for (let i = 0; i < visibleSamples; i++) {
      const srcIdx = Math.floor(buf.length - visibleSamples + i);
      const val = buf[Math.max(0, srcIdx)];
      const x = Math.round((i / (visibleSamples - 1 || 1)) * (w-1));
      const y = Math.round(h/2 - (val / maxAbs) * (h/2 - 8));
      if (i === 0) overlayCtx.moveTo(x, y);
      else overlayCtx.lineTo(x, y);
    }
    overlayCtx.strokeStyle = 'rgba(30,200,255,0.95)';
    overlayCtx.lineWidth = 2;
    overlayCtx.stroke();

    // small running value + stats
    const latest = buf[buf.length - 1] || 0;
    overlayDiv.querySelector('#seismoInfo').innerText = `Samples: ${buf.length} · Latest: ${latest.toFixed(4)} · Peak: ${maxAbs.toFixed(4)}${window.simRunning ? '' : ' · (not updating)'} `;
  }

  function hideSeismograph() {
    if (!overlayDiv) return;
    overlayDiv.style.display = 'none';
    currentSeismo = null;
  }

  // Optional: utility to clear buffers if you want to reset between runs
  function clearAllSeismoBuffers() {
    if (!Array.isArray(window.seismographs)) return;
    window.seismographs.forEach(s => s.buffer = []);
  }

  // If simulation stops, overlay remains but will not collect new samples.
  // Expose public functions on window so your existing code can call them easily.
  window.seismoUI = {
    showAtCell: showSeismographAtCell,
    hide: hideSeismograph,
    clearAllBuffers: clearAllSeismoBuffers,
    startSampling,
    stopSampling
  };

  // If the page unloads/changes, stop any timers
  window.addEventListener('beforeunload', () => {
    stopSampling();
  });

})();
