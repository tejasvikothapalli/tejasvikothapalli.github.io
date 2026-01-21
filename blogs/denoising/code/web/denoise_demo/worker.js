import { fft2, ifft2 } from "./fft2d.js";

let state = null;
let params = {
  size: 256,
  SNR: 0.5,
  eta: 0.1,
  T: 1.0,
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
  // seeded RNG (LCG) + Box-Muller
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

function rgbaFromGray(im, n) {
  const out = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const g = Math.max(0, Math.min(255, im[i]));
    out[i * 4 + 0] = g;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = g;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function fftshift2(srcRe, srcIm, dstRe, dstIm, n) {
  const half = n >> 1;
  for (let y = 0; y < n; y++) {
    const yy = (y + half) & (n - 1);
    for (let x = 0; x < n; x++) {
      const xx = (x + half) & (n - 1);
      const srcIdx = y * n + x;
      const dstIdx = yy * n + xx;
      dstRe[dstIdx] = srcRe[srcIdx];
      dstIm[dstIdx] = srcIm[srcIdx];
    }
  }
}

function ifftshift2(srcRe, srcIm, dstRe, dstIm, n) {
  // for even n, ifftshift is the same as fftshift
  fftshift2(srcRe, srcIm, dstRe, dstIm, n);
}

function buildLambdaShifted(im, mu, n) {
  // Matches denoise.py rho2 built from f=-n/2..n/2-1 on shifted grid.
  // k = sum((im-mu)^2)/sum(1/rho2_0), with DC term huge.
  const npix = n * n;
  const half = n >> 1;

  let sumSq = 0;
  for (let i = 0; i < npix; i++) {
    const d = im[i] - mu;
    sumSq += d * d;
  }

  const rho2 = new Float32Array(npix);
  let sumInv = 0;
  for (let y = 0; y < n; y++) {
    const fy = y - half;
    for (let x = 0; x < n; x++) {
      const fx = x - half;
      let v = fx * fx + fy * fy;
      if (x === half && y === half) v = 1e8;
      const idx = y * n + x;
      rho2[idx] = (x === half && y === half) ? 0 : (fx * fx + fy * fy);
      sumInv += 1.0 / v;
    }
  }

  const k = sumSq / sumInv;
  const lambda = new Float32Array(npix);
  for (let i = 0; i < npix; i++) lambda[i] = rho2[i] / k;
  return { lambda, k };
}

function computeRadialSpectrumShifted(imfRe, imfIm, n) {
  // radial average of |imf|^2 for r=1..n/2 on shifted indexing (center is DC)
  const half = n >> 1;
  const sums = new Float64Array(half);
  const counts = new Uint32Array(half);

  for (let y = 0; y < n; y++) {
    const fy = y - half;
    for (let x = 0; x < n; x++) {
      const fx = x - half;
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

function computeEnergy(lambda, imfRe, imfIm) {
  let E = 0;
  for (let i = 0; i < lambda.length; i++) {
    const p = imfRe[i] * imfRe[i] + imfIm[i] * imfIm[i];
    E += lambda[i] * p;
  }
  return E;
}

function rebuildNoisyState() {
  const { n, npix, im, randn } = state;
  const mu = meanFloat(im);
  const sigma2_im = varFloat(im, mu);
  const SNR = Math.max(1e-6, params.SNR);
  const sigma2_noise = sigma2_im / SNR;
  const sigma_noise = Math.sqrt(Math.max(0, sigma2_noise));

  // nim = im - mu + noise
  const nim = state.nim;
  for (let i = 0; i < npix; i++) nim[i] = im[i] - mu + sigma_noise * randn();

  // imf = fftshift(fft2(nim)) / sqrt(npix)
  const imfUnRe = state.imfUnRe;
  const imfUnIm = state.imfUnIm;
  for (let i = 0; i < npix; i++) {
    imfUnRe[i] = nim[i];
    imfUnIm[i] = 0;
  }
  fft2(imfUnRe, imfUnIm, n, false);

  const sqrtNpix = Math.sqrt(npix);
  for (let i = 0; i < npix; i++) {
    imfUnRe[i] /= sqrtNpix;
    imfUnIm[i] /= sqrtNpix;
  }
  fftshift2(imfUnRe, imfUnIm, state.imfRe, state.imfIm, n);

  // nimf = imf copy
  state.nimfRe.set(state.imfRe);
  state.nimfIm.set(state.imfIm);

  state.mu = mu;
  state.sigma2_im = sigma2_im;
  state.sigma2_noise = sigma2_noise;

  const { lambda, k } = buildLambdaShifted(im, mu, n);
  state.lambda = lambda;
  state.k = k;

  const half = n >> 1;
  const kCurve = state.kCurve;
  for (let i = 0; i < half; i++) {
    const f = i + 1;
    kCurve[i] = k / (f * f);
  }

  // cache display images
  state.originalRGBA = rgbaFromGray(im, n);
  const noisyDisp = state.noisyDisp;
  for (let i = 0; i < npix; i++) noisyDisp[i] = mu + nim[i];
  state.noisyRGBA = rgbaFromGray(noisyDisp, n);

  state.iter = 0;
}

function init(image, p) {
  params = { ...params, ...(p || {}) };
  const n = params.size | 0;
  if ((n & (n - 1)) !== 0) throw new Error("size must be power of 2 for FFT");

  const im = new Float32Array(image);
  const npix = n * n;
  if (im.length !== npix) throw new Error("image length mismatch");

  state = {
    n,
    npix,
    im,
    randn: randnFactory(12345),

    mu: 0,
    sigma2_im: 0,
    sigma2_noise: 0,
    lambda: null,
    k: 0,

    // spatial buffers
    nim: new Float32Array(npix),
    noisyDisp: new Float32Array(npix),
    imh: new Float32Array(npix),
    estDisp: new Float32Array(npix),

    // Fourier buffers (shifted)
    imfRe: new Float32Array(npix),
    imfIm: new Float32Array(npix),
    nimfRe: new Float32Array(npix),
    nimfIm: new Float32Array(npix),

    // Fourier unshifted scratch for FFT/IFFT
    imfUnRe: new Float32Array(npix),
    imfUnIm: new Float32Array(npix),

    // k/f^2 curve
    kCurve: new Float32Array(n >> 1),

    iter: 0,

    originalRGBA: null,
    noisyRGBA: null,
  };

  rebuildNoisyState();
}

function stepOnce() {
  const { n, npix, mu, sigma2_noise } = state;
  const lambda = state.lambda;
  if (!lambda) return;

  const eta = params.eta;
  const T = params.T;
  const randn = state.randn;

  // gradimf = -nimf/sigma2_noise + H*imf, where H = 1/sigma2_noise + lambda
  const invSig2 = 1.0 / Math.max(1e-12, sigma2_noise);
  const imfRe = state.imfRe;
  const imfIm = state.imfIm;
  const nimfRe = state.nimfRe;
  const nimfIm = state.nimfIm;

  for (let i = 0; i < npix; i++) {
    const H = invSig2 + lambda[i];

    // grad = -nimf/sig2 + H*imf
    const gradRe = -nimfRe[i] * invSig2 + H * imfRe[i];
    const gradIm = -nimfIm[i] * invSig2 + H * imfIm[i];

    // dimf = -(eta/H)*grad + sqrt(2*T*eta/H) * randn
    const a = -(eta / H);
    let dRe = a * gradRe;
    let dIm = a * gradIm;

    if (params.noiseEnabled && T > 0) {
      const s = Math.sqrt((2 * T * eta) / H);
      dRe += s * randn();
      dIm += s * randn();
    }

    imfRe[i] += dRe;
    imfIm[i] += dIm;
  }

  // reconstruction: imh = real(sqrt(npix) * ifft2(ifftshift(imf)))
  ifftshift2(imfRe, imfIm, state.imfUnRe, state.imfUnIm, n);
  ifft2(state.imfUnRe, state.imfUnIm, n);

  const sqrtNpix = Math.sqrt(npix);
  const imh = state.imh;
  const estDisp = state.estDisp;
  for (let i = 0; i < npix; i++) {
    imh[i] = sqrtNpix * state.imfUnRe[i];
    estDisp[i] = mu + imh[i];
  }

  state.iter += 1;
}

function computeFrameAndPost(includeStatic = false) {
  const { n, iter } = state;
  const imfRe = state.imfRe;
  const imfIm = state.imfIm;
  const lambda = state.lambda;

  const estimateRGBA = rgbaFromGray(state.estDisp, n);
  const spectrum = computeRadialSpectrumShifted(imfRe, imfIm, n);
  const energy = lambda ? computeEnergy(lambda, imfRe, imfIm) : 0;

  const msg = {
    type: "frame",
    size: n,
    iter,
    energy,
    spectrum,
    estimateRGBA: estimateRGBA.buffer,
  };

  postMessage(msg, [estimateRGBA.buffer, spectrum.buffer]);
}

function startLoop() {
  if (loopHandle) return;
  loopHandle = setInterval(() => {
    if (!running || !state) return;
    try {
      const iters = Math.max(1, params.itersPerFrame | 0);
      for (let i = 0; i < iters; i++) stepOnce();
      // send dynamic frame (only estimate + spectrum)
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

      // Send static payload once (don’t re-transfer persistent buffers).
      const kCurveCopy = state.kCurve.slice(0);
      const originalBuf = state.originalRGBA.buffer.slice(0);
      const noisyBuf = state.noisyRGBA.buffer.slice(0);
      postMessage(
        {
          type: "ready",
          size: state.n,
          kCurve: kCurveCopy.buffer,
          originalRGBA: originalBuf,
          noisyRGBA: noisyBuf,
        },
        [kCurveCopy.buffer, originalBuf, noisyBuf]
      );

      // First dynamic frame (estimate + spectrum)
      computeFrameAndPost(false);
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
      // regenerate noise + restart at iter=0 with current params
      rebuildNoisyState();
      running = false;
      // noisy image changed; resend it (kCurve is unchanged for the same image/size)
      const noisyBuf = state.noisyRGBA.buffer.slice(0);
      postMessage({ type: "noisy", size: state.n, noisyRGBA: noisyBuf }, [noisyBuf]);
      computeFrameAndPost(false);
      return;
    }
  } catch (e) {
    postError(e);
  }
};


