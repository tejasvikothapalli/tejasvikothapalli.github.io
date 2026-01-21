# denoise demo (static, interactive)

This is a **100% static** (client-side) interactive visualization of `denoising/denoise.py` (denoising with a \(1/f^2\) prior using Langevin updates in the Fourier domain).

It runs entirely in the browser:
- UI in the main thread (`main.js`)
- Iterative FFT-based updates in a Web Worker (`worker.js`)
- No dependencies (includes a minimal radix-2 FFT in `fft2d.js`)

## Open locally

Because this demo uses ES modules + a Web Worker, serve it over HTTP (not `file://`).

If you start the server from the **project root**:

```bash
python3 -m http.server 8000
```

Open:
- `http://localhost:8000/denoising/web/denoise_demo/`

If you start the server from inside the **`denoising/`** folder:

```bash
cd denoising
python3 -m http.server 8000
```

Open:
- `http://localhost:8000/web/denoise_demo/`


