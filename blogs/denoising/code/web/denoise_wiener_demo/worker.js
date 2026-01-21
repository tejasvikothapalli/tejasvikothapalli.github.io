import { fft2, ifft2 } from "./fft2d.js";

let state = null;
let params = {
  size: 256,
  sigmaN: 0.05,
};

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
  return () => {
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

// Convert image in 0-1 range to RGBA (matching Python's 0-1 normalized images)
function rgbaFromGray01(im, n) {
  const out = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    // Convert from 0-1 to 0-255 for display
    const g = Math.max(0, Math.min(255, Math.round(im[i] * 255)));
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

function computeRadialSpectrumShifted(imfRe, imfIm, n) {
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
  for (let i = 0; i < half; i++) P[i] = counts[i] ? (sums[i] / counts[i]) : 0;
  return P;
}

function buildKAndF2Shifted(im0, mu, n) {
  // Match denoise_weiner.py: f2 on centered grid and k computed with f20[center]=1e8.
  const npix = n * n;
  const half = n >> 1;

  const f2 = new Float32Array(npix);
  let sumInv = 0;

  for (let y = 0; y < n; y++) {
    const fy = y - half;
    for (let x = 0; x < n; x++) {
      const fx = x - half;
      const idx = y * n + x;
      const v = fx * fx + fy * fy;
      f2[idx] = v;
      const denom = (x === half && y === half) ? 1e8 : v;
      sumInv += 1.0 / denom;
    }
  }

  let sumSq = 0;
  for (let i = 0; i < npix; i++) {
    const d = im0[i] - mu;
    sumSq += d * d;
  }

  const k = sumSq / sumInv;
  return { f2, k };
}

function init(image, p) {
  params = { ...params, ...(p || {}) };
  const n = params.size | 0;
  if ((n & (n - 1)) !== 0) throw new Error("size must be power of 2 for FFT");

  const im0 = new Float32Array(image); // transferred in
  const npix = n * n;
  if (im0.length !== npix) throw new Error("image length mismatch");
  

  const mu = meanFloat(im0);
  const im = new Float32Array(npix);
  for (let i = 0; i < npix; i++) im[i] = im0[i] - mu;

  const sigma_im = Math.sqrt(Math.max(0, varFloat(im, 0)));
  const { f2, k } = buildKAndF2Shifted(im0, mu, n);

  // Precompute frequency axis for spectra (1..n/2) and k/f^2 curve
  const half = n >> 1;
  const f1 = new Float32Array(half);
  const kCurve = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const f = i + 1;
    f1[i] = f;
    kCurve[i] = k / (f * f);
  }

  // Precompute attenuation curve x-values (log-spaced) to avoid sending huge vectors
  const attN = 512;
  const attX = new Float32Array(attN);
  const attY = new Float32Array(attN);
  const fMin = 1;
  const fMax = half;
  for (let i = 0; i < attN; i++) {
    const t = i / (attN - 1);
    attX[i] = fMin * Math.pow(fMax / fMin, t);
  }

  // Fixed noise field (stable while sliding); Reset regenerates it.
  const randn = randnFactory(12345);
  const noise0 = new Float32Array(npix);
  for (let i = 0; i < npix; i++) noise0[i] = randn();

  // buffers
  const nim = new Float32Array(npix);
  const imhat = new Float32Array(npix);
  const nimDisp = new Float32Array(npix);
  const imhatDisp = new Float32Array(npix);

  const imfUnRe = new Float32Array(npix);
  const imfUnIm = new Float32Array(npix);
  const imfRe = new Float32Array(npix);
  const imfIm = new Float32Array(npix);

  const imfhatRe = new Float32Array(npix);
  const imfhatIm = new Float32Array(npix);
  const tmpRe = new Float32Array(npix);
  const tmpIm = new Float32Array(npix);

  state = {
    n,
    npix,
    im0,
    im,
    mu,
    sigma_im,
    f2,
    k,
    f1,
    kCurve,
    attX,
    attY,
    noise0,
    nim,
    imhat,
    nimDisp,
    imhatDisp,
    imfUnRe,
    imfUnIm,
    imfRe,
    imfIm,
    imfhatRe,
    imfhatIm,
    tmpRe,
    tmpIm,
  };
}

function computeAndPost() {
  const n = state.n;
  const npix = state.npix;
  const sqrtN = Math.sqrt(npix);
  const sigmaN = Math.max(0, params.sigmaN);

  // nim = im + sigmaN * noise0
  for (let i = 0; i < npix; i++) state.nim[i] = state.im[i] + sigmaN * state.noise0[i];

  // imf = fftshift(fft2(nim))/sqrt(n)
  for (let i = 0; i < npix; i++) {
    state.imfUnRe[i] = state.nim[i];
    state.imfUnIm[i] = 0;
  }
  fft2(state.imfUnRe, state.imfUnIm, n, false);
  for (let i = 0; i < npix; i++) {
    state.imfUnRe[i] /= sqrtN;
    state.imfUnIm[i] /= sqrtN;
  }
  fftshift2(state.imfUnRe, state.imfUnIm, state.imfRe, state.imfIm, n);

  // a = 1/(1 + (f2/k)*sigmaN^2)
  const sigma2 = sigmaN * sigmaN;
  const k = state.k;
  for (let i = 0; i < npix; i++) {
    const a = 1.0 / (1.0 + (state.f2[i] / k) * sigma2);
    state.imfhatRe[i] = a * state.imfRe[i];
    state.imfhatIm[i] = a * state.imfIm[i];
  }

  // imhat = real(sqrt(n)*ifft2(ifftshift(imfhat)))
  ifftshift2(state.imfhatRe, state.imfhatIm, state.tmpRe, state.tmpIm, n);
  ifft2(state.tmpRe, state.tmpIm, n);
  for (let i = 0; i < npix; i++) state.imhat[i] = sqrtN * state.tmpRe[i];

  // display images in [0,255] space
  for (let i = 0; i < npix; i++) {
    state.nimDisp[i] = state.mu + state.nim[i];
    state.imhatDisp[i] = state.mu + state.imhat[i];
  }

  // attenuation curve y-values at attX
  for (let i = 0; i < state.attX.length; i++) {
    const f = state.attX[i];
    state.attY[i] = 1.0 / (1.0 + ((f * f) / k) * sigma2);
  }

  const P_noisy = computeRadialSpectrumShifted(state.imfRe, state.imfIm, n);
  const P_denoised = computeRadialSpectrumShifted(state.imfhatRe, state.imfhatIm, n);

  const noisyRGBA = rgbaFromGray01(state.nimDisp, n);
  const reconRGBA = rgbaFromGray01(state.imhatDisp, n);

  postMessage(
    {
      type: "frame",
      size: n,
      sigmaN,
      noisyRGBA: noisyRGBA.buffer,
      reconRGBA: reconRGBA.buffer,
      attX: state.attX.buffer,
      attY: state.attY.buffer,
      specNoisy: P_noisy.buffer,
      specDenoised: P_denoised.buffer,
    },
    [noisyRGBA.buffer, reconRGBA.buffer, P_noisy.buffer, P_denoised.buffer]
  );
}

function regenerateNoise() {
  const randn = randnFactory((Math.random() * 1e9) | 0);
  for (let i = 0; i < state.noise0.length; i++) state.noise0[i] = randn();
}

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "init") {
      init(msg.image, msg.params || {});

      // Send persistent arrays once (avoid detached buffers):
      const originalRGBA = rgbaFromGray01(state.im0, state.n);
      const f1Copy = state.f1.slice(0);
      const kCurveCopy = state.kCurve.slice(0);
      const attXCopy = state.attX.slice(0);

      postMessage(
        {
          type: "ready",
          size: state.n,
          originalRGBA: originalRGBA.buffer,
          f1: f1Copy.buffer,
          kCurve: kCurveCopy.buffer,
          attX: attXCopy.buffer,
        },
        [originalRGBA.buffer, f1Copy.buffer, kCurveCopy.buffer, attXCopy.buffer]
      );

      computeAndPost();
      return;
    }

    if (msg.type === "params") {
      params = { ...params, ...(msg.params || {}) };
      computeAndPost();
      return;
    }

    if (msg.type === "reset") {
      if (!state) return;
      regenerateNoise();
      computeAndPost();
      return;
    }
  } catch (e) {
    postError(e);
  }
};


