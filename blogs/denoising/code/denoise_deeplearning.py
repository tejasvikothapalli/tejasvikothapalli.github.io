#%%
"""
DRUNet Deep Learning Denoising

This script implements DRUNet (Deep Residual U-Net) from DPIR for image denoising.
DRUNet is a state-of-the-art denoising model from:
https://github.com/cszn/DPIR

Reference:
Zhang, K., Li, Y., Zuo, W., Zhang, L., Van Gool, L., & Timofte, R. (2021).
Plug-and-Play Image Restoration with Deep Denoiser Prior.
IEEE Transactions on Pattern Analysis and Machine Intelligence.

"""
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider
import numpy as np
import torch
import os
import sys
import requests
import hashlib
from PIL import Image
from PSNR import PSNR
import pyrtools as pt

# Import DRUNet model
# Create a models module alias for compatibility
import basicblock
import network_unet
sys.modules['models.basicblock'] = basicblock
sys.modules['models.network_unet'] = network_unet

from network_unet import UNetRes
from utils import utils_model
from utils import utils_image as util

# ============================================================================
# DRUNet Model
# ============================================================================
# DRUNet (Deep Residual U-Net) is a state-of-the-art denoising model.
# It takes as input: image (1 channel) + noise level map (1 channel) = 2 channels
# The model automatically adapts to different noise levels via the noise level map.
# ============================================================================

def load_drunet_model(model_path='model_zoo/drunet_gray.pth', device=None):
    """
    Load DRUNet (Deep Residual U-Net) model from DPIR.
    
    DRUNet is a state-of-the-art denoising model that takes image + noise level map as input.
    
    Args:
        model_path: Path to pre-trained DRUNet weights
        device: torch device ('cuda' or 'cpu'). If None, auto-detect.
    
    Returns:
        Loaded DRUNet model in evaluation mode, device, and model_type
    """
    if device is None:
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    # Download model if it doesn't exist
    if not os.path.exists(model_path):
        print(f"Model not found at {model_path}, downloading...")
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        url = 'https://github.com/cszn/KAIR/releases/download/v1.0/drunet_gray.pth'
        r = requests.get(url, allow_redirects=True, timeout=60)
        with open(model_path, 'wb') as f:
            f.write(r.content)
    
    # Create model (grayscale: in_nc=2, out_nc=1)
    # Input: image (1 channel) + noise level map (1 channel) = 2 channels
    model = UNetRes(in_nc=2, out_nc=1, nc=[64, 128, 256, 512], nb=4, 
                    act_mode='R', downsample_mode="strideconv", upsample_mode="convtranspose")
    
    # Load weights
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=False), strict=True)
    
    model.eval()
    for k, v in model.named_parameters():
        v.requires_grad = False
    model = model.to(device)
    
    return model, device, 'drunet'


