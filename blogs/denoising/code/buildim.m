% This code was writen by Bruno Olshausen
% buildim.m - build up image one Fourier component at a time
%
% assumes im defined, even dimensions and square, pixel vals [0 255]
%
% colormap gray

% set image
im=im0;

% dimensions
[szy, szx]=size(im);
n=szx*szy;

% compute normalized Fourier coefficients
imf=fftshift(fft2(im))/n;

% x,y coordinate arrays
[x y]=meshgrid(0:szx-1,0:szy-1);

% extract and save dc component
dc=real(imf(szy/2+1,szx/2+1));
imf(szy/2+1,szx/2+1)=0;

% sort Fourier coefficients by largest to smallest magnitudes
% (only over half of the Fourier plane to remove redundancy due to hermitian symmetry)
[a, si]=sort(abs(imf(1:(n/2+szy/2))),'descend');

% initialize reconstruction
imhat=dc*ones(szy,szx);

% initialize displays
subplot(231)
imagesc(im,[0 255]), axis image
title('original')

subplot(232)
hi=imagesc(imhat,[0 255]); axis image
title('reconstruction')

subplot(233)
hg=imagesc(imhat,[0 255]); axis image

subplot(236)
hgf=imagesc(0.5*ones(szy,szx),[-1 1]); axis image
title('full contrast')

subplot(235)
loglog([1 szx/2],1./[1 szx/2],'k--');
ha=animatedline;
ha.Marker='.';
ha.LineStyle='none';

% loop over sorted Fourier coefficients
for i=1:n/2

    % get frequency coordinates
    fy=mod(si(i)-1,szy)-szy/2;
    fx=floor((si(i)-1)/szy)-szx/2;
    
    % render Fourier component and add to reconstruction
    g=2*real(imf(si(i)).*exp(j*2*pi*(fx*x/szx+fy*y/szy)));
    imhat=imhat+g;
    
    % show reconstruction
    set(hi,'CData',imhat)

    % show this Fourier component
    set(hg,'CData',dc+g)
    subplot(233), title(sprintf('i=%d, a=%3.2f',i,a(i)))
    set(hgf,'CData',g/(2*abs(imf(si(i)))));

    % plot on amplitude spectrum
    addpoints(ha,sqrt(fx^2+fy^2),2*abs(imf(si(i))));

    drawnow
    input('')

end
