import { loadLamaModel, inpaintLama, isLamaModelLoaded } from './lama_inference.js';

// Embed mode: intended for iframe usage inside the blog.
// Usage: .../fillin_deeplearning_demo/?embed=1
(() => {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("embed") === "1") {
    document.body.classList.add("embed");
  }
})();

const $ = (id) => document.getElementById(id);

const els = {
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  resetBtn: $("resetBtn"),
  fileInput: $("fileInput"),
  builtinSelect: $("builtinSelect"),

  sizeSel: $("sizeSel"),
  knownPct: $("knownPct"),
  eta: $("eta"),
  T: $("T"),
  itersPerFrame: $("itersPerFrame"),
  noiseEnabled: $("noiseEnabled"),

  knownPctText: $("knownPctText"),
  etaText: $("etaText"),
  TText: $("TText"),
  itersPerFrameText: $("itersPerFrameText"),

  statusText: $("statusText"),
  iterText: $("iterText"),
  energyText: $("energyText"),
  fpsText: $("fpsText"),

  origCanvas: $("origCanvas"),
  maskedCanvas: $("maskedCanvas"),
  estCanvas: $("estCanvas"),
  lamaCanvas: $("lamaCanvas"),
  lamaStatus: $("lamaStatus"),
  specCanvas: $("specCanvas"),
};

const ctx = {
  orig: els.origCanvas.getContext("2d", { willReadFrequently: false }),
  masked: els.maskedCanvas.getContext("2d", { willReadFrequently: false }),
  est: els.estCanvas.getContext("2d", { willReadFrequently: false }),
  lama: els.lamaCanvas.getContext("2d", { willReadFrequently: false }),
  spec: els.specCanvas.getContext("2d", { willReadFrequently: false }),
};

let worker = null;
let running = false;
let lastFrameAt = performance.now();
let fpsEMA = 0;
let currentImageData = null;
let currentMaskKnown = null;
let currentSize = 256;

function setStatus(text) {
  els.statusText.textContent = text;
}

function syncSliderText() {
  els.knownPctText.textContent = els.knownPct.value;
  els.etaText.textContent = els.eta.value;
  els.TText.textContent = Number(els.T.value).toFixed(2);
  els.itersPerFrameText.textContent = els.itersPerFrame.value;
}

syncSliderText();

function makeWorker() {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === "ready") {
      setStatus("ready");
      els.startBtn.disabled = false;
      els.pauseBtn.disabled = true;
      return;
    }

    if (msg.type === "frame") {
      const now = performance.now();
      const dt = Math.max(1e-6, now - lastFrameAt);
      lastFrameAt = now;
      const fps = 1000 / dt;
      fpsEMA = fpsEMA ? (0.9 * fpsEMA + 0.1 * fps) : fps;
      els.fpsText.textContent = fpsEMA.toFixed(1);

      if (typeof msg.iter === "number") els.iterText.textContent = String(msg.iter);
      if (typeof msg.energy === "number") els.energyText.textContent = msg.energy.toFixed(3);

      if (msg.estimateRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.estimateRGBA), msg.size, msg.size);
        ctx.est.putImageData(img, 0, 0);
      }
      if (msg.maskedRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.maskedRGBA), msg.size, msg.size);
        ctx.masked.putImageData(img, 0, 0);
      }
      if (msg.originalRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.originalRGBA), msg.size, msg.size);
        ctx.orig.putImageData(img, 0, 0);
        // Store original image data for LaMa
        currentImageData = new Float32Array(msg.size * msg.size);
        const rgba = new Uint8ClampedArray(msg.originalRGBA);
        for (let i = 0; i < msg.size * msg.size; i++) {
          currentImageData[i] = rgba[i * 4]; // Use R channel (grayscale)
        }
        currentSize = msg.size;
      }
      if (msg.maskKnown) {
        // Store mask directly from worker
        currentMaskKnown = new Uint8Array(msg.maskKnown);
        // Trigger LaMa inference when we have both image and mask
        if (currentImageData && currentMaskKnown && isLamaModelLoaded()) {
          runLamaInference();
        }
      }
      if (msg.spectrum) {
        drawSpectrum(ctx.spec, msg.spectrum, msg.kCurve, msg.size);
      }
      return;
    }

    if (msg.type === "error") {
      console.error(msg.error);
      setStatus("error (see console)");
      return;
    }
  };
}

