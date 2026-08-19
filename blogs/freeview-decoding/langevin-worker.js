// Langevin sampling of the 1/f reconstruction, restricted to the robust hull.
//
// This is the update from the denoising post (denoise.py / denoise.m) with one
// change: the likelihood only covers hull pixels, so its gradient is formed in
// the pixel domain while the 1/f^2 prior gradient stays diagonal in Fourier.
//
//   E(x)  = 0.5 |M(x - y)|^2 / sigma_n^2 + 0.5 sum_f lambda(f) |X(f)|^2
//   H(f)  = 1/sigma_n^2 + lambda(f)                    (preconditioner)
//   X    <- X - (eta/H) grad E + sqrt(2 T eta / H) xi
//
// A constant preconditioner keeps the stationary distribution exact, so T = 1
// really does draw posterior samples and T = 0 is plain gradient descent to the
// MAP. Pixels outside the hull are unconstrained nuisance variables: they are
// carried by the FFT canvas so the prior sees no artificial boundary, and they
// are never displayed.

"use strict";

// Minimal radix-2 FFT, extended from the denoising demo's fft2d.js to
// rectangular (nx x ny) grids so the panel can keep the scene's 16:9 framing.

function reverseBits(x, bits) {
  let y = 0;
  for (let i = 0; i < bits; i += 1) {
    y = (y << 1) | (x & 1);
    x >>>= 1;
  }
  return y;
}

function fft1d(re, im, n, inverse) {
  const levels = Math.round(Math.log2(n));
  if (1 << levels !== n) throw new Error("fft1d: length must be a power of 2");

  for (let i = 0; i < n; i += 1) {
    const j = reverseBits(i, levels);
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >>> 1;
    const theta = ((inverse ? 2 : -2) * Math.PI) / size;
    const wtemp = Math.sin(0.5 * theta);
    const wpr = -2 * wtemp * wtemp;
    const wpi = Math.sin(theta);
    for (let i = 0; i < n; i += size) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < half; j += 1) {
        const l = i + j;
        const r = l + half;
        const tr = wr * re[r] - wi * im[r];
        const ti = wr * im[r] + wi * re[r];
        re[r] = re[l] - tr;
        im[r] = im[l] - ti;
        re[l] += tr;
        im[l] += ti;
        const wrNext = wr + (wr * wpr - wi * wpi);
        wi += wi * wpr + wr * wpi;
        wr = wrNext;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

// Row/column passes over a nx-wide, ny-tall complex image stored row major.
function fft2(re, im, nx, ny, inverse, scratchRe, scratchIm) {
  for (let y = 0; y < ny; y += 1) {
    const offset = y * nx;
    for (let x = 0; x < nx; x += 1) {
      scratchRe[x] = re[offset + x];
      scratchIm[x] = im[offset + x];
    }
    fft1d(scratchRe, scratchIm, nx, inverse);
    for (let x = 0; x < nx; x += 1) {
      re[offset + x] = scratchRe[x];
      im[offset + x] = scratchIm[x];
    }
  }

  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      const index = y * nx + x;
      scratchRe[y] = re[index];
      scratchIm[y] = im[index];
    }
    fft1d(scratchRe, scratchIm, ny, inverse);
    for (let y = 0; y < ny; y += 1) {
      const index = y * nx + x;
      re[index] = scratchRe[y];
      im[index] = scratchIm[y];
    }
  }
}

function randnFactory(seed = 20260819) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s >>> 8) / (1 << 24);
  };
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = uniform();
    while (v === 0) v = uniform();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    spare = magnitude * Math.sin(2 * Math.PI * v);
    return magnitude * Math.cos(2 * Math.PI * v);
  };
}

let state = null;
let params = { snr: 8, temperature: 1, eta: 0.1, stepsPerFrame: 5 };
let running = false;
let timer = 0;

function postError(error) {
  postMessage({
    type: "error",
    error: error instanceof Error ? error.stack || error.message : String(error),
  });
}

// rho^2 in cycles-per-source-pixel, so the isotropic 1/f^2 prior stays
// isotropic even though the work grid is not the scene's aspect ratio.
function buildRho2(nx, ny, aspect) {
  const rho2 = new Float32Array(nx * ny);
  const halfX = nx >> 1;
  const halfY = ny >> 1;
  for (let y = 0; y < ny; y += 1) {
    const fy = y - halfY;
    for (let x = 0; x < nx; x += 1) {
      const fx = (x - halfX) * aspect;
      rho2[y * nx + x] = fx * fx + fy * fy;
    }
  }
  return rho2;
}

