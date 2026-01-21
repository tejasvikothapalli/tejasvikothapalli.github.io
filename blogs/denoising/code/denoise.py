# denoise.m - denoise an image using 1/f^2 prior
#
# assumes im dimensions square and even
# pixels [0 255], colormap gray

import numpy as np
import matplotlib.pyplot as plt
from scipy.io import loadmat

# set image and size
mat_data = loadmat('einstein.mat')
im0 = mat_data['im0']
im = im0
sz = im.shape[0]
npix = sz**2

# image mean and variance
mu = np.mean(im)
sigma2_im = np.var(im)

# SNR
SNR = 0.5

# noisy zero-mean image
sigma2_noise = sigma2_im/SNR
noise = np.sqrt(sigma2_noise)*np.random.randn(sz, sz)
nim = im-mu+noise

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
k = np.sum((im-mu)**2)/np.sum(1.0/rho2_0)
lambda_ = (rho2/k)

# normalized Fourier transform of noisy image and power spectrum
imf = np.fft.fftshift(np.fft.fft2(nim)) / np.sqrt(npix)
imfp = np.abs(imf)**2
nimf = imf.copy()

# step size
eta = 0.1
T = 1.0     # temperature for Langevin

# colormap 
plt.ion()
plt.set_cmap('gray')

# display original image
plt.subplot(1, 4, 1)
plt.imshow(im, cmap='gray'); plt.axis('image')

# display noisy image
plt.subplot(1, 4, 2)
plt.imshow(mu+nim, cmap='gray'); plt.axis('image')

# display image estimate
plt.subplot(1, 4, 3)
h = plt.imshow(mu+nim, cmap='gray'); plt.axis('image')

# plot rotionally averaged power spectrum
plt.subplot(1, 4, 4)
ind = [None] * int(sz/2)
P = np.zeros(int(sz/2))
for r in range(1, int(sz/2) + 1):
    ind[r-1] = np.where(rho == r)
    P[r-1] = np.mean(imfp[ind[r-1]])
plt.loglog(f1, k/f1**2, 'k--')
hp, = plt.loglog(f1, P, linewidth=2)

try:
    while True:
        
        # make a gradient step in Fourier domain
        H = (1/sigma2_noise+lambda_)
        gradimf = -nimf/sigma2_noise + H*imf
        dimf = -(eta/H)*gradimf + np.sqrt(2*T*eta / H) * np.random.randn(sz, sz)
        imf = imf + dimf
        imfp = np.abs(imf)**2
        
        # reconstruction
        imh = np.real(np.sqrt(npix)*np.fft.ifft2(np.fft.ifftshift(imf)))
    
        # update estimated image display
        h.set_data(mu+imh)
        plt.subplot(1, 4, 3)
        plt.title('E=%f' % np.sum(lambda_*imfp))
    
        # update power spectrum plot
        for r in range(1, int(sz/2) + 1):
            P[r-1] = np.mean(imfp[ind[r-1]])
        hp.set_ydata(P)
    
        plt.pause(0.01)
    
except KeyboardInterrupt:
    print("\nInterrupted by user")
    plt.ioff()
    plt.show()