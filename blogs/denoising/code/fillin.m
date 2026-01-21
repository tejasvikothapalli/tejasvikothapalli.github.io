% fillin.m - fills in missing pixels of an image using 1/f^2 prior
%
% assumes im dimensions square and even
% pixels [0 255], colormap gray

% set image and size
load('einstein.mat')
im=im0;
sz=size(im,1);
npix=sz^2;

% mask of known pixels
mask=rand(sz)<0.02;
mask(:,1)=0;
mask(:,sz)=0;
mask(1,:)=0;
mask(sz,:)=0;

% initalize image estimate to known pixels minus mean
mu=mean(im(:));
imh=(im-mu).*mask;
imh=(im-mu).*mask + 40*randn(sz).*(1-mask);

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

% normalized Fourier transform of masked image and power spectrum
imf=fftshift(fft2(imh))/sqrt(npix);
imfp=abs(imf).^2;

% step size
eta=100;
T=1;     % temperature for Langevin
sqrt2Teta=sqrt(2*T*eta);

% colormap with color for missing pixels as first entry, followed by gray levels
cmap=colormap(gray);
mpcolor=[0 0 1];
cmap=[mpcolor; cmap];
colormap(cmap)

% display original image
subplot(141)
image(im+2), axis image

% display image with pixels deleted
subplot(142)
image(mask.*(im+2)), axis image

% display image estimate
subplot(143)
h=image(imh+mu+2); axis image

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
    
    % make a gradient step in missing pixels and update Fourier transform
    gradim=real(ifft2(fftshift(lambda.*imf))*sqrt(npix));
    dim = -eta*gradim; %+ sqrt2Teta*randn(sz);
    imh = imh + (1-mask).*dim;
    imf=fftshift(fft2(imh))/sqrt(npix);
    imfp=abs(imf).^2;

    % update estimated image display
    set(h,'CData',imh+mu+2)
    title(sprintf('E=%f',sum(lambda(:).*imfp(:))))

    % update power spectrum plot
    for r=1:sz/2
        P(r)=mean(imfp(ind{r}));
    end
    set(hp,'YData',P)

    drawnow

end