def denoise_image(model, noisy_image, device, noise_level=0.1):
    """
    Denoise an image using DRUNet with caching.
    
    Args:
        model: DRUNet model (in evaluation mode)
        noisy_image: Noisy image as numpy array [H, W] in range [0, 1]
        device: torch device
        noise_level: Noise level in normalized [0, 1] range (same as sigma)
                     Must be a multiple of 0.05
    
    Returns:
        Denoised image as numpy array [H, W]
    """
    # Round noise_level to nearest 0.05 to handle floating point precision
    rounded_noise_level = round(noise_level / 0.05) * 0.05
    
    # Assert noise_level is a multiple of 0.05 (within floating point tolerance)
    assert abs(noise_level - rounded_noise_level) < 1e-10, \
        f"noise_level must be a multiple of 0.05, got {noise_level}"
    
    noise_level = rounded_noise_level
    
    # Cache directory
    cache_dir = '/Users/tejasvikothapalli/Desktop/tejasvikothapalli.github.io/blogs/denoising/code/deeplearning_denoise_cache'
    os.makedirs(cache_dir, exist_ok=True)
    
    # Generate cache key based on image hash and noise level
    # Use a hash of the image array to create a unique identifier
    image_bytes = noisy_image.tobytes()
    image_hash = hashlib.md5(image_bytes).hexdigest()
    cache_key = f"{image_hash}_{noise_level:.2f}.png"
    cache_path = os.path.join(cache_dir, cache_key)
    
    # Check if cached version exists
    if os.path.exists(cache_path):
        # print(f"Loading cached denoised image from {cache_path}")
        # Load PNG image and convert back to float array
        cached_img = Image.open(cache_path)
        img_uint8 = np.array(cached_img, dtype=np.float32)
        
        # Load normalization parameters if they exist
        metadata_path = cache_path.replace('.png', '_metadata.txt')
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                img_min = float(f.readline().strip())
                img_max = float(f.readline().strip())
            # Denormalize back to original range
            if img_max > img_min:
                denoised_image = (img_uint8 / 255.0) * (img_max - img_min) + img_min
            else:
                denoised_image = img_uint8 / 255.0
        else:
            # Fallback: assume [0, 1] range
            denoised_image = img_uint8 / 255.0
        
        return denoised_image
    
    # Cache miss - compute denoising
    print(f"Computing denoising (not cached)")
    
    # DRUNet requires image + noise level map
    # Convert to tensor: [H, W] -> [1, 1, H, W]
    if len(noisy_image.shape) == 2:
        img_tensor = torch.from_numpy(noisy_image).float().unsqueeze(0).unsqueeze(0)
    else:
        img_tensor = torch.from_numpy(noisy_image).float()
        if len(img_tensor.shape) == 3:
            img_tensor = img_tensor.unsqueeze(0)
    
    # Create noise level map (same size as image)
    # noise_level should already be in normalized [0, 1] range
    noise_level_map = torch.FloatTensor([noise_level]).repeat(1, 1, img_tensor.shape[2], img_tensor.shape[3])
    
    # Concatenate image and noise level map: [1, 1, H, W] + [1, 1, H, W] -> [1, 2, H, W]
    input_tensor = torch.cat([img_tensor, noise_level_map], dim=1)
    input_tensor = input_tensor.to(device)
    
    # Inference
    with torch.no_grad():
        # Use test_mode for better handling of different image sizes
        if img_tensor.size(2) % 8 == 0 and img_tensor.size(3) % 8 == 0:
            denoised_tensor = model(input_tensor)
        else:
            # Use test_mode for images not divisible by 8
            denoised_tensor = utils_model.test_mode(model, input_tensor, refield=64, mode=5)
    
    # Convert back to numpy: [1, 1, H, W] -> [H, W]
    denoised_image = denoised_tensor.cpu().numpy().squeeze()
    
    # Save to cache as PNG (lossless format for pixel fidelity)
    print(f"Saving denoised image to cache: {cache_path}")
    # Normalize to [0, 1] range for saving (preserve full dynamic range)
    # Find min/max to preserve relative values
    img_min = denoised_image.min()
    img_max = denoised_image.max()
    if img_max > img_min:
        # Normalize to [0, 1] then scale to [0, 255]
        normalized_img = (denoised_image - img_min) / (img_max - img_min)
        img_uint8 = (normalized_img * 255.0).astype(np.uint8)
    else:
        # Constant image
        img_uint8 = np.zeros_like(denoised_image, dtype=np.uint8)
    
    # Save as PNG (lossless)
    img_pil = Image.fromarray(img_uint8, mode='L')  # 'L' mode for grayscale
    img_pil.save(cache_path, 'PNG')
    
    # Store normalization parameters in a metadata file for reconstruction
    metadata_path = cache_path.replace('.png', '_metadata.txt')
    with open(metadata_path, 'w') as f:
        f.write(f"{img_min}\n{img_max}\n")
    
    return denoised_image


def get_band_estimator(prior_band, noise_band, bins, value_range):
    prior_hist_counts, prior_hist_bins = np.histogram(prior_band.flatten(), range=value_range, bins=bins)
    prior_hist_counts = prior_hist_counts + 0.1
    noise_hist_counts, _ = np.histogram(noise_band.flatten(), range=value_range, bins=bins)
    noise_hist_counts = noise_hist_counts + 2.22e-16

    prior_hist_bin_centers = (prior_hist_bins[:-1] + prior_hist_bins[1:]) / 2
    denominator = np.convolve(prior_hist_counts, noise_hist_counts, mode='same')
    numerator = np.convolve(prior_hist_counts * prior_hist_bin_centers, noise_hist_counts, mode='same')
    estimator = numerator / denominator

    return lambda x: np.interp(x, prior_hist_bin_centers, estimator)


