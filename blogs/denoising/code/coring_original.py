#%%
import matplotlib.pyplot as plt
import numpy as np
import pyrtools as pt
from scipy.signal import wiener
from tqdm import tqdm
from PSNR import PSNR
#https://cs.nyu.edu/~fergus/teaching/comp_photo/assign2.pdf



#%%
def get_band_estimator(prior_band, noise_band, bins, value_range):
    prior_hist_counts, prior_hist_bins = np.histogram(prior_band.flatten(), range =value_range, bins= bins)
    prior_hist_counts = prior_hist_counts + 0.1
    noise_hist_counts, _ = np.histogram(noise_band.flatten(), range =value_range, bins= bins)
    noise_hist_counts = noise_hist_counts + 2.22e-16

    prior_hist_bin_centers = (prior_hist_bins[:-1] + prior_hist_bins[1:]) / 2
    denominator = np.convolve(prior_hist_counts, noise_hist_counts, mode='same')
    numerator = np.convolve(prior_hist_counts * prior_hist_bin_centers, noise_hist_counts, mode='same')
    estimator = numerator / denominator

    return lambda x: np.interp(x, prior_hist_bin_centers, estimator)

def show_coring_function_and_histograms(estimator, frequency_key, prior_pyr, noise_pyr, signal_pyr, signal_pyr_coeffs_original, value_range):
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))

    bins_for_histograms = 100

    axes[0,0].hist(prior_pyr.pyr_coeffs[frequency_key].flatten(), range =value_range, bins= bins_for_histograms)
    axes[0,0].set_title('Original Feynman Image (prior)')

    axes[0,2].hist(noise_pyr.pyr_coeffs[frequency_key].flatten(), range =value_range, bins= bins_for_histograms)
    axes[0,2].set_title('Noise Band')

    axes[1,0].hist(signal_pyr_coeffs_original[frequency_key].flatten(), range =value_range, bins= bins_for_histograms)
    axes[1,0].set_title('Einstein Image with Noise (signal)')

    axes[1,1].hist(signal_pyr.pyr_coeffs[frequency_key].flatten(), range =value_range, bins= bins_for_histograms)
    axes[1,1].set_title('Coring Denoised Image')


    observed_value = np.linspace(value_range[0], value_range[1], bins_for_histograms)
    axes[1,2].plot(observed_value, estimator(observed_value))
    #plot line of unity as dashed
    axes[1,2].plot(observed_value, observed_value, '--')
    axes[1,2].set_title('Coring Function')
    plt.show()

def show_images(feynman_im, einstein_im, noise_im, einstein_im_w_noise, coring_denoised_im, weiner_denoised_im):
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    axes[0,0].imshow(feynman_im, cmap='gray')
    axes[0,0].set_title('Original Feynman Image')
    axes[0,1].imshow(einstein_im, cmap='gray')
    axes[0,1].set_title('Original Einstein Image')
    axes[0,2].imshow(noise_im, cmap='gray')
    axes[0,2].set_title('Noise Image')
    axes[1,0].imshow(einstein_im_w_noise, cmap='gray')
    axes[1,0].set_title(f'Einstein Image with Noise, PSNR = {PSNR(einstein_im, einstein_im_w_noise):.2f} dB')
    axes[1,1].imshow(coring_denoised_im, cmap='gray')
    axes[1,1].set_title(f'Coring Denoised Image, PSNR = {PSNR(einstein_im, coring_denoised_im):.2f} dB')
    axes[1,2].imshow(weiner_denoised_im, cmap='gray')
    axes[1,2].set_title(f'Weiner Denoised Image, PSNR = {PSNR(einstein_im, weiner_denoised_im):.2f} dB')
    plt.show()
    print('Original PSNR: ', PSNR(einstein_im, einstein_im_w_noise))
    print('Coring PSNR: ', PSNR(einstein_im, coring_denoised_im))
    print('Weiner PSNR: ', PSNR(einstein_im, weiner_denoised_im))

#%%
einstein_im = plt.imread('einstein.pgm').astype(float)
# feynman_im = plt.imread('feynman.pgm').astype(float)
feynman_im = einstein_im
einstein_im = einstein_im / 255
feynman_im = feynman_im / 255

high_freq_band_keys = ['residual_highpass', (0, 0), (0, 1), (0, 2), (0, 3)
, (1, 0), (1, 1), (1, 2), (1, 3), 
# (2, 0), (2, 1), (2, 2), (2, 3)
# ,'residual_lowpass'
]

value_range = (-.3, .3)
sigma = 0.1
bins = 10000


einstein_im_w_noise = einstein_im + np.random.randn(einstein_im.shape[0], einstein_im.shape[1]) * sigma
noise_im = np.random.randn(einstein_im.shape[0], einstein_im.shape[1]) * sigma
noise_pyr = pt.pyramids.SteerablePyramidFreq(noise_im, height=3, order=3)
signal_pyr = pt.pyramids.SteerablePyramidFreq(einstein_im_w_noise, height=3, order=3)
prior_pyr = pt.pyramids.SteerablePyramidFreq(feynman_im, height=3, order=3)
estimators = []
signal_pyr_coeffs_original = signal_pyr.pyr_coeffs.copy()

for key in high_freq_band_keys:
    prior_band = prior_pyr.pyr_coeffs[key]
    noise_band = noise_pyr.pyr_coeffs[key]
    estimator = get_band_estimator(prior_band, noise_band, bins, value_range)
    
    signal_pyr.pyr_coeffs[key] = estimator(signal_pyr.pyr_coeffs[key])
    estimators.append(estimator)
    

ind_to_show = 1
show_coring_function_and_histograms(estimators[ind_to_show], high_freq_band_keys[ind_to_show], prior_pyr, noise_pyr, signal_pyr, signal_pyr_coeffs_original, value_range)

coring_denoised_im = signal_pyr.recon_pyr()
weiner_denoised_im = wiener(einstein_im_w_noise, (3, 3), sigma ** 2)

show_images(feynman_im, einstein_im, noise_im, einstein_im_w_noise, coring_denoised_im, weiner_denoised_im)

#%%

einstein_pyr = pt.pyramids.SteerablePyramidFreq(einstein_im, height=3, order=3)
pt.pyrshow(einstein_pyr.pyr_coeffs)

einstein_pyr = pt.pyramids.SteerablePyramidFreq(einstein_im_w_noise, height=3, order=3)
pt.pyrshow(einstein_pyr.pyr_coeffs)

sz = einstein_im.shape[0]
empty_image = np.zeros((sz,sz))
pyr = pt.pyramids.SteerablePyramidFreq(empty_image, height=3, order=3)

### Put an  impulse into the middle of each band:
for k, v in pyr.pyr_size.items():
    mid = (v[0]//2, v[1]//2)
#     print(lev, mid)
    pyr.pyr_coeffs[k][mid] = 1
# pt.pyrshow(pyr.pyr_coeffs, vrange='indep1');

# And take a look at the reconstruction of each band:
reconList = []
for k in pyr.pyr_coeffs.keys():
    if isinstance(k, tuple):
        reconList.append(pyr.recon_pyr(k[0], k[1]))
for k in ['residual_highpass', 'residual_lowpass']:
    reconList.append(pyr.recon_pyr(k))

pt.imshow(reconList, col_wrap=pyr.num_orientations, vrange='indep1')
# %%
