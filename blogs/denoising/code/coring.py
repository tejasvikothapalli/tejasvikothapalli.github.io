#%%
import matplotlib.pyplot as plt
import numpy as np
import pyrtools as pt
from scipy.signal import wiener
from matplotlib.widgets import Slider
# https://cs.nyu.edu/~fergus/teaching/comp_photo/assign2.pdf


#%%
def PSNR(A, B):
    """
    PURPOSE: To find the PSNR (peak signal-to-noise ratio) between two
             intensity images A and B, each having values in the interval
             [0,1]. The answer is in decibels (dB).
    
    SYNOPSIS: PSNR(A,B)
    """
    if np.array_equal(A, B):
        raise ValueError("Images are identical: PSNR has infinite value")

    A = np.clip(A, 0, 1)
    B = np.clip(B, 0, 1)
    Error = (A - B) ** 2
    decibels = 20 * np.log10(1 / (np.sqrt(np.mean(Error.flatten()))))
    return decibels


#%%
einstein_im = plt.imread("einstein.pgm").astype(float)
feynman_im = plt.imread("feynman.pgm").astype(float)
einstein_im = einstein_im / 255
feynman_im = feynman_im / 255


#%%
def get_band_estimator(prior_band, noise_band, bins):
    prior_hist_counts, prior_hist_bins = np.histogram(prior_band.flatten(), range=value_range, bins=bins)
    prior_hist_counts = prior_hist_counts + 0.1
    noise_hist_counts, _ = np.histogram(noise_band.flatten(), range=value_range, bins=bins)
    noise_hist_counts = noise_hist_counts + 2.22e-16

    prior_hist_bin_centers = (prior_hist_bins[:-1] + prior_hist_bins[1:]) / 2
    denominator = np.convolve(prior_hist_counts, noise_hist_counts, mode="same")
    numerator = np.convolve(prior_hist_counts * prior_hist_bin_centers, noise_hist_counts, mode="same")
    estimator = numerator / denominator

    return lambda x: np.interp(x, prior_hist_bin_centers, estimator)


#%%
high_freq_band_keys = ["residual_highpass", (0, 0), (0, 1), (0, 2), (0, 3)]
value_range = (-0.3, 0.3)
bins = 10000  # match coring_original.py
sigma0 = 0.02
ind_to_show = 0


def show_coring_function_and_histograms(
    estimator,
    frequency_key,
    prior_pyr,
    noise_pyr,
    signal_pyr,
    signal_pyr_coeffs_original,
    axes=None,
):
    # Same layout/content as coring_original.py; updates provided axes in-place.
    if axes is None:
        raise ValueError("axes must be provided (2x3 array)")

    for ax in axes.flatten():
        ax.cla()

    bins_for_histograms = 100

    axes[0, 0].hist(prior_pyr.pyr_coeffs[frequency_key].flatten(), range=value_range, bins=bins_for_histograms)
    axes[0, 0].set_title("Original Feynman Image (prior)")

    axes[0, 2].hist(noise_pyr.pyr_coeffs[frequency_key].flatten(), range=value_range, bins=bins_for_histograms)
    axes[0, 2].set_title("Noise Band")

    axes[1, 0].hist(signal_pyr_coeffs_original[frequency_key].flatten(), range=value_range, bins=bins_for_histograms)
    axes[1, 0].set_title("Einstein Image with Noise (signal)")

    axes[1, 1].hist(signal_pyr.pyr_coeffs[frequency_key].flatten(), range=value_range, bins=bins_for_histograms)
    axes[1, 1].set_title("Coring Denoised Image")

    observed_value = np.linspace(-0.3, 0.3, bins)
    axes[1, 2].plot(observed_value, estimator(observed_value))
    axes[1, 2].plot(observed_value, observed_value, "--")
    axes[1, 2].set_title("Coring Function")

    return axes


def compute_for_sigma(sigma, prior_pyr):
    # Match coring_original.py exactly (new noise each time).
    einstein_im_w_noise = einstein_im + np.random.randn(einstein_im.shape[0], einstein_im.shape[1]) * sigma
    noise_im = np.random.randn(einstein_im.shape[0], einstein_im.shape[1]) * sigma
    noise_pyr = pt.pyramids.SteerablePyramidFreq(noise_im, height=3, order=3)
    signal_pyr = pt.pyramids.SteerablePyramidFreq(einstein_im_w_noise, height=3, order=3)

    signal_pyr_coeffs_original = signal_pyr.pyr_coeffs.copy()
    estimators = []

    for key in high_freq_band_keys:
        prior_band = prior_pyr.pyr_coeffs[key]
        noise_band = noise_pyr.pyr_coeffs[key]
        estimator = get_band_estimator(prior_band, noise_band, bins)
        signal_pyr.pyr_coeffs[key] = estimator(signal_pyr.pyr_coeffs[key])
        estimators.append(estimator)

    coring_denoised_im = signal_pyr.recon_pyr()
    weiner_denoised_im = wiener(einstein_im_w_noise, (3, 3), sigma**2)

    return {
        "einstein_im_w_noise": einstein_im_w_noise,
        "noise_im": noise_im,
        "noise_pyr": noise_pyr,
        "signal_pyr": signal_pyr,
        "signal_pyr_coeffs_original": signal_pyr_coeffs_original,
        "estimators": estimators,
        "coring_denoised_im": coring_denoised_im,
        "weiner_denoised_im": weiner_denoised_im,
    }


