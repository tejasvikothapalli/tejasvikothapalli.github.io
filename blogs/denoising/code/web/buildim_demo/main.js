const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", () => {
  // Embed mode: intended for iframe usage inside the blog.
  // Usage: .../buildim_demo/?embed=1
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("embed") === "1") {
    document.body.classList.add("embed");
  }

const BUILDIM_DEMO_VERSION = "2025-12-29-2";
const els = {
  startBtn: $("startBtn"),
  pauseBtn: $("pauseBtn"),
  resetBtn: $("resetBtn"),
  fileInput: $("fileInput"),
  builtinSelect: $("builtinSelect"),

  sizeSel: $("sizeSel"),
  kSlider: $("kSlider"),

  kSliderText: $("kSliderText"),
  compTitle: $("compTitle"),

  statusText: $("statusText"),
  fpsText: $("fpsText"),

  origCanvas: $("origCanvas"),
  reconCanvas: $("reconCanvas"),
  compCanvas: $("compCanvas"),
  fullCanvas: $("fullCanvas"),
  plotCanvas: $("plotCanvas"),
};

// Be defensive in case the browser is serving a stale HTML file or the IDs change.
// With the coeffs/frame slider removed, there should be exactly one range input.
if (!els.kSlider) {
  els.kSlider = document.querySelector('input[type="range"]');
}
if (!els.kSliderText && els.kSlider) {
  els.kSliderText = els.kSlider.closest(".slider")?.querySelector("span") || null;
}

if (!els.kSlider || !els.kSliderText) {
  throw new Error("buildim_demo: missing required slider elements (#kSlider / #kSliderText). Hard refresh the page.");
}

const ctx = {
  orig: els.origCanvas.getContext("2d", { willReadFrequently: false }),
  recon: els.reconCanvas.getContext("2d", { willReadFrequently: false }),
  comp: els.compCanvas.getContext("2d", { willReadFrequently: false }),
  full: els.fullCanvas.getContext("2d", { willReadFrequently: false }),
  plot: els.plotCanvas.getContext("2d", { willReadFrequently: false }),
};

let worker = null;
let running = false;
let lastFrameAt = performance.now();
let fpsEMA = 0;
let kMax = 0;
let dragWasRunning = false;
let resumeAfterSetK = false;
let resumeTargetK = null;

let plotData = {
  kCurve: null, // Float32Array
  rAll: null, // Float32Array
  ampAll: null, // Float32Array
};

function setStatus(text) {
  els.statusText.textContent = text;
}

function syncSliderText() {
  els.kSliderText.textContent = els.kSlider.value;
}

syncSliderText();

function measureInnerWidth(el) {
  const st = getComputedStyle(el);
  const pad = (parseFloat(st.paddingLeft) || 0) + (parseFloat(st.paddingRight) || 0);
  return Math.max(0, el.clientWidth - pad);
}

function applyCanvasDisplaySize(canvas, n) {
  // Keep all canvases visually consistent. Prefer integer scaling (reduces moiré),
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
  for (const c of [els.origCanvas, els.reconCanvas, els.compCanvas, els.fullCanvas, els.plotCanvas]) {
    applyCanvasDisplaySize(c, n);
  }
}

