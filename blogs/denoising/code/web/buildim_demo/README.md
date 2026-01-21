# buildim demo (static, interactive)

This is a **100% static** (client-side) interactive visualization of `denoising/buildim.py` (building an image one Fourier component at a time).

It runs entirely in the browser:
- UI (sliders/buttons) in the main thread (`main.js`)
- FFT + reconstruction in a Web Worker (`worker.js`)
- No dependencies (includes a minimal radix-2 FFT in `fft2d.js`)

## Open locally

Because this demo uses ES modules + a Web Worker, you should serve it over HTTP (not `file://`).

If you start the server from the **project root**:

```bash
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/denoising/web/buildim_demo/`

If you start the server from inside the **`denoising/`** folder:

```bash
cd denoising
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/web/buildim_demo/`

## Controls

- **k (components)**: how many of the largest-magnitude Fourier coefficients to include.
- **Play/Pause**: animates k forward.
- **Upload image**: any image will be center-cropped and resized to a square.


