import { fft2, ifft2 } from "./fft2d.js";

let state = null;
let params = {
  size: 256,
  knownPct: 2,
  eta: 100,
  T: 1,
  itersPerFrame: 5,
  noiseEnabled: true,
};

let running = false;
let loopHandle = null;

function postError(err) {
  const msg = err instanceof Error ? (err.stack || err.message) : String(err);
  postMessage({ type: "error", error: msg });
}

function randnFactory(seed = 12345) {
  // simple seeded RNG (LCG) + Box-Muller for normal
  let s = seed >>> 0;
  const rand = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s >>> 8) / (1 << 24);
  };
  let spare = null;
  const randn = () => {
    if (spare != null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const z0 = mag * Math.cos(2 * Math.PI * v);
    const z1 = mag * Math.sin(2 * Math.PI * v);
    spare = z1;
    return z0;
  };
  return randn;
}

function meanFloat(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

function varFloat(a, mu) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - mu;
    s += d * d;
  }
  return s / a.length;
}

function buildMaskKnown(n, knownPct, randn) {
  // mask of known pixels (1 known, 0 missing)
  const mask = new Uint8Array(n * n);
  const p = Math.max(0, Math.min(1, knownPct / 100));
  // use uniform from randn via CDF-ish isn't great; use Math.random for mask only
  for (let i = 0; i < mask.length; i++) mask[i] = (Math.random() < p) ? 1 : 0;

  // enforce borders missing (0), like fillin.m
  for (let x = 0; x < n; x++) {
    mask[x] = 0;
    mask[(n - 1) * n + x] = 0;
  }
  for (let y = 0; y < n; y++) {
    mask[y * n + 0] = 0;
    mask[y * n + (n - 1)] = 0;
  }
  return mask;
}

function buildLambdaUnshifted(n, im, mu) {
  // frequency coordinates (unshifted indexing, but negative freq mapping)
  // compute k s.t. sum of pixel variances = k * sum of 1/f^2 variances
  const npix = n * n;
  const sigma2_im = varFloat(im, mu);

  const rho2 = new Float32Array(npix);
  const rho2_0 = new Float32Array(npix);
  const half = n >> 1;

  for (let y = 0; y < n; y++) {
    const fy = (y <= half - 1) ? y : (y - n);
    for (let x = 0; x < n; x++) {
      const fx = (x <= half - 1) ? x : (x - n);
      const v = fx * fx + fy * fy;
      const idx = y * n + x;
      rho2[idx] = v;
      rho2_0[idx] = v;
    }
  }

  // avoid divide by zero at DC
  rho2_0[0] = 1e8;

  let sumInv = 0;
  for (let i = 0; i < npix; i++) sumInv += 1.0 / rho2_0[i];

  // note: MATLAB uses sum((im(:)-mu).^2) which is npix*sigma2_im (for population variance),
  // our varFloat uses /npix already, so multiply back
  const k = (sigma2_im * npix) / sumInv;

  const lambda = new Float32Array(npix);
  for (let i = 0; i < npix; i++) lambda[i] = rho2[i] / k;
  return { lambda, k };
}

function rgbaFromImage(im, maskKnown, mu, n, mode) {
  // mode: "original" | "masked" | "estimate"
  // missing pixels shown as blue in masked view
  const out = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    let v = im[i];
    if (mode === "estimate") v = im[i] + mu;
    if (mode === "masked") {
      if (!maskKnown[i]) {
        out[i * 4 + 0] = 0;
        out[i * 4 + 1] = 0;
        out[i * 4 + 2] = 255;
        out[i * 4 + 3] = 255;
        continue;
      }
    }
    const g = Math.max(0, Math.min(255, v));
    out[i * 4 + 0] = g;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = g;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function computeRadialSpectrum(imfRe, imfIm, n) {
  // radial average of |imf|^2 for r=1..n/2
  const half = n >> 1;
  const sums = new Float64Array(half);
  const counts = new Uint32Array(half);

  for (let y = 0; y < n; y++) {
    const fy = (y <= half - 1) ? y : (y - n);
    for (let x = 0; x < n; x++) {
      const fx = (x <= half - 1) ? x : (x - n);
      const r = Math.round(Math.sqrt(fx * fx + fy * fy));
      if (r >= 1 && r <= half) {
        const idx = y * n + x;
        const p = imfRe[idx] * imfRe[idx] + imfIm[idx] * imfIm[idx];
        sums[r - 1] += p;
        counts[r - 1] += 1;
      }
    }
  }

  const P = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    P[i] = counts[i] ? (sums[i] / counts[i]) : 0;
  }
  return P;
}

function init(image, p) {
  params = { ...params, ...p };
  const n = params.size;
  if ((n & (n - 1)) !== 0) throw new Error("size must be power of 2 for FFT");

  const im = new Float32Array(image); // transferred in
  const mu = meanFloat(im);
  const randn = randnFactory(12345);
  const maskKnown = buildMaskKnown(n, params.knownPct, randn);

  // initialize imh: known pixels minus mean, missing pixels random noise
  const imh = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    if (maskKnown[i]) imh[i] = im[i] - mu;
    else imh[i] = (im[i] - mu) * 0 + 40 * randn();
  }

  const { lambda, k } = buildLambdaUnshifted(n, im, mu);

  const npix = n * n;
  const sqrtNpix = Math.sqrt(npix);

  // Fourier buffers
  const imfRe = new Float32Array(npix);
  const imfIm = new Float32Array(npix);
  const tmpRe = new Float32Array(npix);
  const tmpIm = new Float32Array(npix);
  const grad = new Float32Array(npix);

  state = {
    n,
    npix,
    sqrtNpix,
    im,
    mu,
    maskKnown,
    imh,
    lambda,
    k,
    randn,
    iter: 0,
    imfRe,
    imfIm,
    tmpRe,
    tmpIm,
    grad,
    originalRGBA: rgbaFromImage(im, maskKnown, mu, n, "original"),
  };

  // compute initial masked + estimate + spectrum
  computeFrameAndPost(true);
}

