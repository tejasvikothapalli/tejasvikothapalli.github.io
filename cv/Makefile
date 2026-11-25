# Build the CV and copy it to the file the homepage links (../data/CV_Tejasvi_Kothapalli.pdf).
# Needs a current TeX Live (fontawesome5, XCharter, biblatex + biblatex-nature), e.g. Overleaf.
# On yoru: TinyTeX in /mnt/sata/tejas/tinytex_20261124 (the system TeX Live 2019 lacks these packages).
TEXBIN ?= /mnt/sata/tejas/tinytex_20261124/.TinyTeX/bin/x86_64-linux

pdf:
	$(TEXBIN)/pdflatex -interaction=nonstopmode -halt-on-error resume.tex
	cp resume.pdf ../data/CV_Tejasvi_Kothapalli.pdf

clean:
	rm -f resume.aux resume.log resume.out resume.bcf resume.run.xml resume.pdf

.PHONY: pdf clean
