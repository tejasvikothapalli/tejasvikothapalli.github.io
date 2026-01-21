// Minimal radix-2 FFT for browser demos (no dependencies).
// - in-place complex FFT on (re, im) typed arrays
// - fft2/ifft2 via row + column passes

function reverseBits(x, bits) {
  let y = 0;
  for (let i = 0; i < bits; i++) {
    y = (y << 1) | (x & 1);
    x >>>= 1;
  }
  return y;
}

function fft1d(re, im, inverse) {
  const n = re.length;
  const levels = Math.floor(Math.log2(n));
  if (1 << levels !== n) throw new Error("fft1d: length must be power of 2");

  // bit-reversal permutation
  for (let i = 0; i < n; i++) {
    const j = reverseBits(i, levels);
    if (j > i) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // Cooley-Tukey
  for (let size = 2; size <= n; size <<= 1) {
    const halfsize = size >>> 1;
    const theta = (inverse ? 2 : -2) * Math.PI / size;
    const wtemp = Math.sin(0.5 * theta);
    const wpr = -2.0 * wtemp * wtemp;
    const wpi = Math.sin(theta);
    for (let i = 0; i < n; i += size) {
      let wr = 1.0;
      let wi = 0.0;
      for (let j = 0; j < halfsize; j++) {
        const l = i + j;
        const r = l + halfsize;

        const tr = wr * re[r] - wi * im[r];
        const ti = wr * im[r] + wi * re[r];

        re[r] = re[l] - tr;
        im[r] = im[l] - ti;
        re[l] = re[l] + tr;
        im[l] = im[l] + ti;

        // trig recurrence
        const wrNext = wr + (wr * wpr - wi * wpi);
        const wiNext = wi + (wi * wpr + wr * wpi);
        wr = wrNext;
        wi = wiNext;
      }
    }
  }

  // normalize inverse
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

export function fft2(re, im, n, inverse) {
  // rows
  const rowRe = new Float32Array(n);
  const rowIm = new Float32Array(n);
  for (let y = 0; y < n; y++) {
    const off = y * n;
    for (let x = 0; x < n; x++) {
      rowRe[x] = re[off + x];
      rowIm[x] = im[off + x];
    }
    fft1d(rowRe, rowIm, inverse);
    for (let x = 0; x < n; x++) {
      re[off + x] = rowRe[x];
      im[off + x] = rowIm[x];
    }
  }

  // cols
  const colRe = rowRe;
  const colIm = rowIm;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const idx = y * n + x;
      colRe[y] = re[idx];
      colIm[y] = im[idx];
    }
    fft1d(colRe, colIm, inverse);
    for (let y = 0; y < n; y++) {
      const idx = y * n + x;
      re[idx] = colRe[y];
      im[idx] = colIm[y];
    }
  }
}

export function ifft2(re, im, n) {
  fft2(re, im, n, true);
}