function computeImfFromImh() {
  const { n, npix, sqrtNpix, imh, imfRe, imfIm } = state;
  // pack real image into complex arrays
  for (let i = 0; i < npix; i++) {
    imfRe[i] = imh[i];
    imfIm[i] = 0;
  }
  fft2(imfRe, imfIm, n, false);
  // normalize like MATLAB: /sqrt(npix)
  for (let i = 0; i < npix; i++) {
    imfRe[i] /= sqrtNpix;
    imfIm[i] /= sqrtNpix;
  }
}

function computeGradFromImf() {
  const { n, npix, sqrtNpix, lambda, imfRe, imfIm, tmpRe, tmpIm, grad } = state;
  // tmp = lambda .* imf
  for (let i = 0; i < npix; i++) {
    tmpRe[i] = lambda[i] * imfRe[i];
    tmpIm[i] = lambda[i] * imfIm[i];
  }
  ifft2(tmpRe, tmpIm, n); // normalized inverse
  // gradim = real(ifft2(tmp))*sqrt(npix)
  for (let i = 0; i < npix; i++) grad[i] = tmpRe[i] * sqrtNpix;
}

function stepOnce() {
  const { npix, maskKnown, imh, grad, randn } = state;
  const eta = params.eta;
  const T = params.T;
  const sqrt2Teta = Math.sqrt(2 * T * eta);

  // dim = -eta*gradim + sqrt2Teta*randn (optional)
  // NOTE: gradim depends on current imh, so we recompute it every iteration (as in fillin.m).
  computeImfFromImh();
  computeGradFromImf();

  if (params.noiseEnabled && T > 0) {
    for (let i = 0; i < npix; i++) {
      if (!maskKnown[i]) imh[i] = imh[i] + (-eta * grad[i] + sqrt2Teta * randn());
    }
  } else {
    for (let i = 0; i < npix; i++) {
      if (!maskKnown[i]) imh[i] = imh[i] + (-eta * grad[i]);
    }
  }

  state.iter += 1;
}

function computeEnergy() {
  const { npix, lambda, imfRe, imfIm } = state;
  let E = 0;
  for (let i = 0; i < npix; i++) {
    const p = imfRe[i] * imfRe[i] + imfIm[i] * imfIm[i];
    E += lambda[i] * p;
  }
  return E;
}

function computeFrameAndPost(includeOriginal = false) {
  // For display we only need the current Fourier spectrum (grad is computed inside the iteration loop).
  computeImfFromImh();

  const { n, im, mu, maskKnown, imh, imfRe, imfIm, k, iter, originalRGBA } = state;
  const maskedRGBA = rgbaFromImage(im, maskKnown, mu, n, "masked");
  const estimateRGBA = rgbaFromImage(imh, maskKnown, mu, n, "estimate");
  const spectrum = computeRadialSpectrum(imfRe, imfIm, n);

  // k/f^2 curve for display (same length as spectrum)
  const half = n >> 1;
  const kCurve = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const f = i + 1;
    kCurve[i] = k / (f * f);
  }

  const energy = computeEnergy();

  const msg = {
    type: "frame",
    size: n,
    iter,
    energy,
    spectrum,
    kCurve,
    maskedRGBA: maskedRGBA.buffer,
    estimateRGBA: estimateRGBA.buffer,
  };
  const transfer = [maskedRGBA.buffer, estimateRGBA.buffer, spectrum.buffer, kCurve.buffer];
  if (includeOriginal) {
    msg.originalRGBA = originalRGBA.buffer.slice(0);
    transfer.push(msg.originalRGBA);
    // Also send maskKnown for LaMa
    msg.maskKnown = maskKnown.buffer.slice(0);
    transfer.push(msg.maskKnown);
  }
  postMessage(msg, transfer);
}

function startLoop() {
  if (loopHandle) return;
  loopHandle = setInterval(() => {
    if (!running || !state) return;
    try {
      const iters = Math.max(1, params.itersPerFrame | 0);
      for (let i = 0; i < iters; i++) stepOnce();
      computeFrameAndPost(false);
    } catch (e) {
      postError(e);
      running = false;
    }
  }, 0);
}

function stopLoop() {
  if (loopHandle) clearInterval(loopHandle);
  loopHandle = null;
}

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "init") {
      init(msg.image, msg.params || {});
      running = false;
      startLoop();
      postMessage({ type: "ready" });
      return;
    }

    if (msg.type === "params") {
      params = { ...params, ...(msg.params || {}) };
      return;
    }

    if (msg.type === "start") {
      running = true;
      return;
    }

    if (msg.type === "pause") {
      running = false;
      return;
    }

    if (msg.type === "reset") {
      if (!state) return;
      // rebuild mask + re-init imh with same image and current params
      const im = state.im;
      const p = { ...params };
      init(im, p);
      running = false;
      return;
    }
  } catch (e) {
    postError(e);
  }
};