def coring_denoise(noisy_image, prior_image, sigma, value_range=(-.3, .3), bins=10000, 
                   high_freq_band_keys=None, pyramid_height=3, pyramid_order=3):
    """
    Apply coring denoising using steerable pyramid.
    
    Args:
        noisy_image: Noisy image [H, W] in [0, 1] range
        prior_image: Prior image [H, W] in [0, 1] range
        sigma: Noise level (normalized)
        value_range: Range for histogram computation
        bins: Number of bins for histogram
        high_freq_band_keys: List of frequency band keys to process
        pyramid_height: Height of steerable pyramid
        pyramid_order: Order of steerable pyramid
    
    Returns:
        Denoised image [H, W] in [0, 1] range
    """
    if high_freq_band_keys is None:
        high_freq_band_keys = ['residual_highpass', (0, 0), (0, 1), (0, 2), (0, 3)]
    
    noise_im = np.random.randn(noisy_image.shape[0], noisy_image.shape[1]) * sigma
    noise_pyr = pt.pyramids.SteerablePyramidFreq(noise_im, height=pyramid_height, order=pyramid_order)
    signal_pyr = pt.pyramids.SteerablePyramidFreq(noisy_image, height=pyramid_height, order=pyramid_order)
    prior_pyr = pt.pyramids.SteerablePyramidFreq(prior_image, height=pyramid_height, order=pyramid_order)
    
    signal_pyr_coeffs_original = signal_pyr.pyr_coeffs.copy()
    
    for key in high_freq_band_keys:
        prior_band = prior_pyr.pyr_coeffs[key]
        noise_band = noise_pyr.pyr_coeffs[key]
        estimator = get_band_estimator(prior_band, noise_band, bins, value_range)
        signal_pyr.pyr_coeffs[key] = estimator(signal_pyr.pyr_coeffs[key])
    
    coring_denoised_im = signal_pyr.recon_pyr()
    return coring_denoised_im


def compute_power_spectrum(image, sz):
    """
    Compute rotationally-averaged power spectrum.
    
    Args:
        image: Image [H, W]
        sz: Size (assumes square image)
    
    Returns:
        f1: Frequency array
        P: Power spectrum array
    """
    n = sz * sz
    fx, fy = np.meshgrid(np.arange(-sz / 2, sz / 2), np.arange(-sz / 2, sz / 2))
    f2 = fx**2 + fy**2
    rho = np.round(np.sqrt(f2))
    f1 = np.arange(1, int(sz / 2) + 1)
    ind = [None] * int(sz / 2)
    for r in range(1, int(sz / 2) + 1):
        ind[r - 1] = np.where(rho == r)
    
    imf = np.fft.fftshift(np.fft.fft2(image)) / np.sqrt(n)
    imfp = np.abs(imf) ** 2
    P = np.zeros(int(sz / 2))
    for r in range(1, int(sz / 2) + 1):
        P[r - 1] = np.mean(imfp[ind[r - 1]])
    
    return f1, P


# Load images
einstein_im = plt.imread('einstein.pgm').astype(float)
feynman_im = plt.imread('feynman.pgm').astype(float)
einstein_im = einstein_im / 255.0
feynman_im = feynman_im / 255.0

# Load DRUNet model (state-of-the-art from DPIR)
model, device, _ = load_drunet_model()

# Dimensions for power spectrum
sz = einstein_im.shape[0]  # assumes square
n = sz * sz

# Precompute frequency arrays for power spectrum
fx, fy = np.meshgrid(np.arange(-sz / 2, sz / 2), np.arange(-sz / 2, sz / 2))
f2 = fx**2 + fy**2
rho = np.round(np.sqrt(f2))
f1 = np.arange(1, int(sz / 2) + 1)
ind = [None] * int(sz / 2)
for r in range(1, int(sz / 2) + 1):
    ind[r - 1] = np.where(rho == r)

# Use a fixed noise field for reproducibility (so slider feels stable)
np.random.seed(42)
noise0 = np.random.randn(*einstein_im.shape)

# Compute dashed line (similar to denoise_wiener.py)
# Subtract mean and compute image variance
mu_im = float(np.mean(einstein_im))
im_centered = einstein_im - mu_im
sigma_im = float(np.sqrt(np.var(im_centered)))

