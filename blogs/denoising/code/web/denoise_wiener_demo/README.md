# denoise_weiner demo (static, interactive)

This is a **100% static** (client-side) interactive visualization of `denoising/denoise_weiner.py`:
- sigma slider (fixed noise field while sliding)
- attenuation curve
- noisy + denoised power spectra (radial average)

## Open locally

Serve over HTTP (not `file://`) because this demo uses ES modules + a Web Worker.

If you start the server from the **project root**:

```bash
python3 -m http.server 8000
```

Open:
- `http://localhost:8000/denoising/web/denoise_weiner_demo/`

If you start the server from inside the **`denoising/`** folder:

```bash
cd denoising
python3 -m http.server 8000
```

Open:
- `http://localhost:8000/web/denoise_weiner_demo/`


