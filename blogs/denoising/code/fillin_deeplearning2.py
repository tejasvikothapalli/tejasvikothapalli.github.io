# fillin_deeplearning2.py - fills in missing pixels using 1/f^2 prior + RePaint (diffusion model)
#
# assumes im dimensions square and even
# pixels [0 255], colormap gray

import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend - no popup
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from scipy.io import loadmat
import torch
from PIL import Image
import os
import sys
import subprocess
import shutil
import yaml

# Add RePaint to path
REPAINT_DIR = os.path.join(os.path.dirname(__file__), 'RePaint')
sys.path.insert(0, REPAINT_DIR)

# set image and size
mat_data = loadmat('einstein.mat')
im0 = mat_data['im0']
im = im0
orig_sz = im.shape[0]

# RePaint requires 256x256 images, so resize
TARGET_SIZE = 256

# Resize image to 256x256
im_pil = Image.fromarray(im.astype(np.uint8), mode='L')
im_resized = im_pil.resize((TARGET_SIZE, TARGET_SIZE), Image.BILINEAR)
im_256 = np.array(im_resized)
sz = TARGET_SIZE
npix = sz**2

# mask of known pixels (True = known, False = unknown)
np.random.seed(42)  # for reproducibility
mask = np.random.rand(sz, sz) < 0.02
mask[:, 0] = 0
mask[:, sz - 1] = 0
mask[0, :] = 0
mask[sz - 1, :] = 0

# initalize image estimate to known pixels minus mean
mu = np.mean(im_256)
imh = (im_256 - mu) * mask
imh = (im_256 - mu) * mask + 40 * np.random.randn(sz, sz) * (1 - mask)

# frequency coordinates
f = np.arange(-sz/2, sz/2)
f_col = f[:, np.newaxis]
f_row = f[np.newaxis, :]
rho2 = f_col**2 + f_row**2
rho = np.round(np.sqrt(rho2))
f1 = np.arange(1, int(sz/2) + 1)

# compute k s.t. sum of pixel variances = k * sum of 1/f^2 variances
rho2_0 = rho2.copy()
rho2_0[int(sz/2), int(sz/2)] = 10**8  # to avoid divide by zero
k = np.sum((im_256 - mu)**2) / np.sum(1.0 / rho2_0)
lambda_ = (rho2 / k)

# normalized Fourier transform of masked image and power spectrum
imf = np.fft.fftshift(np.fft.fft2(imh)) / np.sqrt(npix)
imfp = np.abs(imf)**2

# step size
eta = 100
T = 1     # temperature for Langevin
sqrt2Teta = np.sqrt(2 * T * eta)

# ---- Setup RePaint ----
print("Setting up RePaint...")

# Create directories for RePaint
repaint_data_dir = os.path.join(REPAINT_DIR, 'data', 'datasets')
gt_dir = os.path.join(repaint_data_dir, 'gts', 'einstein')
mask_dir = os.path.join(repaint_data_dir, 'gt_keep_masks', 'einstein')
os.makedirs(gt_dir, exist_ok=True)
os.makedirs(mask_dir, exist_ok=True)

# Convert grayscale to RGB for RePaint (it expects 3-channel images)
im_rgb = np.stack([im_256, im_256, im_256], axis=-1)
img_pil = Image.fromarray(im_rgb.astype(np.uint8), mode='RGB')
img_pil.save(os.path.join(gt_dir, 'einstein.png'))

# RePaint mask: 255 = known (keep), 0 = unknown (inpaint)
mask_for_repaint = (mask * 255).astype(np.uint8)
mask_pil = Image.fromarray(mask_for_repaint, mode='L')
mask_pil.save(os.path.join(mask_dir, 'einstein.png'))

# Create config file for RePaint
config = {
    'attention_resolutions': '32,16,8',
    'class_cond': False,
    'diffusion_steps': 1000,
    'learn_sigma': True,
    'noise_schedule': 'linear',
    'num_channels': 256,
    'num_head_channels': 64,
    'num_heads': 4,
    'num_res_blocks': 2,
    'resblock_updown': True,
    'use_fp16': False,
    'use_scale_shift_norm': True,
    'classifier_scale': 4.0,
    'lr_kernel_n_std': 2,
    'num_samples': 1,
    'show_progress': True,
    'timestep_respacing': '10',  # Minimal: 10 steps for fastest inference
    'use_kl': False,
    'predict_xstart': False,
    'rescale_timesteps': False,
    'rescale_learned_sigmas': False,
    'classifier_use_fp16': False,
    'classifier_width': 128,
    'classifier_depth': 2,
    'classifier_attention_resolutions': '32,16,8',
    'classifier_use_scale_shift_norm': True,
    'classifier_resblock_updown': True,
    'classifier_pool': 'attention',
    'num_heads_upsample': -1,
    'channel_mult': '',
    'dropout': 0.0,
    'use_checkpoint': False,
    'use_new_attention_order': False,
    'clip_denoised': True,
    'use_ddim': False,
    'latex_name': 'RePaint',
    'method_name': 'Repaint',
    'image_size': 256,
    'model_path': './data/pretrained/celeba256_250000.pt',  # Use CelebA model for face-like images
    'name': 'einstein_inpaint',
    'inpa_inj_sched_prev': True,
    'n_jobs': 1,
    'print_estimated_vars': True,
    'inpa_inj_sched_prev_cumnoise': False,
    'schedule_jump_params': {
        't_T': 10,  # Minimal for fastest inference
        'n_sample': 1,
        'jump_length': 1,  # No resampling jumps
        'jump_n_sample': 1,  # No resampling
    },
    'data': {
        'eval': {
            'einstein_mask': {
                'mask_loader': True,
                'gt_path': './data/datasets/gts/einstein',
                'mask_path': './data/datasets/gt_keep_masks/einstein',
                'image_size': 256,
                'class_cond': False,
                'deterministic': True,
                'random_crop': False,
                'random_flip': False,
                'return_dict': True,
                'drop_last': False,
                'batch_size': 1,
                'return_dataloader': True,
                'offset': 0,
                'max_len': 1,
                'paths': {
                    'srs': './log/einstein_inpaint/inpainted',
                    'lrs': './log/einstein_inpaint/gt_masked',
                    'gts': './log/einstein_inpaint/gt',
                    'gt_keep_masks': './log/einstein_inpaint/gt_keep_mask',
                },
            },
        },
    },
}