# Compute k for dashed line
f20 = f2.copy()
f20[sz // 2, sz // 2] = 10**8  # to avoid divide by zero
k = n * sigma_im**2 / np.sum(1.0 / f20)
dashed_line = k / f1**2

def compute(sigma):
    """Compute all images and power spectra for a given sigma value."""
    # Add noise
    einstein_im_w_noise = einstein_im + sigma * noise0
    
    # Coring denoising
    coring_denoised = coring_denoise(einstein_im_w_noise, feynman_im, sigma)
    
    # Deep learning denoising (uses cache)
    dl_denoised = denoise_image(model, einstein_im_w_noise, device, noise_level=sigma)
    
    # Compute power spectra for all images
    f1_orig, P_orig = compute_power_spectrum(einstein_im, sz)
    f1_noisy, P_noisy = compute_power_spectrum(einstein_im_w_noise, sz)
    f1_coring, P_coring = compute_power_spectrum(coring_denoised, sz)
    f1_dl, P_dl = compute_power_spectrum(dl_denoised, sz)
    
    return einstein_im_w_noise, coring_denoised, dl_denoised, P_orig, P_noisy, P_coring, P_dl

# Create figure with subplots (2x4 layout) - interactive mode
plt.ion()
fig = plt.figure(figsize=(16, 8), dpi=100)

# Row 1: Images
ax1 = plt.subplot(2, 4, 1)
h1 = ax1.imshow(einstein_im, cmap="gray")
ax1.axis("image")
ax1.set_title("original image")

ax2 = plt.subplot(2, 4, 2)
h2 = ax2.imshow(einstein_im, cmap="gray")
ax2.axis("image")
ax2.set_title("noisy image (σ=0.05)")

ax3 = plt.subplot(2, 4, 3)
h3 = ax3.imshow(einstein_im, cmap="gray")
ax3.axis("image")
ax3.set_title("coring denoised")

ax4 = plt.subplot(2, 4, 4)
h4 = ax4.imshow(einstein_im, cmap="gray")
ax4.axis("image")
ax4.set_title("deep learning denoised")

x_max = (10**2)/2
# Row 2: Power spectra
ax5 = plt.subplot(2, 4, 5)
ax5.loglog(f1, dashed_line, "k--", label='k/f²')
(hp_orig,) = ax5.loglog(f1, np.ones_like(f1), linewidth=2)
ax5.set_xlim(None, x_max)
ax5.set_title("power spectrum (original)")
ax5.set_xlabel("Frequency")
ax5.set_ylabel("Power")

ax6 = plt.subplot(2, 4, 6)
ax6.loglog(f1, dashed_line, "k--", label='k/f²')
(hp_noisy,) = ax6.loglog(f1, np.ones_like(f1), linewidth=2)
ax6.set_xlim(None, x_max)
ax6.set_title("power spectrum (noisy)")
ax6.set_xlabel("Frequency")
ax6.set_ylabel("Power")

ax7 = plt.subplot(2, 4, 7)
ax7.loglog(f1, dashed_line, "k--", label='k/f²')
(hp_coring,) = ax7.loglog(f1, np.ones_like(f1), linewidth=2)
ax7.set_xlim(None, x_max)
ax7.set_title("power spectrum (coring)")
ax7.set_xlabel("Frequency")
ax7.set_ylabel("Power")

ax8 = plt.subplot(2, 4, 8)
ax8.loglog(f1, dashed_line, "k--", label='k/f²')
(hp_dl,) = ax8.loglog(f1, np.ones_like(f1), linewidth=2)
ax8.set_xlim(None, x_max)
ax8.set_title("power spectrum (deep learning)")
ax8.set_xlabel("Frequency")
ax8.set_ylabel("Power")

# Slider (update only on release, not while dragging)
plt.subplots_adjust(bottom=0.22, wspace=0.25, hspace=0.25)
ax_slider = plt.axes([0.15, 0.08, 0.70, 0.05])
s_sigma = Slider(ax_slider, "sigma", 0.05, 1.0, valinit=0.05, valstep=0.05)

dragging = {"active": False}

def on_press(event):
    """Track when slider is being dragged."""
    if event.inaxes == ax_slider:
        dragging["active"] = True

def on_release(event):
    """Update all plots only when slider is released."""
    if not dragging["active"]:
        return
    dragging["active"] = False
    sigma = float(s_sigma.val)
    noisy, coring, dl, P_orig, P_noisy, P_coring, P_dl = compute(sigma)
    
    # Update images
    h2.set_data(noisy)
    ax2.set_title(f"noisy image (σ={sigma:.2f})")
    h3.set_data(coring)
    h4.set_data(dl)
    
    # Update power spectra
    hp_orig.set_ydata(P_orig)
    hp_noisy.set_ydata(P_noisy)
    hp_coring.set_ydata(P_coring)
    hp_dl.set_ydata(P_dl)
    
    fig.canvas.draw_idle()

# Connect mouse events to update only on release
fig.canvas.mpl_connect("button_press_event", on_press)
fig.canvas.mpl_connect("button_release_event", on_release)

# Initial render (compute and display initial state)
sigma = float(s_sigma.val)
noisy, coring, dl, P_orig, P_noisy, P_coring, P_dl = compute(sigma)
h2.set_data(noisy)
ax2.set_title(f"noisy image (σ={sigma:.2f})")
h3.set_data(coring)
h4.set_data(dl)
hp_orig.set_ydata(P_orig)
hp_noisy.set_ydata(P_noisy)
hp_coring.set_ydata(P_coring)
hp_dl.set_ydata(P_dl)
fig.canvas.draw_idle()

plt.show(block=True)
#%%
