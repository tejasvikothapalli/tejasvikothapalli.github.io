# buildim.m - build up image one Fourier component at a time
#
# assumes im defined, even dimensions and square, pixel vals [0 255]
#
# colormap gray

import numpy as np
import matplotlib.pyplot as plt
from scipy.io import loadmat


# set image
mat_data = loadmat('einstein.mat')
im0 = mat_data['im0']
im = im0

# dimensions
szy, szx = im.shape
n = szx * szy

# compute normalized Fourier coefficients
imf = np.fft.fftshift(np.fft.fft2(im)) / n

# x,y coordinate arrays
x, y = np.meshgrid(np.arange(0, szx), np.arange(0, szy))

# extract and save dc component
dc = np.real(imf[int(szy/2), int(szx/2)])
imf[int(szy/2), int(szx/2)] = 0

# sort Fourier coefficients by largest to smallest magnitudes
# (only over half of the Fourier plane to remove redundancy due to hermitian symmetry)
imf_flat = imf.flatten(order='F')
a_si = np.argsort(np.abs(imf_flat[0:int(n/2 + szy/2)]))[::-1]
a = np.sort(np.abs(imf_flat[0:int(n/2 + szy/2)]))[::-1]
si = a_si

# initialize reconstruction
imhat = dc * np.ones((szy, szx))

# initialize displays
plt.ion()
plt.set_cmap('gray')

plt.subplot(2, 3, 1)
plt.imshow(im, vmin=0, vmax=255)
plt.axis('image')
plt.title('original')

plt.subplot(2, 3, 2)
hi = plt.imshow(imhat, vmin=0, vmax=255)
plt.axis('image')
plt.title('reconstruction')

plt.subplot(2, 3, 3)
hg = plt.imshow(imhat, vmin=0, vmax=255)
plt.axis('image')

plt.subplot(2, 3, 6)
hgf = plt.imshow(0.5 * np.ones((szy, szx)), vmin=-1, vmax=1)
plt.axis('image')
plt.title('full contrast')

plt.subplot(2, 3, 5)
plt.loglog([1, szx/2], 1.0/np.array([1, szx/2]), 'k--')
ha, = plt.loglog([], [], marker='.', linestyle='none')
ax_a = plt.gca()

r_list = []
amp_list = []
print('total n/2:', int(n/2))
try:
    # loop over sorted Fourier coefficients
    for i in range(0, int(n/2)):

        # get frequency coordinates
        fy = np.mod(si[i], szy) - szy/2
        fx = np.floor(si[i] / szy) - szx/2

        # render Fourier component and add to reconstruction
        g = 2 * np.real(imf_flat[si[i]] * np.exp(1j * 2 * np.pi * (fx * x / szx + fy * y / szy)))
        imhat = imhat + g

        # show reconstruction
        hi.set_data(imhat)

        # show this Fourier component
        hg.set_data(dc + g)
        plt.subplot(2, 3, 3)
        plt.title('i=%d, a=%3.2f' % (i + 1, a[i]))
        hgf.set_data(g / (2 * np.abs(imf_flat[si[i]])))

        # plot on amplitude spectrum
        r_list.append(np.sqrt(fx**2 + fy**2))
        amp_list.append(2 * np.abs(imf_flat[si[i]]))
        ha.set_data(r_list, amp_list)
        ax_a.relim()
        ax_a.autoscale_view()

        plt.draw()
        plt.pause(0.001)

except KeyboardInterrupt:
    print("\nInterrupted by user")
    plt.ioff()
    plt.show()


