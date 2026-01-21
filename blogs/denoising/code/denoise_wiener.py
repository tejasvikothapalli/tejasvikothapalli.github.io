import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider
from scipy.io import loadmat

# Load image from .mat file
mat_data = loadmat("einstein.mat")
im0 = mat_data["im0"].astype(float)
im0 = im0 / 255.0
print(f"Loaded image from einstein.mat: {im0.shape}")

# Dimensions
szy, szx = im0.shape
n = szx * szy

# Subtract mean and compute image variance
mu_im = float(np.mean(im0))
im = im0 - mu_im
sigma_im = float(np.sqrt(np.var(im)))

# fx, fy coordinate arrays (centered, as in the original notebook code)
fx, fy = np.meshgrid(np.arange(-szx / 2, szx / 2), np.arange(-szy / 2, szy / 2))
f2 = fx**2 + fy**2

# compute k (fix: 10**8, not 10^8)
f20 = f2.copy()
f20[szy // 2, szx // 2] = 10**8  # to avoid divide by zero
k = n * sigma_im**2 / np.sum(1.0 / f20)

# Precompute indices for rotationally-averaged power spectrum (match denoise.py structure)
sz = szx  # assumes square
rho = np.round(np.sqrt(f2))
f1 = np.arange(1, int(sz / 2) + 1)
ind = [None] * int(sz / 2)
for r in range(1, int(sz / 2) + 1):
    ind[r - 1] = np.where(rho == r)

# Use a fixed noise field so the slider feels stable (only strength changes).
noise0 = np.random.randn(*im.shape)

f2_sorted = np.sort(f2.flatten())
f_sorted = np.sqrt(f2_sorted)

def compute(sigma_n):
    nim = im + sigma_n * noise0

    # Compute normalized Fourier coefficients (match denoise.py normalization)
    imf = np.fft.fftshift(np.fft.fft2(nim)) / np.sqrt(n)

    # Wiener attenuation
    a = 1.0 / (1.0 + (f2 / k) * (sigma_n**2))
    imfhat = a * imf

    # Reconstruction (match denoise.py inverse normalization / shifting)
    imhat = np.real(np.sqrt(n) * np.fft.ifft2(np.fft.ifftshift(imfhat)))

    a_sorted = 1.0 / (1.0 + (f2_sorted / k) * (sigma_n**2))
    # Rotationally averaged power spectra (noisy + denoised), like denoise.py
    imfp = np.abs(imf) ** 2
    imfhatp = np.abs(imfhat) ** 2
    P_noisy = np.zeros(int(sz / 2))
    P_denoised = np.zeros(int(sz / 2))
    for r in range(1, int(sz / 2) + 1):
        P_noisy[r - 1] = np.mean(imfp[ind[r - 1]])
        P_denoised[r - 1] = np.mean(imfhatp[ind[r - 1]])

    return (mu_im + nim), (mu_im + imhat), a_sorted, P_noisy, P_denoised

# Create figure with subplots (same layout as before)
plt.ion()
# Smaller default window so it fits on a typical laptop screen
fig = plt.figure(figsize=(11, 7.5), dpi=100)

ax1 = plt.subplot(2, 3, 1)
h1 = ax1.imshow(mu_im + im, cmap="gray")
ax1.axis("image")
ax1.set_title("original image")

ax2 = plt.subplot(2, 3, 2)
h2 = ax2.imshow(mu_im + im, cmap="gray")
ax2.axis("image")
ax2.set_title("noisy image (sigma_n=0.00)")

ax3 = plt.subplot(2, 3, 3)
h3 = ax3.imshow(mu_im + im, cmap="gray")
ax3.axis("image")
ax3.set_title("reconstruction")

ax4 = plt.subplot(2, 3, 4)
(h4,) = ax4.semilogx(f_sorted, np.zeros_like(f_sorted))
ax4.set_ylim(-0.1, 1.1)
ax4.set_xlabel("Frequency")
ax4.set_ylabel("Attenuation")

# Power spectra (match denoise.py style), placed below noisy and reconstruction
ax5 = plt.subplot(2, 3, 5)
ax5.loglog(f1, k / f1**2, "k--")
(hp_noisy,) = ax5.loglog(f1, np.ones_like(f1), linewidth=2)
ax5.set_title("power spectrum (noisy)")

ax6 = plt.subplot(2, 3, 6)
ax6.loglog(f1, k / f1**2, "k--")
(hp_denoised,) = ax6.loglog(f1, np.ones_like(f1), linewidth=2)
ax6.set_title("power spectrum (denoised)")

# Slider
# Leave enough room for the slider while keeping the figure compact
plt.subplots_adjust(bottom=0.22, wspace=0.25, hspace=0.25)
ax_slider = plt.axes([0.15, 0.08, 0.70, 0.05])
s_sigma = Slider(ax_slider, "sigma_n", 0.0, 1.5, valinit=0.05, valstep=0.01)

def on_change(val):
    sigma_n = float(s_sigma.val)
    nim_disp, imhat_disp, a_sorted, P_noisy, P_denoised = compute(sigma_n)
    h2.set_data(nim_disp)
    ax2.set_title(f"noisy image (sigma_n={sigma_n:.2f})")
    h3.set_data(imhat_disp)
    h4.set_ydata(a_sorted)
    hp_noisy.set_ydata(P_noisy)
    hp_denoised.set_ydata(P_denoised)
    fig.canvas.draw_idle()

s_sigma.on_changed(on_change)

# Initial render
on_change(s_sigma.val)
plt.show(block=True)