function makeWorker() {
  if (worker) worker.terminate();
  // Cache-bust the worker URL so reloads always pick up edits on localhost.
  const wurl = new URL("./worker.js", import.meta.url);
  wurl.searchParams.set("v", BUILDIM_DEMO_VERSION);
  worker = new Worker(wurl, { type: "module" });

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === "ready") {
      setStatus("ready");
      els.startBtn.disabled = false;
      els.pauseBtn.disabled = true;

      // One-time payloads
      if (msg.version) {
        console.log(`[buildim_demo] worker version=${msg.version}, frameMs=${msg.frameMs}, step=${msg.step}`);
      }
      if (msg.originalRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.originalRGBA), msg.size, msg.size);
        ctx.orig.putImageData(img, 0, 0);
      }
      plotData.kCurve = msg.kCurve ? new Float32Array(msg.kCurve) : null;
      plotData.rAll = msg.rAll ? new Float32Array(msg.rAll) : null;
      plotData.ampAll = msg.ampAll ? new Float32Array(msg.ampAll) : null;

      els.kSlider.max = String(msg.n2 || 1);
      els.kSlider.value = "0";
      kMax = msg.n2 || 0;
      syncSliderText();
      drawPlot(0);
      if (els.compTitle) els.compTitle.textContent = "i=0, a=0.00";

      // Ensure all canvases are the same displayed size as in buildim.py layout
      applyAllCanvasDisplaySizes(msg.size);
      return;
    }

    if (msg.type === "done") {
      running = false;
      setStatus("done");
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

      if (typeof msg.k === "number") {
        els.kSlider.value = String(msg.k);
        els.kSliderText.textContent = String(msg.k);
        drawPlot(msg.k | 0);

        // Match buildim.py display: subplot(2,3,3) title is i and a
        const i = msg.k | 0;
        const a = typeof msg.a === "number" ? msg.a : 0;
        if (els.compTitle) els.compTitle.textContent = `i=${i}, a=${a.toFixed(2)}`;

        // If user dragged the slider while playing, resume once the requested k is displayed.
        if (resumeAfterSetK && resumeTargetK === i) {
          resumeAfterSetK = false;
          resumeTargetK = null;
          start();
        }
      }

      if (msg.reconRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.reconRGBA), msg.size, msg.size);
        ctx.recon.putImageData(img, 0, 0);
      }
      if (msg.compRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.compRGBA), msg.size, msg.size);
        ctx.comp.putImageData(img, 0, 0);
      }
      if (msg.fullRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.fullRGBA), msg.size, msg.size);
        ctx.full.putImageData(img, 0, 0);
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
  };
}

function postParams() {
  if (!worker) return;
  worker.postMessage({ type: "params", params: getParams() });
}

function setCanvasSize(n) {
  for (const c of [els.origCanvas, els.reconCanvas, els.compCanvas, els.fullCanvas]) {
    c.width = n;
    c.height = n;
  }
  els.plotCanvas.width = n;
  els.plotCanvas.height = n;
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
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return out;
}

async function initWithImage(floatGray) {
  const p = getParams();
  setCanvasSize(p.size);
  if (!worker) makeWorker();
  setStatus("initializing");

  plotData.kCurve = null;
  plotData.rAll = null;
  plotData.ampAll = null;
  fpsEMA = 0;
  els.fpsText.textContent = "0";
  kMax = 0;
  if (els.compTitle) els.compTitle.textContent = "i=0, a=0.00";

  worker.postMessage({ type: "init", image: floatGray, params: p }, [floatGray.buffer]);
  postParams();
}

function start() {
  if (!worker) return;
  running = true;
  setStatus("running");
  lastFrameAt = performance.now();
  fpsEMA = 0;
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
  running = false;
  els.startBtn.disabled = false;
  els.pauseBtn.disabled = true;
  els.kSlider.value = "0";
  els.kSliderText.textContent = "0";
  worker.postMessage({ type: "reset" });
}

