"""
This code was adapted by Tejasvi Kothapalli from the matlab version written by Bruno Olshausen. 
buildim.py — build up an image one Fourier component at a time.

This keeps the same behavior as the older verbose version:
- a Matplotlib slider to jump to any k
- autoplay that steps k forward (pauses while you drag the slider)

The implementation is written in a single top-to-bottom flow (closer to buildim.m),
with one small “update artists” helper to avoid duplicated rendering code.
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgba
from matplotlib.widgets import Slider
from scipy.io import loadmat


def main():
    # set image
    im = loadmat("einstein.mat")["im0"]
    szy, szx = im.shape
    n = szx * szy
    n2 = n // 2

    # normalized Fourier coefficients + DC
    imf = np.fft.fftshift(np.fft.fft2(im)) / n
    dc = np.real(imf[szy // 2, szx // 2])
    imf[szy // 2, szx // 2] = 0

    # sort (match buildim.m half-plane indexing)
    imf_flat = imf.flatten(order="F")
    m = int(n / 2 + szy / 2)
    si = np.argsort(np.abs(imf_flat[:m]))[::-1][:n2]
    a = np.abs(imf_flat[si])

    # frequency coordinates + power points for spectrum plot
    row = np.mod(si, szy)
    col = np.floor(si / szy)
    fy_all = row - szy / 2
    fx_all = col - szx / 2
    r_all = np.sqrt(fx_all**2 + fy_all**2)

    f = np.arange(-szx / 2, szx / 2)
    rho2 = f[:, None] ** 2 + f[None, :] ** 2
    rho2_0 = rho2.copy()
    rho2_0[szx // 2, szx // 2] = 10**8
    mu = np.mean(im)
    k = np.sum((im - mu) ** 2) / np.sum(1.0 / rho2_0)

    # match denoise.py power normalization
    amp_all = np.abs((imf_flat * np.sqrt(n))[si]) ** 2

    # coordinate grids for rendering a sinusoid
    x, y = np.meshgrid(np.arange(szx), np.arange(szy))

    # ---- figure (same 2x3 layout as buildim.m) ----
    plt.ion()
    plt.set_cmap("gray")
    fig, ax = plt.subplots(2, 3, figsize=(10, 6))
    plt.subplots_adjust(bottom=0.22)

    ax[0, 0].imshow(im, vmin=0, vmax=255)
    ax[0, 0].axis("image")
    ax[0, 0].set_title("original")

    imhat = dc * np.ones((szy, szx))
    i_current = 0  # how many coefficients are included

    hi = ax[0, 1].imshow(imhat, vmin=0, vmax=255)
    ax[0, 1].axis("image")
    ax[0, 1].set_title("reconstruction")

    hg = ax[0, 2].imshow(imhat, vmin=0, vmax=255)
    ax[0, 2].axis("image")

    hgf = ax[1, 2].imshow(0.5 * np.ones((szy, szx)), vmin=-1, vmax=1)
    ax[1, 2].axis("image")
    ax[1, 2].set_title("full contrast")

    f1 = np.arange(1, szx // 2 + 1)
    ax[1, 1].loglog(f1, k / f1**2, "k--")
    ha, = ax[1, 1].loglog([], [], marker=".", linestyle="none")
    ha.set_markerfacecolor(to_rgba(ha.get_color(), 0.5))
    ax[1, 1].set_xlim([1, szx / 2])
    ax[1, 1].set_xlabel("frequency")
    ax[1, 1].set_ylabel("power (|F|^2)")

    ax[1, 0].axis("off")  # unused in buildim.m

    r_list = []
    amp_list = []

    def fourier_component(ii: int):
        """Spatial sinusoid for the ii-th sorted coefficient."""
        fx = fx_all[ii]
        fy = fy_all[ii]
        v = imf_flat[si[ii]]
        return 2 * np.real(v * np.exp(1j * 2 * np.pi * (fx * x / szx + fy * y / szy)))

    def refresh(ii_last=None):
        """Update all artists for current state. ii_last is last-added coefficient index (0-based)."""
        hi.set_data(imhat)

        if ii_last is None:
            hg.set_data(imhat)
            ax[0, 2].set_title("")
            hgf.set_data(0.5 * np.ones((szy, szx)))
        else:
            g = fourier_component(ii_last)
            hg.set_data(dc + g)
            ax[0, 2].set_title(f"i={ii_last + 1}, a={a[ii_last]:3.2f}")
            hgf.set_data(g / (2 * np.abs(imf_flat[si[ii_last]])))

        ha.set_data(r_list, amp_list)
        ax[1, 1].relim()
        ax[1, 1].autoscale_view(scalex=False, scaley=True)
        fig.canvas.draw_idle()

    def render_at(k: int):
        """Jump to exactly k coefficients by rebuilding spectrum (used on slider release)."""
        nonlocal imhat, i_current, r_list, amp_list
        i_current = int(np.clip(k, 0, n2))

        # build masked spectrum (shifted) with conjugate partners
        S = np.zeros((szy, szx), dtype=complex)
        for ii in range(i_current):
            r = int(row[ii]); c = int(col[ii])
            rc = (-r) % szy; cc = (-c) % szx
            v = imf_flat[si[ii]]
            S[r, c] = v
            S[rc, cc] = np.conj(v)

        imhat = dc * np.ones((szy, szx)) + np.real(n * np.fft.ifft2(np.fft.ifftshift(S)))
        r_list = list(r_all[:i_current])
        amp_list = list(amp_all[:i_current])
        refresh(i_current - 1 if i_current > 0 else None)

    def step_once():
        """Add one coefficient (fast path for autoplay)."""
        nonlocal imhat, i_current
        if i_current >= n2:
            return False
        ii = i_current
        imhat = imhat + fourier_component(ii)
        i_current += 1
        r_list.append(r_all[ii])
        amp_list.append(amp_all[ii])
        refresh(ii)
        return True

    # slider (update on release)
    ax_slider = plt.axes([0.15, 0.06, 0.7, 0.05])
    sli = Slider(ax_slider, "i", 0, n2, valinit=0, valstep=1)

    dragging = {"active": False}

    def on_press(event):
        if event.inaxes == ax_slider:
            dragging["active"] = True
            timer.stop()

    def on_release(event):
        if dragging["active"]:
            dragging["active"] = False
            render_at(int(sli.val))
            if i_current < n2:
                timer.start()

    fig.canvas.mpl_connect("button_press_event", on_press)
    fig.canvas.mpl_connect("button_release_event", on_release)

    # autoplay timer; pauses while user is dragging slider
    def on_timer():
        if dragging["active"]:
            return
        ok = step_once()
        if not ok:
            timer.stop()
        else:
            # keep slider in sync (this triggers on_changed, but we only redraw on release)
            sli.set_val(i_current)

    timer = fig.canvas.new_timer(interval=1)
    timer.single_shot = False
    timer.add_callback(on_timer)

    render_at(0)
    timer.start()
    plt.show(block=True)


if __name__ == "__main__":
    main()


