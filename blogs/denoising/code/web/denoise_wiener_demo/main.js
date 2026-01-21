// Embed mode: intended for iframe usage inside the blog.
// Usage: .../denoise_wiener_demo/?embed=1
(() => {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("embed") === "1") {
    document.body.classList.add("embed");
  }
})();

const $ = (id) => document.getElementById(id);

const els = {
  resetBtn: $("resetBtn"),
  fileInput: $("fileInput"),
  builtinSelect: $("builtinSelect"),
  sizeSel: $("sizeSel"),
  sigmaN: $("sigmaN"),
  sigmaNText: $("sigmaNText"),
  noisyTitle: $("noisyTitle"),
  statusText: $("statusText"),

  origCanvas: $("origCanvas"),
  noisyCanvas: $("noisyCanvas"),
  reconCanvas: $("reconCanvas"),
  attenCanvas: $("attenCanvas"),
  specNoisyCanvas: $("specNoisyCanvas"),
  specDenoisedCanvas: $("specDenoisedCanvas"),
};

const ctx = {
  orig: els.origCanvas.getContext("2d", { willReadFrequently: false }),
  noisy: els.noisyCanvas.getContext("2d", { willReadFrequently: false }),
  recon: els.reconCanvas.getContext("2d", { willReadFrequently: false }),
  atten: els.attenCanvas.getContext("2d", { willReadFrequently: false }),
  specNoisy: els.specNoisyCanvas.getContext("2d", { willReadFrequently: false }),
  specDenoised: els.specDenoisedCanvas.getContext("2d", { willReadFrequently: false }),
};

let worker = null;
let kCurve = null; // Float32Array
let f1 = null; // Float32Array
let attX = null; // Float32Array
let specScaleNoisy = null; // { yMin, yMax } in log10 space
let specScaleDenoised = null; // { yMin, yMax } in log10 space
const PLOT_DPR = Math.min(2, window.devicePixelRatio || 1);

function setStatus(text) {
  els.statusText.textContent = text;
}

function syncText() {
  els.sigmaNText.textContent = els.sigmaN.value;
}

syncText();

function makeWorker() {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === "ready") {
      setStatus("ready");

      if (msg.originalRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.originalRGBA), msg.size, msg.size);
        ctx.orig.putImageData(img, 0, 0);
      }
      if (msg.kCurve) kCurve = new Float32Array(msg.kCurve);
      if (msg.f1) f1 = new Float32Array(msg.f1);
      if (msg.attX) attX = new Float32Array(msg.attX);
      return;
    }

    if (msg.type === "frame") {
      const n = msg.size;
      const sigmaN = msg.sigmaN;
      if (typeof sigmaN === "number") {
        els.noisyTitle.textContent = `noisy (sigma_n=${sigmaN.toFixed(2)})`;
      }

      if (msg.noisyRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.noisyRGBA), n, n);
        ctx.noisy.putImageData(img, 0, 0);
      }
      if (msg.reconRGBA) {
        const img = new ImageData(new Uint8ClampedArray(msg.reconRGBA), n, n);
        ctx.recon.putImageData(img, 0, 0);
      }

      if (msg.attY && attX) {
        drawAttenuation(ctx.atten, els.attenCanvas, attX, new Float32Array(msg.attY), n);
      }
      if (msg.specNoisy && f1 && kCurve) {
        const P = new Float32Array(msg.specNoisy);
        if (!specScaleNoisy) specScaleNoisy = computeSpectrumScale(P, kCurve);
        drawSpectrum(ctx.specNoisy, els.specNoisyCanvas, f1, P, kCurve, n, specScaleNoisy);
      }
      if (msg.specDenoised && f1 && kCurve) {
        const P = new Float32Array(msg.specDenoised);
        if (!specScaleDenoised) specScaleDenoised = computeSpectrumScale(P, kCurve);
        drawSpectrum(ctx.specDenoised, els.specDenoisedCanvas, f1, P, kCurve, n, specScaleDenoised);
      }
      return;
    }

    if (msg.type === "error") {
      console.error(msg.error);
      setStatus("error (see console)");
    }
  };
}

function getParams() {
  return {
    size: Number(els.sizeSel.value),
    sigmaN: Number(els.sigmaN.value),
  };
}

function postParams() {
  if (!worker) return;
  worker.postMessage({ type: "params", params: { sigmaN: Number(els.sigmaN.value) } });
}

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
  for (const c of [els.origCanvas, els.noisyCanvas, els.reconCanvas, els.attenCanvas, els.specNoisyCanvas, els.specDenoisedCanvas]) {
    applyCanvasDisplaySize(c, n);
  }
}