function drawPlot(k) {
  const { kCurve, rAll, ampAll } = plotData;
  const c = ctx.plot;
  const w = els.plotCanvas.width;
  const h = els.plotCanvas.height;

  c.clearRect(0, 0, w, h);
  c.fillStyle = "#0a0c12";
  c.fillRect(0, 0, w, h);

  if (!kCurve || !rAll || !ampAll) return;

  const pad = 28;
  const x0 = pad, y0 = h - pad, x1 = w - pad, y1 = pad;
  c.strokeStyle = "#26314f";
  c.lineWidth = 1;
  c.strokeRect(x0, y1, x1 - x0, y0 - y1);

  const eps = 1e-12;
  const n = kCurve.length;
  const logxMin = Math.log10(1);
  const logxMax = Math.log10(n);

  // compute y-range based on curve + a decimated set of points
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = Math.log10(Math.max(eps, kCurve[i]));
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const maxPts = 4000;
  const kk = Math.max(0, Math.min(k | 0, rAll.length));
  const stride = Math.max(1, Math.floor(kk / maxPts));
  for (let i = 0; i < kk; i += stride) {
    const xr = rAll[i];
    if (xr <= 0) continue;
    const y = Math.log10(Math.max(eps, ampAll[i]));
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  if (!isFinite(yMin) || !isFinite(yMax) || yMax === yMin) {
    yMin = -6; yMax = 2;
  }

  const mapX = (x) => x0 + ((Math.log10(Math.max(1, x)) - logxMin) / (logxMax - logxMin)) * (x1 - x0);
  const mapY = (yLog10) => y0 - ((yLog10 - yMin) / (yMax - yMin)) * (y0 - y1);

  // k/f^2 curve (dashed)
  c.strokeStyle = "#c8ccd8";
  c.setLineDash([6, 5]);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = mapX(i + 1);
    const y = mapY(Math.log10(Math.max(eps, kCurve[i])));
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  c.setLineDash([]);

  // points up to k (decimated)
  c.fillStyle = "#7aa2ff";
  for (let i = 0; i < kk; i += stride) {
    const xr = rAll[i];
    if (xr <= 0) continue;
    const x = mapX(xr);
    const y = mapY(Math.log10(Math.max(eps, ampAll[i])));
    c.fillRect(x - 1, y - 1, 2, 2);
  }

  // Axis labels to match buildim.py
  c.fillStyle = "#aab0c0";
  c.font = "12px ui-sans-serif, system-ui";
  c.textAlign = "center";
  c.fillText("frequency", (x0 + x1) / 2, h - 6);
  c.save();
  c.translate(10, (y0 + y1) / 2);
  c.rotate(-Math.PI / 2);
  c.textAlign = "center";
  c.fillText("power (|F|^2)", 0, 0);
  c.restore();
}

// Events
els.startBtn.addEventListener("click", start);
els.pauseBtn.addEventListener("click", pause);
els.resetBtn.addEventListener("click", reset);

els.kSlider.addEventListener("input", () => {
  els.kSliderText.textContent = els.kSlider.value;
});
els.kSlider.addEventListener("pointerdown", () => {
  dragWasRunning = running;
  if (running) pause();
});
els.kSlider.addEventListener("change", () => {
  if (!worker) return;
  const k = Number(els.kSlider.value);
  setStatus("rendering");
  // If we were playing when the drag started, resume after this k is rendered.
  resumeAfterSetK = dragWasRunning;
  resumeTargetK = dragWasRunning ? (k | 0) : null;
  worker.postMessage({ type: "setK", k });
});

els.sizeSel.addEventListener("change", async () => {
  syncSliderText();
  const p = getParams();
  const img = await loadBuiltin(els.builtinSelect.value, p.size);
  await initWithImage(img);
});

els.builtinSelect.addEventListener("change", async () => {
  const p = getParams();
  const img = await loadBuiltin(els.builtinSelect.value, p.size);
  await initWithImage(img);
});

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const p = getParams();
    const arr = imageToGrayscaleSquare(img, p.size);
    await initWithImage(arr);
  } finally {
    URL.revokeObjectURL(url);
    els.fileInput.value = "";
  }
});

// Boot with builtin image
(async function boot() {
  els.startBtn.disabled = true;
  els.pauseBtn.disabled = true;
  makeWorker();
  setStatus("loading image");
  try {
    const p = getParams();
    const img = await loadBuiltin(els.builtinSelect.value, p.size);
    await initWithImage(img);
  } catch (e) {
    console.error(e);
    setStatus("failed to load builtin image (try Upload)");
  }
})();

window.addEventListener("resize", () => {
  const n = Number(els.sizeSel.value);
  if (Number.isFinite(n) && n > 0) applyAllCanvasDisplaySizes(n);
});

});