def main():
    # Fixed prior (same as coring_original.py)
    prior_pyr = pt.pyramids.SteerablePyramidFreq(feynman_im, height=3, order=3)

    # Initial compute
    out = compute_for_sigma(sigma0, prior_pyr)

    # Single window: stack the two original 2x3 figures vertically + add a slider row.
    fig = plt.figure(figsize=(15, 20))
    gs = fig.add_gridspec(5, 3, height_ratios=[1, 1, 1, 1, 0.12])

    # Top: histogram/coring-function block (original layout)
    axes_hist = np.empty((2, 3), dtype=object)
    for r in range(2):
        for c in range(3):
            axes_hist[r, c] = fig.add_subplot(gs[r, c])

    # Bottom: image-comparison block (original layout)
    axes_img = np.empty((2, 3), dtype=object)
    for r in range(2):
        for c in range(3):
            axes_img[r, c] = fig.add_subplot(gs[r + 2, c])

    # Make axes look like the original scripts
    for ax in axes_img.flatten():
        ax.axis("image")

    # Render histogram/coring-function block
    show_coring_function_and_histograms(
        out["estimators"][ind_to_show],
        high_freq_band_keys[ind_to_show],
        prior_pyr,
        out["noise_pyr"],
        out["signal_pyr"],
        out["signal_pyr_coeffs_original"],
        axes=axes_hist,
    )

    # Render image block
    axes_img[0, 0].imshow(feynman_im, cmap="gray")
    axes_img[0, 0].set_title("Original Feynman Image")
    axes_img[0, 1].imshow(einstein_im, cmap="gray")
    axes_img[0, 1].set_title("Original Einstein Image")
    h_noise = axes_img[0, 2].imshow(out["noise_im"], cmap="gray")
    axes_img[0, 2].set_title("Noise Image")

    h_noisy = axes_img[1, 0].imshow(out["einstein_im_w_noise"], cmap="gray")
    h_coring = axes_img[1, 1].imshow(out["coring_denoised_im"], cmap="gray")
    h_weiner = axes_img[1, 2].imshow(out["weiner_denoised_im"], cmap="gray")

    def update_titles():
        axes_img[1, 0].set_title(
            f"Einstein Image with Noise, PSNR = {PSNR(einstein_im, out['einstein_im_w_noise']):.2f} dB"
        )
        axes_img[1, 1].set_title(
            f"Coring Denoised Image, PSNR = {PSNR(einstein_im, out['coring_denoised_im']):.2f} dB"
        )
        axes_img[1, 2].set_title(
            f"Weiner Denoised Image, PSNR = {PSNR(einstein_im, out['weiner_denoised_im']):.2f} dB"
        )

    update_titles()

    # Slider row (spans full width)
    ax_slider = fig.add_subplot(gs[4, :])
    s_sigma = Slider(ax_slider, "sigma", 0.0, 1.0, valinit=sigma0, valstep=0.001)

    dragging = {"active": False}

    def on_press(event):
        if event.inaxes == ax_slider:
            dragging["active"] = True

    def on_release(event):
        nonlocal out
        if not dragging["active"]:
            return
        dragging["active"] = False
        sigma = float(s_sigma.val)

        # Recompute everything like a fresh run of coring_original.py at this sigma
        out = compute_for_sigma(sigma, prior_pyr)

        # Update histogram/coring-function block
        show_coring_function_and_histograms(
            out["estimators"][ind_to_show],
            high_freq_band_keys[ind_to_show],
            prior_pyr,
            out["noise_pyr"],
            out["signal_pyr"],
            out["signal_pyr_coeffs_original"],
            axes=axes_hist,
        )

        # Update image block
        h_noise.set_data(out["noise_im"])
        h_noisy.set_data(out["einstein_im_w_noise"])
        h_coring.set_data(out["coring_denoised_im"])
        h_weiner.set_data(out["weiner_denoised_im"])
        update_titles()
        fig.canvas.draw_idle()

    fig.canvas.mpl_connect("button_press_event", on_press)
    fig.canvas.mpl_connect("button_release_event", on_release)

    plt.show(block=True)


if __name__ == "__main__":
    main()