config_path = os.path.join(REPAINT_DIR, 'confs', 'einstein_inpaint.yml')
with open(config_path, 'w') as f:
    yaml.dump(config, f, default_flow_style=False)

print("Config file created at:", config_path)

# Run RePaint with timeout
TIMEOUT_SECONDS = 900  # 15 minute timeout (RePaint is slow on CPU)
print(f"Running RePaint inpainting... (timeout: {TIMEOUT_SECONDS}s)")
try:
    result = subprocess.run(
        ['python', 'test.py', '--conf_path', 'confs/einstein_inpaint.yml'],
        cwd=REPAINT_DIR,
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS
    )
    print("RePaint stdout:", result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
    if result.returncode != 0:
        print("RePaint stderr:", result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr)
        print("RePaint failed with return code:", result.returncode)
    else:
        print("RePaint completed successfully")
except subprocess.TimeoutExpired:
    print(f"RePaint timed out after {TIMEOUT_SECONDS} seconds")
except Exception as e:
    print(f"RePaint failed with error: {e}")

# Load the result
result_dir = os.path.join(REPAINT_DIR, 'log', 'einstein_inpaint', 'inpainted')
result_files = []
if os.path.exists(result_dir):
    result_files = [f for f in os.listdir(result_dir) if f.endswith('.png')]

if result_files:
    result_path = os.path.join(result_dir, result_files[0])
    result_img = Image.open(result_path)
    result_rgb = np.array(result_img)
    # Convert to grayscale
    im_dl = np.mean(result_rgb, axis=2).astype(np.float32)
    im_dl = im_dl - mu
    print("RePaint result loaded from:", result_path)
else:
    print("No RePaint result found, using zeros as placeholder")
    im_dl = np.zeros((sz, sz))

# colormap with color for missing pixels as first entry, followed by gray levels
gray = plt.cm.gray(np.linspace(0, 1, 256))
mpcolor = np.array([0, 0, 1])
cmap = np.vstack([mpcolor, gray[:, :3]])
cmap = ListedColormap(cmap)

# Create figure
fig, axes = plt.subplots(1, 5, figsize=(20, 4))

# display original image
axes[0].imshow(im_256 + 2, cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
axes[0].axis('image')
axes[0].set_title('Original')

# display image with pixels deleted
axes[1].imshow(mask * (im_256 + 2), cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
axes[1].axis('image')
axes[1].set_title('Masked (2% pixels)')

# display RePaint inpainting result
axes[2].imshow(im_dl + mu + 2, cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
axes[2].axis('image')
axes[2].set_title('RePaint Result')

# display image estimate (fillin result from gradient descent)
# Run a few iterations of gradient descent
print("Running gradient descent for 1/f^2 prior...")
for i in range(500):
    gradim = np.real(np.fft.ifft2(np.fft.ifftshift(lambda_ * imf)) * np.sqrt(npix))
    dim = -eta * gradim
    imh = imh + (1 - mask) * dim
    imf = np.fft.fftshift(np.fft.fft2(imh)) / np.sqrt(npix)
    imfp = np.abs(imf)**2

axes[3].imshow(imh + mu + 2, cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
axes[3].axis('image')
axes[3].set_title('1/f² Prior (GD)')

# plot rotationally averaged power spectrum
ind = [None] * int(sz/2)
P = np.zeros(int(sz/2))
for r in range(1, int(sz/2) + 1):
    ind[r - 1] = np.where(rho == r)
    P[r - 1] = np.mean(imfp[ind[r - 1]])
axes[4].loglog(f1, k / f1**2, 'k--', label='1/f²')
axes[4].loglog(f1, P, linewidth=2, label='Estimated')
axes[4].set_title('Power Spectrum')
axes[4].legend()

plt.tight_layout()
plt.savefig('fillin_deeplearning2_result.png', dpi=150)
print("Result saved to fillin_deeplearning2_result.png")