// k so that the total pixel variance equals the variance the 1/f^2 model
// predicts, exactly as denoise.py calibrates it, but measured inside the hull.
function calibrate() {
  const { npix, mask, hullPixels, observation, rho2, nx, ny } = state;

  let sum = 0;
  for (let i = 0; i < npix; i += 1) if (mask[i]) sum += observation[i];
  const mean = hullPixels ? sum / hullPixels : 0;

  let sumSquares = 0;
  for (let i = 0; i < npix; i += 1) {
    if (!mask[i]) continue;
    const d = observation[i] - mean;
    sumSquares += d * d;
  }
  const variance = hullPixels ? sumSquares / hullPixels : 0;

  if (!state.inverseRhoSum) {
    let inverseSum = 0;
    const dc = (ny >> 1) * nx + (nx >> 1);
    for (let i = 0; i < npix; i += 1) {
      if (i === dc) continue;
      inverseSum += 1 / rho2[i];
    }
    state.inverseRhoSum = inverseSum;
  }

  state.mean = mean;
  state.variance = variance;
  state.k = (variance * npix) / state.inverseRhoSum;

  const target = state.target;
  for (let i = 0; i < npix; i += 1) target[i] = mask[i] ? observation[i] - mean : 0;
}

function forward(sourceRe, sourceIm) {
  const { nx, ny, npix, scratchRe, scratchIm } = state;
  fft2(sourceRe, sourceIm, nx, ny, false, scratchRe, scratchIm);
  const scale = 1 / Math.sqrt(npix);
  for (let i = 0; i < npix; i += 1) {
    sourceRe[i] *= scale;
    sourceIm[i] *= scale;
  }
  shift(sourceRe, sourceIm);
}

// For even dimensions ifftshift equals fftshift, which is what both reference
// implementations rely on.
function shift(re, im) {
  const { nx, ny, shiftRe, shiftIm } = state;
  const halfX = nx >> 1;
  const halfY = ny >> 1;
  for (let y = 0; y < ny; y += 1) {
    const yy = (y + halfY) % ny;
    for (let x = 0; x < nx; x += 1) {
      const xx = (x + halfX) % nx;
      shiftRe[yy * nx + xx] = re[y * nx + x];
      shiftIm[yy * nx + xx] = im[y * nx + x];
    }
  }
  re.set(shiftRe);
  im.set(shiftIm);
}

// Reset the chain to the current reconstruction: x = y, X = F{x}.
function seedFromTarget() {
  const { npix, target, image, spectrumRe, spectrumIm } = state;
  image.set(target);
  spectrumRe.set(target);
  spectrumIm.fill(0);
  forward(spectrumRe, spectrumIm);
  state.iteration = 0;
}

function step() {
  const {
    nx,
    ny,
    npix,
    mask,
    target,
    image,
    rho2,
    spectrumRe,
    spectrumIm,
    gradientRe,
    gradientIm,
    scratchRe,
    scratchIm,
    randn,
  } = state;

  const sigma2 = Math.max(1e-6, state.variance / Math.max(0.05, params.snr));
  const inverseSigma2 = 1 / sigma2;
  const inverseK = 1 / Math.max(1e-12, state.k);
  const eta = params.eta;
  const temperature = params.temperature;

  // Likelihood gradient lives in the pixel domain because the hull mask is not
  // diagonal in Fourier.
  for (let i = 0; i < npix; i += 1) {
    gradientRe[i] = mask[i] ? (image[i] - target[i]) * inverseSigma2 : 0;
    gradientIm[i] = 0;
  }
  fft2(gradientRe, gradientIm, nx, ny, false, scratchRe, scratchIm);
  const scale = 1 / Math.sqrt(npix);
  for (let i = 0; i < npix; i += 1) {
    gradientRe[i] *= scale;
    gradientIm[i] *= scale;
  }
  shift(gradientRe, gradientIm);

  for (let i = 0; i < npix; i += 1) {
    const lambda = rho2[i] * inverseK;
    const H = inverseSigma2 + lambda;
    const gradRe = gradientRe[i] + lambda * spectrumRe[i];
    const gradIm = gradientIm[i] + lambda * spectrumIm[i];
    const factor = -(eta / H);
    let deltaRe = factor * gradRe;
    let deltaIm = factor * gradIm;
    if (temperature > 0) {
      const sigma = Math.sqrt((2 * temperature * eta) / H);
      deltaRe += sigma * randn();
      deltaIm += sigma * randn();
    }
    spectrumRe[i] += deltaRe;
    spectrumIm[i] += deltaIm;
  }

  // x = real(sqrt(npix) * ifft2(ifftshift(X)))
  gradientRe.set(spectrumRe);
  gradientIm.set(spectrumIm);
  shift(gradientRe, gradientIm);
  fft2(gradientRe, gradientIm, nx, ny, true, scratchRe, scratchIm);
  const gain = Math.sqrt(npix);
  for (let i = 0; i < npix; i += 1) image[i] = gain * gradientRe[i];

  state.iteration += 1;
}

