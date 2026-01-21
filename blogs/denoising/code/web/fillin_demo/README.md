# fillin demo (static, interactive)

This is a **100% static** (client-side) interactive visualization of the `fillin` algorithm (inpainting with a \(1/f^2\) prior).

It runs entirely in the browser:
- UI (sliders/buttons) in the main thread (`main.js`)
- Iterative FFT-based updates in a Web Worker (`worker.js`)
- Canvases for the three images + power spectrum plot (`index.html`)

## Open locally

Because this demo uses ES modules + a Web Worker, you should serve it over HTTP (not `file://`).

From the repo root:

```bash
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/denoising/web/fillin_demo/`

## Controls

- **known pixels (%)**: fraction of pixels kept fixed (the rest are “missing” and will be filled in). Borders are forced missing (like `fillin.m`).
- **eta**: gradient step size.
- **T** + **enable noise term**: adds Langevin noise (matches the optional `+ sqrt2Teta*randn(...)` term).
- **Upload image**: pick any image; it will be center-cropped and resized to a square.

## Embed in a blog post

If your blog can host static assets, copy the folder `denoising/web/fillin_demo/` into your site and embed:

```html
<iframe
  src="/denoising/web/fillin_demo/"
  width="100%"
  height="720"
  style="border: 0; border-radius: 12px;"
  loading="lazy"
></iframe>
```

If you’re using GitHub Pages for this repo, the same idea works; just set `src` to the published path for `denoising/web/fillin_demo/`.





