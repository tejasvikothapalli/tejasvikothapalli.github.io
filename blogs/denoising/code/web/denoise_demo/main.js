// Embed mode: intended for iframe usage inside the blog.
// Usage: .../denoise_demo/?embed=1
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
  snr: $("snr"),
  eta: $("eta"),
  T: $("T"),
  itersPerFrame: $("itersPerFrame"),
  noiseEnabled: $("noiseEnabled"),

  snrText: $("snrText"),
  etaText: $("etaText"),
  TText: $("TText"),
  itersPerFrameText: $("itersPerFrameText"),

  statusText: $("statusText"),
  iterText: $("iterText"),
  energyText: $("energyText"),
  fpsText: $("fpsText"),

  origCanvas: $("origCanvas"),
  noisyCanvas: $("noisyCanvas"),
  estCanvas: $("estCanvas"),
  specCanvas: $("specCanvas"),
};

const ctx = {
  orig: els.origCanvas.getContext("2d", { willReadFrequently: false }),
  noisy: els.noisyCanvas.getContext("2d", { willReadFrequently: false }),
  est: els.estCanvas.getContext("2d", { willReadFrequently: false }),
  spec: els.specCanvas.getContext("2d", { willReadFrequently: false }),
};

let worker = null;
let running = false;
let lastFrameAt = performance.now();
let fpsEMA = 0;
let kCurve = null; // Float32Array

function setStatus(text) {
  els.statusText.textContent = text;
}

function syncSliderText() {
  els.snrText.textContent = Number(els.snr.value).toFixed(2);
  els.etaText.textContent = Number(els.eta.value).toFixed(3);
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

      if (msg.kCurve) kCurve = new Float32Array(msg.kCurve);
      if (msg.originalRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.originalRGBA), msg.size, msg.size);
        ctx.orig.putImageData(img, 0, 0);
      }
      if (msg.noisyRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.noisyRGBA), msg.size, msg.size);
        ctx.noisy.putImageData(img, 0, 0);
      }
      return;
    }

    if (msg.type === "noisy") {
      if (msg.noisyRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.noisyRGBA), msg.size, msg.size);
        ctx.noisy.putImageData(img, 0, 0);
      }
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
      if (msg.spectrum) {
        const curve = msg.kCurve ? new Float32Array(msg.kCurve) : kCurve;
        if (curve) drawSpectrum(ctx.spec, msg.spectrum, curve, msg.size);
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
    SNR: Number(els.snr.value),
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

function measureInnerWidth(el) {
  const st = getComputedStyle(el);
  const pad = (parseFloat(st.paddingLeft) || 0) + (parseFloat(st.paddingRight) || 0);
  return Math.max(0, el.clientWidth - pad);
}

function applyCanvasDisplaySize(canvas, n) {
  // Keep all canvases visually consistent. Prefer integer scaling (reduces moire),
  // but fall back to fit if the viewport is too small.
  const panel = canvas.closest(".panel");
  const avail = panel ? measureInnerWidth(panel) : canvas.parentElement?.clientWidth || 0;
  const w = Math.max(1, Math.floor(avail));
  const scale = Math.max(1, Math.floor(w / n));
  const target = Math.min(w, scale * n);
  canvas.style.width = `${target}px`;
  canvas.style.height = `${target}px`;
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
}

function applyAllCanvasDisplaySizes(n) {
  for (const c of [els.origCanvas, els.noisyCanvas, els.estCanvas, els.specCanvas]) {
    applyCanvasDisplaySize(c, n);
  }
}

function setCanvasSize(n) {
  for (const c of [els.origCanvas, els.noisyCanvas, els.estCanvas, els.specCanvas]) {
    c.width = n;
    c.height = n;
  }
  applyAllCanvasDisplaySizes(n);
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
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function imageToGrayscaleSquare(img, size) {
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });

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
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return out;
}

async function initWithImage(floatGray) {
  const params = getParams();
  setCanvasSize(params.size);
  if (!worker) makeWorker();
  setStatus("initializing");

  fpsEMA = 0;
  els.fpsText.textContent = "0";
  els.iterText.textContent = "0";
  els.energyText.textContent = "0";

  worker.postMessage({ type: "init", image: floatGray, params }, [floatGray.buffer]);
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
  running = false;
  setStatus("resetting");
  els.startBtn.disabled = false;
  els.pauseBtn.disabled = true;
  worker.postMessage({ type: "reset" });
}

els.startBtn.addEventListener("click", start);
els.pauseBtn.addEventListener("click", pause);
els.resetBtn.addEventListener("click", reset);

els.sizeSel.addEventListener("change", async () => {
  syncSliderText();
  const params = getParams();
  const img = await loadBuiltin(els.builtinSelect.value, params.size);
  await initWithImage(img);
});

for (const el of [els.snr, els.eta, els.T, els.itersPerFrame]) {
  el.addEventListener("input", () => {
    syncSliderText();
    postParams();
  });
}

// Changing SNR changes the noise realization; regenerate on release.
els.snr.addEventListener("change", () => {
  postParams();
  if (worker) worker.postMessage({ type: "reset" });
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
  const n = spectrum.length;
  const w = size;
  const h = size;
  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "#0a0c12";
  ctx2d.fillRect(0, 0, w, h);

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

// boot
(async function boot() {
  els.startBtn.disabled = true;
  els.pauseBtn.disabled = true;
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

window.addEventListener("resize", () => {
  const params = getParams();
  if (Number.isFinite(params.size) && params.size > 0) applyAllCanvasDisplaySizes(params.size);
});


