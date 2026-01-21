# fillin_deeplearning.py - fills in missing pixels using 1/f^2 prior + deep learning
#
# assumes im dimensions square and even
# pixels [0 255], colormap gray

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from scipy.io import loadmat
import torch
from PIL import Image
from simple_lama_inpainting import SimpleLama

# set image and size
mat_data = loadmat('einstein.mat')
im0 = mat_data['im0']
im = im0
sz = im.shape[0]
npix = sz**2

# mask of known pixels
mask = np.random.rand(sz, sz) < 0.02
mask[:, 0] = 0
mask[:, sz - 1] = 0
mask[0, :] = 0
mask[sz - 1, :] = 0

# initalize image estimate to known pixels minus mean
mu = np.mean(im)
imh = (im - mu) * mask
imh = (im - mu) * mask + 40 * np.random.randn(sz, sz) * (1 - mask)

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
k = np.sum((im - mu)**2) / np.sum(1.0 / rho2_0)
lambda_ = (rho2 / k)

# normalized Fourier transform of masked image and power spectrum
imf = np.fft.fftshift(np.fft.fft2(imh)) / np.sqrt(npix)
imfp = np.abs(imf)**2

# step size
eta = 100
T = 1     # temperature for Langevin
sqrt2Teta = np.sqrt(2 * T * eta)

# Initialize LaMa model
original_jit_load = torch.jit.load
def jit_load_cpu(path, map_location=None, **kwargs):
    return original_jit_load(path, map_location='cpu', **kwargs)
torch.jit.load = jit_load_cpu
device = torch.device('cpu')
lama_model = SimpleLama(device=device)
torch.jit.load = original_jit_load

# Compute LaMa inpainting
print("Computing LaMa inpainting...")
im_uint8 = np.clip(im, 0, 255).astype(np.uint8)
img_pil = Image.fromarray(im_uint8, mode='L').convert('RGB')
mask_for_lama = (~mask * 255).astype(np.uint8)
mask_pil = Image.fromarray(mask_for_lama, mode='L')
result_pil = lama_model(img_pil, mask_pil)
result_rgb = np.array(result_pil)
im_dl = np.mean(result_rgb, axis=2).astype(np.float32)
im_dl = im_dl - mu
print("LaMa inpainting complete")

# colormap with color for missing pixels as first entry, followed by gray levels
gray = plt.cm.gray(np.linspace(0, 1, 256))
mpcolor = np.array([0, 0, 1])
cmap = np.vstack([mpcolor, gray[:, :3]])
cmap = ListedColormap(cmap)
plt.ion()
plt.set_cmap(cmap)

# display original image
plt.subplot(1, 5, 1)
plt.imshow(im + 2, cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
plt.axis('image')

# display image with pixels deleted
plt.subplot(1, 5, 2)
plt.imshow(mask * (im + 2), cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
plt.axis('image')

# display LaMa inpainting result
plt.subplot(1, 5, 3)
h_dl = plt.imshow(im_dl + mu + 2, cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
plt.axis('image')

# display image estimate (fillin result)
plt.subplot(1, 5, 4)
h = plt.imshow(imh + mu + 2, cmap=cmap, vmin=0, vmax=257, interpolation='nearest')
plt.axis('image')

# plot rotionally averaged power spectrum
plt.subplot(1, 5, 5)
ind = [None] * int(sz/2)
P = np.zeros(int(sz/2))
for r in range(1, int(sz/2) + 1):
    ind[r - 1] = np.where(rho == r)
    P[r - 1] = np.mean(imfp[ind[r - 1]])
plt.loglog(f1, k / f1**2, 'k--')
hp, = plt.loglog(f1, P, linewidth=2)

try:
    while True:
        
        # make a gradient step in missing pixels and update Fourier transform
        gradim = np.real(np.fft.ifft2(np.fft.ifftshift(lambda_ * imf)) * np.sqrt(npix))
        dim = -eta * gradim #+ sqrt2Teta*np.random.randn(sz, sz)
        imh = imh + (1 - mask) * dim
        imf = np.fft.fftshift(np.fft.fft2(imh)) / np.sqrt(npix)
        imfp = np.abs(imf)**2

        # update estimated image display
        h.set_data(imh + mu + 2)
        plt.subplot(1, 5, 4)
        plt.title('E=%f' % np.sum(lambda_ * imfp))

        # update power spectrum plot
        for r in range(1, int(sz/2) + 1):
            P[r - 1] = np.mean(imfp[ind[r - 1]])
        hp.set_ydata(P)

        plt.pause(0.01)

except KeyboardInterrupt:
    print("\nInterrupted by user")
    plt.ioff()
    plt.show()
