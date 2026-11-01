# ForgeWeb research paper

This is an IEEE conference-style research manuscript using `IEEEtran`, based on the supplied screenshot. It is not a claim of IEEE publication or acceptance. If your department or conference provides a specific LaTeX template, apply that template before submission.

## Contents

- `main.tex`: complete manuscript and four-author block.
- `references.bib`: 25 research references, cited in the manuscript.
- `figures/`: three editable, vector TikZ diagrams (architecture, data flow, and generated-system structure).
- `REFERENCE_AUDIT.md`: source links and bibliography policy.
- `EVIDENCE.md`: scope of implementation and reported verification.

## Compile on Overleaf

Upload the source ZIP as a new project, set `main.tex` as the main document, and select pdfLaTeX. Overleaf will run BibTeX automatically. No external diagram files or API keys are required.

## Compile locally

With TeX Live or MiKTeX installed:

```sh
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

Alternatively, use `tectonic main.tex` with the Tectonic compiler. Its first run requires internet access to retrieve standard TeX packages.

## Before submission

Confirm the institutional affiliation and author ordering, add official email addresses only if required, and check your venue's page limit and anonymity rules. No email addresses or supervisor details have been invented. The evaluation deliberately distinguishes verified prototype checks from future experiments; do not replace those limitations with unsupported performance claims.
