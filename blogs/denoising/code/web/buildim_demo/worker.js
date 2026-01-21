import { fft2, ifft2 } from "./fft2d.js";

let state = null;
let running = false;
let loopHandle = null;

// Autoplay speed: one coefficient per tick.
// Increase FRAME_MS to slow the buildup down.
const FRAME_MS = 200; // ~5 fps
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
let lastTickAt = 0;

let params = {
  size: 256,
  coeffsPerFrame: 1,
};

function postError(err) {
  const msg = err instanceof Error ? (err.stack || err.message) : String(err);
  postMessage({ type: "error", error: msg });
}

function meanFloat(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
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

function rgbaFromFullContrast(full, n) {
  // full is in [-1,1]; map to [0,255]
  const out = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const t = Math.max(-1, Math.min(1, full[i]));
    const g = Math.round(((t + 1) * 0.5) * 255);
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

function computeKForCurve(im, mu, n) {
  // Match buildim.py:
  // k = sum((im-mu)^2) / sum(1/rho2_0), where rho2_0 at DC is set huge.
  const half = n >> 1;
  let sumSq = 0;
  for (let i = 0; i < im.length; i++) {
    const d = im[i] - mu;
    sumSq += d * d;
  }

  let sumInv = 0;
  for (let y = 0; y < n; y++) {
    const fy = y - half;
    for (let x = 0; x < n; x++) {
      const fx = x - half;
      let rho2 = fx * fx + fy * fy;
      if (x === half && y === half) rho2 = 1e8; // avoid divide by zero at DC
      sumInv += 1.0 / rho2;
    }
  }
  return sumSq / sumInv;
}

function buildOrderingExact(imfShiftRe, imfShiftIm, n) {
  // Match buildim.py selection:
  // imf_flat = flatten(order='F') on shifted spectrum
  // sort abs over slice [0 : n/2 + szy/2), keep n2 = Npix/2 indices
  const npix = n * n;
  const n2 = npix >> 1;
  const m = (npix >> 1) + (n >> 1);

  // Build the Fortran-ordered flattened arrays for direct lookup by idxF.
  const flatRe = new Float32Array(npix);
  const flatIm = new Float32Array(npix);
  let t = 0;
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) {
      const idxRM = r * n + c;
      flatRe[t] = imfShiftRe[idxRM];
      flatIm[t] = imfShiftIm[idxRM];
      t++;
    }
  }

  const mags = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const re = flatRe[i];
    const im = flatIm[i];
    mags[i] = re * re + im * im;
  }

  const idx = Array.from({ length: m }, (_, i) => i);
  idx.sort((a, b) => mags[b] - mags[a]);

  const si = new Uint32Array(n2);
  const aAbs = new Float32Array(n2);
  for (let i = 0; i < n2; i++) {
    const ii = idx[i] >>> 0;
    si[i] = ii;
    aAbs[i] = Math.sqrt(mags[ii]);
  }

  // Precompute row/col, fx/fy, r, amp_all (power), matching buildim.py.
  const row = new Uint32Array(n2);
  const col = new Uint32Array(n2);
  const fx = new Float32Array(n2);
  const fy = new Float32Array(n2);
  const rAll = new Float32Array(n2);
  const ampAll = new Float32Array(n2);
  const sqrtNpix = Math.sqrt(npix);
  for (let i = 0; i < n2; i++) {
    const s = si[i];
    const r = s % n;
    const c = (s / n) | 0;
    row[i] = r;
    col[i] = c;
    const fyv = r - (n / 2);
    const fxv = c - (n / 2);
    fy[i] = fyv;
    fx[i] = fxv;
    rAll[i] = Math.sqrt(fxv * fxv + fyv * fyv);

    // imf_flat_p = imf_flat * sqrt(npix)
    // amp_all = |imf_flat_p[si]|^2
    const re = flatRe[s] * sqrtNpix;
    const im = flatIm[s] * sqrtNpix;
    ampAll[i] = re * re + im * im;
  }

  return { si, aAbs, row, col, fx, fy, rAll, ampAll, flatRe, flatIm, n2 };
}

function init(image, p) {
  params = { ...params, ...(p || {}) };
  const n = params.size | 0;
  if ((n & (n - 1)) !== 0) throw new Error("size must be power of 2 for FFT");

  const im = new Float32Array(image); // transferred in
  const npix = n * n;
  if (im.length !== npix) throw new Error("image length mismatch");

  // Compute normalized FFT like buildim.py: fftshift(fft2(im)) / npix
  const imfRe = new Float32Array(npix);
  const imfIm = new Float32Array(npix);
  for (let i = 0; i < npix; i++) {
    imfRe[i] = im[i];
    imfIm[i] = 0;
  }
  fft2(imfRe, imfIm, n, false);

  // Normalize by npix (buildim.py uses /n where n=npix)
  for (let i = 0; i < npix; i++) {
    imfRe[i] /= npix;
    imfIm[i] /= npix;
  }

  const imfShiftRe = new Float32Array(npix);
  const imfShiftIm = new Float32Array(npix);
  fftshift2(imfRe, imfIm, imfShiftRe, imfShiftIm, n);

  const center = (n >> 1) * n + (n >> 1);
  const dc = imfShiftRe[center]; // real component
  imfShiftRe[center] = 0;
  imfShiftIm[center] = 0;

  const mu = meanFloat(im);
  const kConst = computeKForCurve(im, mu, n);
  const half = n >> 1;
  const kCurve = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const f = i + 1;
    kCurve[i] = kConst / (f * f);
  }

  const ordering = buildOrderingExact(imfShiftRe, imfShiftIm, n);

  // Buffers for reconstruction render
  const SshiftRe = new Float32Array(npix);
  const SshiftIm = new Float32Array(npix);
  const SunshiftRe = new Float32Array(npix);
  const SunshiftIm = new Float32Array(npix);

  const recon = new Float32Array(npix);
  const comp = new Float32Array(npix);
  const full = new Float32Array(npix);

  state = {
    n,
    npix,
    im,
    mu,
    dc,
    kCurve,
    ...ordering,
    SshiftRe,
    SshiftIm,
    SunshiftRe,
    SunshiftIm,
    recon,
    comp,
    full,
    k: 0,
    done: false,
    originalRGBA: rgbaFromGray(im, n),
  };
}