function getParams() {
  return {
    size: Number(els.sizeSel.value),
    knownPct: Number(els.knownPct.value),
    eta: Number(els.eta.value),
    T: Number(els.T.value),
    itersPerFrame: Number(els.itersPerFrame.value),
    noiseEnabled: Boolean(els.noiseEnabled.checked),
  };
}

function postParams() {
  if (!worker) return;
  worker.postMessage({ type: "params", params: getParams() });
}

function setCanvasSize(n) {
  for (const c of [els.origCanvas, els.maskedCanvas, els.estCanvas, els.lamaCanvas, els.specCanvas]) {
    c.width = n;
    c.height = n;
  }
}

async function loadBuiltin(kind, size) {
  if (kind === "builtin:gradient") {
    const arr = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = (x / (size - 1)) * 255 * 0.7 + (y / (size - 1)) * 255 * 0.3;
        arr[y * size + x] = v;
      }
    }
    return arr;
  }

  // Note: requires serving via http(s), not file://
  const url = "../../einstein.jpg";
  const img = await loadImage(url);
  return imageToGrayscaleSquare(img, size);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function imageToGrayscaleSquare(img, size) {
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });

  // center-crop to square, then scale to size x size
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const s = Math.min(sw, sh);
  const sx = Math.floor((sw - s) / 2);
  const sy = Math.floor((sh - s) / 2);
  tctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

  const { data } = tctx.getImageData(0, 0, size, size);
  const out = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4 + 0];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // standard luminance-ish weighting
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return out;
}

async function runLamaInference() {
  if (!isLamaModelLoaded()) {
    console.log('LaMa model not loaded yet');
    els.lamaStatus.textContent = "Model not loaded";
    return;
  }
  
  if (!currentImageData || !currentMaskKnown) {
    console.log('No image or mask data available');
    els.lamaStatus.textContent = "No image data";
    return;
  }
  
  try {
    console.log('Starting LaMa inference...');
    els.lamaStatus.textContent = "Running LaMa...";
    
    // Add timeout to detect if inference hangs
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Inference timeout after 60 seconds')), 60000);
    });
    
    const inferencePromise = inpaintLama(currentImageData, currentMaskKnown, currentSize);
    const result = await Promise.race([inferencePromise, timeoutPromise]);
    
    console.log('LaMa inference completed, converting to display format...');
    console.log('Result array length:', result.length);
    console.log('Result sample values (first 10):', Array.from(result.slice(0, 10)));
    console.log('Result min/max:', Math.min(...result), Math.max(...result));
    console.log('Canvas size:', els.lamaCanvas.width, els.lamaCanvas.height);
    console.log('Current size:', currentSize);
    
    // Convert to RGBA for display
    const rgba = new Uint8ClampedArray(currentSize * currentSize * 4);
    for (let i = 0; i < currentSize * currentSize; i++) {
      const g = Math.max(0, Math.min(255, result[i]));
      rgba[i * 4 + 0] = g;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = g;
      rgba[i * 4 + 3] = 255;
    }
    
    console.log('RGBA sample values (first 10 pixels):', Array.from(rgba.slice(0, 40)));
    
    const img = new ImageData(rgba, currentSize, currentSize);
    ctx.lama.putImageData(img, 0, 0);
    els.lamaStatus.textContent = "Ready";
    console.log('LaMa result displayed');
  } catch (error) {
    console.error('LaMa inference failed:', error);
    els.lamaStatus.textContent = "Error: " + error.message;
  }
}

async function initWithImage(floatGray) {
  const params = getParams();
  setCanvasSize(params.size);
  if (!worker) makeWorker();
  setStatus("initializing");
  worker.postMessage(
    { type: "init", image: floatGray, params },
    [floatGray.buffer]
  );
  postParams();
}

function start() {
  if (!worker) return;
  running = true;
  setStatus("running");
  els.startBtn.disabled = true;
  els.pauseBtn.disabled = false;
  worker.postMessage({ type: "start" });
}

function pause() {
  if (!worker) return;
  running = false;
  setStatus("paused");
  els.startBtn.disabled = false;
  els.pauseBtn.disabled = true;
  worker.postMessage({ type: "pause" });
}

function reset() {
  if (!worker) return;
  setStatus("resetting");
  worker.postMessage({ type: "reset" });
}