function setCanvasSize(n) {
  // Image canvases: 1× backing store (pixelated scaling is fine here).
  for (const c of [els.origCanvas, els.noisyCanvas, els.reconCanvas]) {
    c.width = n;
    c.height = n;
  }
  // Plot canvases: HiDPI backing store so tick labels aren't jaggy.
  for (const c of [els.attenCanvas, els.specNoisyCanvas, els.specDenoisedCanvas]) {
    c.width = Math.round(n * PLOT_DPR);
    c.height = Math.round(n * PLOT_DPR);
  }
  // Apply display sizing to match buildim_demo behavior
  applyAllCanvasDisplaySizes(n);
}

function beginPlot(ctx2d, canvas, size) {
  // Clear in physical pixels, then draw in logical size×size coords.
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.setTransform(PLOT_DPR, 0, 0, PLOT_DPR, 0, 0);
}

async function loadBuiltin(kind, size) {
  if (kind === "builtin:gradient") {
    const arr = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Normalize to 0-1 range (matching Python code)
        const v = (x / (size - 1)) * 0.7 + (y / (size - 1)) * 0.3;
        arr[y * size + x] = v;
      }
    }
    return arr;
  }

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
    // Normalize to 0-1 range (matching Python code: im0 = im0 / 255.0)
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
  }
  return out;
}

async function initWithImage(floatGray) {
  const p = getParams();
  setCanvasSize(p.size);
  if (!worker) makeWorker();
  setStatus("initializing");
  kCurve = null;
  f1 = null;
  attX = null;
  specScaleNoisy = null;
  specScaleDenoised = null;
  worker.postMessage({ type: "init", image: floatGray, params: p }, [floatGray.buffer]);
}

// ---- plotting helpers ----
function drawAttenuation(ctx2d, canvas, xLog, y, size) {
  beginPlot(ctx2d, canvas, size);
  const w = size, h = size;
  ctx2d.fillStyle = "#0a0c12";
  ctx2d.fillRect(0, 0, w, h);

  // extra room for axis labels (to match the Python plot)
  const padL = 44, padR = 12, padT = 16, padB = 30;
  const x0 = padL, y0 = h - padB, x1 = w - padR, y1 = padT;
  ctx2d.strokeStyle = "#26314f";
  ctx2d.strokeRect(x0, y1, x1 - x0, y0 - y1);

  // add small x padding so curves don't touch borders
  const logMin = Math.log10(xLog[0]) - 0.04;
  const logMax = Math.log10(xLog[xLog.length - 1]) + 0.04;
  const mapX = (x) => x0 + ((Math.log10(x) - logMin) / (logMax - logMin)) * (x1 - x0);
  const mapY = (v) => y0 - (v / 1.0) * (y0 - y1);

  // y ticks (linear, 0..1)
  ctx2d.fillStyle = "#aab0c0";
  ctx2d.font = "11px ui-sans-serif, system-ui";
  ctx2d.textAlign = "right";
  ctx2d.textBaseline = "middle";
  for (let t = 0; t <= 5; t++) {
    const v = t / 5;
    const yy = mapY(v);
    ctx2d.beginPath();
    ctx2d.moveTo(x0 - 4, yy);
    ctx2d.lineTo(x0, yy);
    ctx2d.stroke();
    ctx2d.fillText(v.toFixed(1), x0 - 6, yy);
  }

  // x ticks (log decades)
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "top";
  const maxDec = Math.floor(Math.log10(xLog[xLog.length - 1]));
  for (let e = 0; e <= maxDec; e++) {
    const v = Math.pow(10, e);
    if (v < xLog[0] || v > xLog[xLog.length - 1]) continue;
    const xx = mapX(v);
    ctx2d.beginPath();
    ctx2d.moveTo(xx, y0);
    ctx2d.lineTo(xx, y0 + 4);
    ctx2d.stroke();
    ctx2d.fillText(`10^${e}`, xx, y0 + 6);
  }

  ctx2d.strokeStyle = "#7aa2ff";
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  for (let i = 0; i < xLog.length; i++) {
    const xx = mapX(xLog[i]);
    const yy = mapY(Math.max(0, Math.min(1, y[i])));
    if (i === 0) ctx2d.moveTo(xx, yy);
    else ctx2d.lineTo(xx, yy);
  }
  ctx2d.stroke();

  // axis labels
  ctx2d.fillStyle = "#aab0c0";
  ctx2d.font = "12px ui-sans-serif, system-ui";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "bottom";
  ctx2d.fillText("Frequency", (x0 + x1) / 2, h - 2);
  ctx2d.save();
  // Put the label left of the tick labels to avoid overlap
  ctx2d.translate(x0 - 34, (y0 + y1) / 2);
  ctx2d.rotate(-Math.PI / 2);
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillText("Attenuation", 0, 0);
  ctx2d.restore();
}

