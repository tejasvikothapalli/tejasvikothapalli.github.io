# fillin demo with LaMa (static, interactive)

This is a **100% static** (client-side) interactive visualization of the `fillin` algorithm (inpainting with a \(1/f^2\) prior) **plus** LaMa deep learning inpainting.

It runs entirely in the browser:
- UI (sliders/buttons) in the main thread (`main.js`)
- Iterative FFT-based updates in a Web Worker (`worker.js`)
- LaMa deep learning inpainting using ONNX Runtime Web (`lama_inference.js`)
- Canvases for the four images + power spectrum plot (`index.html`)

## Setup: LaMa Model

**Important**: This demo requires a LaMa ONNX model file to be present. The model is not included in the repository due to its large size (~200MB).

### Downloading the Pre-converted Model (Recommended)

The easiest way is to download a pre-converted ONNX model:

1. Install dependencies:
   ```bash
   pip install huggingface-hub
   ```

2. Run the download script:
   ```bash
   python download_lama_onnx.py --output big-lama.onnx
   ```

This will download the pre-converted model from Hugging Face (Carve/LaMa-ONNX) and place it in the demo directory.

### Alternative: Manual Download

If the script doesn't work, manually download:
1. Visit: https://huggingface.co/Carve/LaMa-ONNX
2. Download `lama_fp32.onnx`
3. Rename it to `big-lama.onnx`
4. Place it in the `fillin_deeplearning_demo/` directory

### Alternative: Convert from PyTorch (Advanced)

If you want to convert from PyTorch (may not work due to FFT operations):
1. Install dependencies:
   ```bash
   pip install simple-lama-inpainting torch onnx
   ```

2. Run the conversion script:
   ```bash
   python convert_lama_to_onnx.py --output big-lama.onnx
   ```

**Note**: The conversion script may fail because the model uses FFT operations not supported in ONNX. In that case, use the pre-converted model download method above.

### Model File Size

The ONNX model file will be large (~50-200MB). For GitHub Pages:
- Consider using Git LFS for the model file
- Or host the model on a CDN and update the path in `lama_inference.js`
- Or use a smaller/quantized model variant if available

## Open locally

Because this demo uses ES modules + a Web Worker, you should serve it over HTTP (not `file://`).

From the repo root:

```bash
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/blogs/denoising/code/web/fillin_deeplearning_demo/`

## Controls

- **known pixels (%)**: fraction of pixels kept fixed (the rest are "missing" and will be filled in). Borders are forced missing (like `fillin.m`).
- **eta**: gradient step size.
- **T** + **enable noise term**: adds Langevin noise (matches the optional `+ sqrt2Teta*randn(...)` term).
- **Upload image**: pick any image; it will be center-cropped and resized to a square.

## Panels

1. **original**: The input image
2. **masked**: Image with missing pixels shown in blue
3. **LaMa inpainting**: Deep learning inpainting result (computed once when image/mask changes)
4. **estimate**: 1/f² prior inpainting result (updates iteratively in real-time)
5. **power spectrum**: Radially averaged power spectrum with k/f² reference curve

## Embed in a blog post

If your blog can host static assets, copy the folder `fillin_deeplearning_demo/` into your site and embed:

```html
<iframe
  src="/blogs/denoising/code/web/fillin_deeplearning_demo/"
  width="100%"
  height="720"
  style="border: 0; border-radius: 12px;"
  loading="lazy"
></iframe>
```

If you're using GitHub Pages for this repo, the same idea works; just set `src` to the published path for `fillin_deeplearning_demo/`.

## Browser Compatibility

- Requires modern browsers with WebAssembly support (Chrome, Firefox, Safari, Edge)
- ONNX Runtime Web requires ES6 modules support
- Model loading may take 10-30 seconds depending on connection speed

## Troubleshooting

- **"Model not loaded"**: Make sure `big-lama.onnx` is in the demo directory and the path in `lama_inference.js` is correct
- **"ONNX Runtime Web not loaded"**: Check that the CDN script is included in `index.html`
- **Slow inference**: LaMa inference runs on CPU in the browser, so it may take several seconds per image
- **Large model file**: Consider using a CDN or Git LFS for hosting the model file
