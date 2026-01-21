import numpy as np
def PSNR(A, B):
    """
    PURPOSE: To find the PSNR (peak signal-to-noise ratio) between two
             intensity images A and B, each having values in the interval
             [0,1]. The answer is in decibels (dB).
    
    SYNOPSIS: PSNR(A,B)
    
    DESCRIPTION: The following is quoted from "Fractal Image Compression",
                 by Yuval Fisher et al.,(Springer Verlag, 1995),
                 section 2.4, "Pixelized Data".
    
                 "...PSNR is used to measure the difference between two
                 images. It is defined as
    
                              PSNR = 20 * log10(b/rms)
    
                 where b is the largest possible value of the signal
                 (typically 255 or 1), and rms is the root mean square
                 difference between two images. The PSNR is given in
                 decibel units (dB), which measure the ratio of the peak 
                 signal and the difference between two images. An increase
                 of 20 dB corresponds to a ten-fold decrease in the rms
                 difference between two images.
                 
                 There are many versions of signal-to-noise ratios, but
                 the PSNR is very common in image processing, probably
                 because it gives better-sounding numbers than other
                 measures."
    
    EXAMPLE 1: load clown
               A = ind2gray(X,map); % Convert to an intensity image in [0,1].
               B = 0.95 * A;        % Make B close to, but different from, A.
               PSNR(A,B)            % ---> "PSNR = +33.49 dB"
    
    EXAMPLE 2: A = rand(256); % A is a random 256 X 256 matrix in [0,1].
               B = 0.9 * A;   % Make B close to, but different from, A.
               PSNR(A,B)      % ---> "PSNR = +24.76 dB (approx)"
    """
    
    if np.array_equal(A, B):
        raise ValueError('Images are identical: PSNR has infinite value')
    
    A = np.clip(A, 0, 1)
    B = np.clip(B, 0, 1)
    
    # max2_A = np.max(A)
    # max2_B = np.max(B)
    # min2_A = np.min(A)
    # 
    # if max2_A > 1 | max2_B > 1 | min2_A < 0 | min2_B < 0:
    #    raise ValueError('input matrices must have values in the interval [0,1]')
    
    Error = (A - B) ** 2
    decibels = 20 * np.log10(1 / (np.sqrt(np.mean(Error.flatten()))))
    # print(f'PSNR = +{decibels:5.2f} dB')
    
    return decibels