function computeSpectrumScale(spectrum, kCurve) {
  // Freeze y-axis like Matplotlib: we compute limits once (first frame) and then reuse them.
  const eps = 1e-12;
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < spectrum.length; i++) {
    const yA = Math.log10(Math.max(eps, spectrum[i]));
    const yB = Math.log10(Math.max(eps, kCurve[i]));
    yMin = Math.min(yMin, yA, yB);
    yMax = Math.max(yMax, yA, yB);
  }
  if (!isFinite(yMin) || !isFinite(yMax) || yMax === yMin) {
    yMin = -6; yMax = 2;
  }
  // add cushion + extra headroom so high sigma doesn't clip the blue curve
  const pad = 0.08 * (yMax - yMin);
  return { yMin: yMin - pad - 2.5, yMax: yMax + pad + 1.5 };
}

function drawSpectrum(ctx2d, canvas, f1, spectrum, kCurve, size, scale) {
  beginPlot(ctx2d, canvas, size);
  const n = spectrum.length;
  const w = size, h = size;
  ctx2d.fillStyle = "#0a0c12";
  ctx2d.fillRect(0, 0, w, h);

  const padL = 34, padR = 12, padT = 16, padB = 24;
  const x0 = padL, y0 = h - padB, x1 = w - padR, y1 = padT;
  ctx2d.strokeStyle = "#26314f";
  ctx2d.strokeRect(x0, y1, x1 - x0, y0 - y1);

  const eps = 1e-12;
  // Add x padding so curves don't touch borders
  const logxMin = Math.log10(1) - 0.04;
  const logxMax = Math.log10(n) + 0.04;

  const yMin = scale?.yMin ?? -6;
  const yMax = scale?.yMax ?? 2;

  const mapX = (x) => x0 + ((Math.log10(x) - logxMin) / (logxMax - logxMin)) * (x1 - x0);
  const mapY = (yLog10) => y0 - ((yLog10 - yMin) / (yMax - yMin)) * (y0 - y1);

  // ticks: x decades
  ctx2d.fillStyle = "#aab0c0";
  ctx2d.font = "11px ui-sans-serif, system-ui";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "top";
  const maxDec = Math.floor(Math.log10(n));
  for (let e = 0; e <= maxDec; e++) {
    const v = Math.pow(10, e);
    const xx = mapX(v);
    ctx2d.beginPath();
    ctx2d.moveTo(xx, y0);
    ctx2d.lineTo(xx, y0 + 4);
    ctx2d.stroke();
    ctx2d.fillText(`10^${e}`, xx, y0 + 6);
  }

  // ticks: y decades within range
  ctx2d.textAlign = "right";
  ctx2d.textBaseline = "middle";
  const yEmin = Math.ceil(yMin);
  const yEmax = Math.floor(yMax);
  for (let e = yEmin; e <= yEmax; e++) {
    const yy = mapY(e);
    ctx2d.beginPath();
    ctx2d.moveTo(x0 - 4, yy);
    ctx2d.lineTo(x0, yy);
    ctx2d.stroke();
    ctx2d.fillText(`10^${e}`, x0 - 6, yy);
  }

  // k/f^2 (dashed)
  ctx2d.strokeStyle = "#c8ccd8";
  ctx2d.setLineDash([6, 5]);
  ctx2d.beginPath();
  for (let i = 0; i < n; i++) {
    const x = mapX(f1[i]);
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
    const x = mapX(f1[i]);
    const y = mapY(Math.log10(Math.max(eps, spectrum[i])));
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
}

// ---- events ----
els.sigmaN.addEventListener("input", () => {
  syncText();
  postParams();
});

els.resetBtn.addEventListener("click", () => {
  if (!worker) return;
  setStatus("resetting");
  worker.postMessage({ type: "reset" });
});

els.sizeSel.addEventListener("change", async () => {
  syncText();
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

// boot
(async function boot() {
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
  const p = getParams();
  if (Number.isFinite(p.size) && p.size > 0) applyAllCanvasDisplaySizes(p.size);
});