els.startBtn.addEventListener("click", start);
els.pauseBtn.addEventListener("click", pause);
els.resetBtn.addEventListener("click", reset);

els.sizeSel.addEventListener("change", async () => {
  syncSliderText();
  const params = getParams();
  const kind = els.builtinSelect.value;
  const img = await loadBuiltin(kind, params.size);
  await initWithImage(img);
});

for (const el of [els.knownPct, els.eta, els.T, els.itersPerFrame]) {
  el.addEventListener("input", () => {
    syncSliderText();
    postParams();
  });
}

// Changing known-pixel fraction changes the mask; regenerate on release.
els.knownPct.addEventListener("change", () => {
  postParams();
  if (worker) worker.postMessage({ type: "reset" });
  // LaMa will be triggered when new mask data arrives
});

els.noiseEnabled.addEventListener("change", postParams);

els.builtinSelect.addEventListener("change", async () => {
  const params = getParams();
  const img = await loadBuiltin(els.builtinSelect.value, params.size);
  await initWithImage(img);
});

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const params = getParams();
    const arr = imageToGrayscaleSquare(img, params.size);
    await initWithImage(arr);
  } finally {
    URL.revokeObjectURL(url);
    els.fileInput.value = "";
  }
});

function drawSpectrum(ctx2d, spectrum, kCurve, size) {
  // simple log-log plot in canvas coordinates
  const n = spectrum.length;
  const w = size;
  const h = size;
  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "#0a0c12";
  ctx2d.fillRect(0, 0, w, h);

  // axes margins
  const pad = 24;
  const x0 = pad, y0 = h - pad, x1 = w - pad, y1 = pad;
  ctx2d.strokeStyle = "#26314f";
  ctx2d.lineWidth = 1;
  ctx2d.strokeRect(x0, y1, x1 - x0, y0 - y1);

  const eps = 1e-12;
  const xs = new Float32Array(n);
  for (let i = 0; i < n; i++) xs[i] = i + 1;

  const logxMin = Math.log10(1);
  const logxMax = Math.log10(n);

  // y range from both curves
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const yA = Math.log10(Math.max(eps, spectrum[i]));
    const yB = Math.log10(Math.max(eps, kCurve[i]));
    yMin = Math.min(yMin, yA, yB);
    yMax = Math.max(yMax, yA, yB);
  }
  if (!isFinite(yMin) || !isFinite(yMax) || yMax === yMin) {
    yMin = -6; yMax = 2;
  }

  const mapX = (x) => x0 + ((Math.log10(x) - logxMin) / (logxMax - logxMin)) * (x1 - x0);
  const mapY = (yLog10) => y0 - ((yLog10 - yMin) / (yMax - yMin)) * (y0 - y1);

  // k/f^2 (dashed)
  ctx2d.strokeStyle = "#c8ccd8";
  ctx2d.setLineDash([6, 5]);
  ctx2d.beginPath();
  for (let i = 0; i < n; i++) {
    const x = mapX(xs[i]);
    const y = mapY(Math.log10(Math.max(eps, kCurve[i])));
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
  ctx2d.setLineDash([]);

  // spectrum
  ctx2d.strokeStyle = "#7aa2ff";
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  for (let i = 0; i < n; i++) {
    const x = mapX(xs[i]);
    const y = mapY(Math.log10(Math.max(eps, spectrum[i])));
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();

  ctx2d.fillStyle = "#aab0c0";
  ctx2d.font = "12px ui-sans-serif, system-ui";
  ctx2d.fillText("log-log", x0, y1 - 8);
}

// boot with builtin image
(async function boot() {
  els.startBtn.disabled = true;
  els.pauseBtn.disabled = true;
  
  // Load LaMa model in background
  els.lamaStatus.textContent = "Loading LaMa model...";
  loadLamaModel().then(() => {
    els.lamaStatus.textContent = "Model loaded";
    // Run inference if we already have image/mask
    if (currentImageData && currentMaskKnown) {
      runLamaInference();
    }
  }).catch((error) => {
    console.error('Failed to load LaMa model:', error);
    els.lamaStatus.textContent = "Model load failed - see console";
  });
  
  makeWorker();
  setStatus("loading image");
  try {
    const params = getParams();
    const img = await loadBuiltin(els.builtinSelect.value, params.size);
    await initWithImage(img);
  } catch (e) {
    console.error(e);
    setStatus("failed to load builtin image (try Upload)");
  }
})();