function frame() {
  const { npix, mask, image, target, mean } = state;
  const rgba = new Uint8ClampedArray(npix * 4);
  let sumSquares = 0;
  for (let i = 0; i < npix; i += 1) {
    if (!mask[i]) continue;
    const value = image[i] + mean;
    const level = value < 0 ? 0 : value > 255 ? 255 : value;
    const offset = i * 4;
    rgba[offset] = level;
    rgba[offset + 1] = level;
    rgba[offset + 2] = level;
    rgba[offset + 3] = 255;
    const d = image[i] - target[i];
    sumSquares += d * d;
  }
  const deviation = state.hullPixels ? Math.sqrt(sumSquares / state.hullPixels) : 0;
  postMessage(
    {
      type: "frame",
      width: state.nx,
      height: state.ny,
      iteration: state.iteration,
      deviation,
      pixels: rgba.buffer,
    },
    [rgba.buffer],
  );
}

function loop() {
  if (timer) return;
  timer = setInterval(() => {
    if (!running || !state) return;
    try {
      const steps = Math.max(1, params.stepsPerFrame | 0);
      for (let i = 0; i < steps; i += 1) step();
      frame();
    } catch (error) {
      running = false;
      postError(error);
    }
  }, 16);
}

function init(message) {
  const nx = message.width | 0;
  const ny = message.height | 0;
  const npix = nx * ny;
  params = { ...params, ...(message.params || {}) };

  const mask = new Uint8Array(message.mask);
  let hullPixels = 0;
  for (let i = 0; i < npix; i += 1) if (mask[i]) hullPixels += 1;

  state = {
    nx,
    ny,
    npix,
    mask,
    hullPixels,
    observation: new Float32Array(message.observation),
    rho2: buildRho2(nx, ny, message.aspect || 1),
    inverseRhoSum: 0,
    target: new Float32Array(npix),
    image: new Float32Array(npix),
    spectrumRe: new Float32Array(npix),
    spectrumIm: new Float32Array(npix),
    gradientRe: new Float32Array(npix),
    gradientIm: new Float32Array(npix),
    shiftRe: new Float32Array(npix),
    shiftIm: new Float32Array(npix),
    scratchRe: new Float32Array(Math.max(nx, ny)),
    scratchIm: new Float32Array(Math.max(nx, ny)),
    randn: randnFactory(),
    mean: 0,
    variance: 0,
    k: 1,
    iteration: 0,
  };

  calibrate();
  seedFromTarget();
  frame();
  loop();
}

self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      init(message);
      return;
    }
    if (!state) return;

    if (message.type === "observation") {
      state.observation = new Float32Array(message.observation);
      calibrate();
      // The chain keeps its current sample and simply follows the newer
      // reconstruction, so scrubbing never restarts the burn-in.
      if (message.reseed) seedFromTarget();
      if (!running) frame();
      return;
    }

    if (message.type === "params") {
      params = { ...params, ...(message.params || {}) };
      return;
    }

    if (message.type === "reset") {
      seedFromTarget();
      frame();
      return;
    }

    if (message.type === "run") {
      running = Boolean(message.running);
      return;
    }
  } catch (error) {
    postError(error);
  }
};