function renderAt(k) {
  if (!state) return;
  const { n, npix, dc, row, col, flatRe, flatIm, SshiftRe, SshiftIm, SunshiftRe, SunshiftIm } = state;
  const n2 = state.n2;
  const kk = Math.max(0, Math.min(n2, k | 0));
  state.k = kk;

  // zero shifted spectrum
  SshiftRe.fill(0);
  SshiftIm.fill(0);

  // Fill first k coefficients and their conjugate partners (in shifted indexing).
  // v is read from flat arrays (Fortran flatten of shifted spectrum) at si[ii].
  for (let ii = 0; ii < kk; ii++) {
    const r = row[ii] | 0;
    const c = col[ii] | 0;
    const rc = ((-r) % n + n) % n;
    const cc = ((-c) % n + n) % n;
    const idxF = state.si[ii] | 0;
    const vRe = flatRe[idxF];
    const vIm = flatIm[idxF];

    const idxRM = r * n + c;
    const idxRMc = rc * n + cc;

    SshiftRe[idxRM] = vRe;
    SshiftIm[idxRM] = vIm;

    // conjugate partner
    SshiftRe[idxRMc] = vRe;
    SshiftIm[idxRMc] = -vIm;
  }

  // inverse FFT: imhat = dc + real(npix * ifft2(ifftshift(S_shifted)))
  ifftshift2(SshiftRe, SshiftIm, SunshiftRe, SunshiftIm, n);
  ifft2(SunshiftRe, SunshiftIm, n);

  const recon = state.recon;
  for (let i = 0; i < npix; i++) recon[i] = dc + npix * SunshiftRe[i];

  // current component g, and full contrast
  const comp = state.comp;
  const full = state.full;
  if (kk > 0) {
    const ii = kk - 1;
    const idxF = state.si[ii] | 0;
    const vRe = flatRe[idxF];
    const vIm = flatIm[idxF];
    const fx = state.fx[ii];
    const fy = state.fy[ii];
    const denom = 2 * Math.max(1e-12, Math.sqrt(vRe * vRe + vIm * vIm));

    // g(x,y) = 2*Re(v * exp(i 2π (fx x/N + fy y/N)))
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const ang = 2 * Math.PI * (fx * x / n + fy * y / n);
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        // v * e^{i ang} = (vRe + i vIm) * (ca + i sa)
        const re = vRe * ca - vIm * sa;
        const g = 2 * re;
        const idx = y * n + x;
        comp[idx] = dc + g;
        full[idx] = g / denom;
      }
    }
  } else {
    // match buildim.py behavior: show reconstruction + flat gray in full contrast
    comp.set(recon);
    full.fill(0.5);
  }

  const reconRGBA = rgbaFromGray(recon, n);
  const compRGBA = rgbaFromGray(comp, n);
  const fullRGBA = rgbaFromFullContrast(full, n);

  const a = kk > 0 ? state.aAbs[kk - 1] : 0;

  postMessage(
    {
      type: "frame",
      size: n,
      k: kk,
      a,
      reconRGBA: reconRGBA.buffer,
      compRGBA: compRGBA.buffer,
      fullRGBA: fullRGBA.buffer,
    },
    [reconRGBA.buffer, compRGBA.buffer, fullRGBA.buffer]
  );
}

function startLoop() {
  if (loopHandle) return;
  loopHandle = setInterval(() => {
    if (!running || !state) return;
    try {
      const now = performance.now();
      if (now - lastTickAt < FRAME_MS - 1) return;
      lastTickAt = now;
      const next = Math.min(state.n2, state.k + 1);
      renderAt(next);
      if (next >= state.n2) {
        running = false;
        if (!state.done) {
          state.done = true;
          postMessage({ type: "done" });
        }
      }
    } catch (e) {
      postError(e);
      running = false;
    }
  }, FRAME_MS);
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
      lastTickAt = 0;
      startLoop();

      // send ready payload (one-time heavy arrays)
      const { n, n2, kCurve, rAll, ampAll, originalRGBA } = state;
      const originalBuf = originalRGBA.buffer.slice(0);
      postMessage(
        {
          type: "ready",
          size: n,
          n2,
          version: VERSION,
          frameMs: FRAME_MS,
          step: 1,
          kCurve: kCurve.buffer,
          rAll: rAll.buffer,
          ampAll: ampAll.buffer,
          originalRGBA: originalBuf,
        },
        [kCurve.buffer, rAll.buffer, ampAll.buffer, originalBuf]
      );

      // initial frame at k=0
      renderAt(0);
      return;
    }

    if (msg.type === "params") {
      // keep for forwards/backwards compatibility, but lock autoplay speed to 1
      params = { ...params, ...(msg.params || {}), coeffsPerFrame: 1 };
      return;
    }

    if (msg.type === "setK") {
      running = false;
      if (state) state.done = false;
      renderAt(msg.k | 0);
      return;
    }

    if (msg.type === "start") {
      running = true;
      if (state) state.done = false;
      return;
    }

    if (msg.type === "pause") {
      running = false;
      return;
    }

    if (msg.type === "reset") {
      if (!state) return;
      running = false;
      state.done = false;
      renderAt(0);
      return;
    }
  } catch (e) {
    postError(e);
  }
};


