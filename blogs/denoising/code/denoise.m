% denoise.m - denoise an image using 1/f^2 prior
%
% assumes im dimensions square and even
% pixels [0 255], colormap gray

% set image and size
im=im0;
sz=size(im,1);
npix=sz^2;

% image mean and variance
mu=mean(im(:));
sigma2_im=var(im(:));

% SNR
SNR=0.1;

% noisy zero-mean image
sigma2_noise=sigma2_im/SNR;
noise=sqrt(sigma2_noise)*randn(sz);
nim=im-mu+noise;

% frequency coordinates
f=-sz/2:sz/2-1;
rho2=f'.^2+f.^2;
rho=round(sqrt(rho2));
f1=1:sz/2;

% compute k s.t. sum of pixel variances = k * sum of 1/f^2 variances
rho2_0=rho2;
rho2_0(sz/2+1,sz/2+1)=10^8;  % to avoid divide by zero
k=sum((im(:)-mu).^2)/sum(1./rho2_0(:));
lambda=(rho2/k);

% normalized Fourier transform of noisy image and power spectrum
imf=fftshift(fft2(nim))/sqrt(npix);
imfp=abs(imf).^2;
nimf=imf;

% step size
eta=0.1;
T=1.0;     % temperature for Langevin

% colormap 
colormap(gray);

% display original image
subplot(141)
image(im), axis image

% display noisy image
subplot(142)
image(mu+nim), axis image

% display image estimate
subplot(143)
h=image(mu+nim); axis image

% plot rotionally averaged power spectrum
subplot(144)
ind=cell(sz/2,1);
P=zeros(sz/2,1);
for r=1:sz/2
  ind{r}=find(rho==r);
  P(r)=mean(imfp(ind{r}));
end
loglog(f1,k./f1.^2,'k--'), hold on
hp=loglog(f1,P,'LineWidth',2); 
hold off

while 1
    
    % make a gradient step in Fourier domain
    H = (1/sigma2_noise+lambda);
    gradimf = -nimf/sigma2_noise + H.*imf;
    dimf = -(eta./H).*gradimf;  % + sqrt(2*T*eta./H).*randn(sz);
    imf = imf + dimf;
    imfp = abs(imf).^2;
    
    % reconstruction
    imh = real(sqrt(npix)*ifft2(fftshift(imf)));

    % update estimated image display
    set(h,'CData',mu+imh)
    title(sprintf('E=%f',sum(lambda(:).*imfp(:))))

    % update power spectrum plot
    for r=1:sz/2
        P(r)=mean(imfp(ind{r}));
    end
    set(hp,'YData',P)

    drawnow

end
